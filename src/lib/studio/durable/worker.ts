import { StudioError, type GenerationInput } from "../contracts.ts";
import { generateStudioImage } from "../provider-core.ts";
import { inspectOutput, normalizeReference } from "../image-processing.ts";
import { BUCKET, outputPath, type ImageMetadata, type JobStatus, type StudioStore } from "./types.ts";

export type WorkerStorage = {
  download(path: string): Promise<Uint8Array | null>;
  /** Must create only, with upsert disabled. */
  upload(path: string, bytes: Uint8Array, mediaType: ImageMetadata["mediaType"]): Promise<void>;
};
export type WorkerDependencies = {
  store: StudioStore;
  storage: WorkerStorage;
  provider: typeof generateStudioImage;
  stage?: (stage: JobStatus, jobId: string, assetId?: string) => void | Promise<void>;
  pause?: (milliseconds: number) => Promise<void>;
};
export type WorkerResult = { jobId: string; assetId?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateTaskPayload(value: unknown): { jobId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("jobId" in value) || typeof value.jobId !== "string" || !uuid.test(value.jobId)) {
    throw new StudioError("INVALID_TASK", "The image task payload is invalid.");
  }
  return { jobId: value.jobId };
}

const failures: Record<string, string> = {
  INVALID_REFERENCE: "The reference image could not be read. Choose another reference.",
  NO_IMAGE: "The model could not create this image. Try a different description or reference.",
  INVALID_OUTPUT: "The generated image could not be decoded. No retry was sent.",
  PROVIDER_BUSY: "Google is busy or the provider allowance is exhausted. Please try later.",
  TIMEOUT: "Generation timed out and may have used provider credits. No retry was sent.",
  PROVIDER_ERROR: "Image generation is unavailable right now. No retry was sent.",
  PERSISTENCE_UNCERTAIN: "The saved image could not be confirmed. This attempt remains counted; no new generation was sent.",
  WORKER_STOPPED: "The task stopped before an image could be confirmed. No retry was sent.",
};
function safeFailure(error: unknown) {
  const code = error instanceof StudioError && Object.hasOwn(failures, error.code) ? error.code : "WORKER_STOPPED";
  return { code, message: failures[code] };
}
async function retryPersistence<T>(deps: WorkerDependencies, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch { if (attempt === 2) throw new StudioError("PERSISTENCE_UNCERTAIN", failures.PERSISTENCE_UNCERTAIN, 503); }
    await (deps.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(100 * 2 ** attempt);
  }
}
async function report(deps: WorkerDependencies, stage: JobStatus, jobId: string, assetId?: string) {
  // Realtime is advisory. A failed metadata update cannot reissue paid work.
  try { await deps.stage?.(stage, jobId, assetId); } catch { /* Durable rows remain authoritative. */ }
}
function sameMetadata(actual: ImageMetadata, expected: ImageMetadata) {
  return actual.sha256 === expected.sha256 && actual.bytes === expected.bytes && actual.width === expected.width && actual.height === expected.height && actual.mediaType === expected.mediaType;
}
async function verifyObject(deps: WorkerDependencies, path: string, expected: ImageMetadata): Promise<boolean> {
  const bytes = await retryPersistence(deps, () => deps.storage.download(path));
  if (!bytes) return false;
  try { return sameMetadata(await inspectOutput(bytes, expected.mediaType, expected.providerModel), expected); }
  catch { return false; }
}
async function saveObject(deps: WorkerDependencies, path: string, bytes: Uint8Array, metadata: ImageMetadata) {
  await retryPersistence(deps, async () => {
    try { await deps.storage.upload(path, bytes, metadata.mediaType); }
    catch {
      // The upload might have committed before its response was lost. Never
      // overwrite the deterministic object or repeat the provider operation.
      if (!await verifyObject(deps, path, metadata)) throw new StudioError("PERSISTENCE_UNCERTAIN", failures.PERSISTENCE_UNCERTAIN, 503);
    }
  });
}

export async function runGenerationJob(jobId: string, executionRunId: string, deps: WorkerDependencies): Promise<WorkerResult> {
  validateTaskPayload({ jobId });
  const { job, claimed } = await retryPersistence(deps, () => deps.store.claimJob(jobId, executionRunId));
  if (!claimed) return { jobId, ...(job.asset_id ? { assetId: job.asset_id } : {}) };
  let providerMayHaveDispatched = false;
  let objectSaved = false;
  try {
    await report(deps, "preparing", jobId);
    let reference: { bytes: Uint8Array; mediaType: string } | undefined;
    if (job.reference_asset_id) {
      const asset = await retryPersistence(deps, () => deps.store.findAsset(job.reference_asset_id!, job.user_id));
      if (!asset?.ready || asset.user_id !== job.user_id || !asset.storage_path.startsWith(`${job.user_id}/`)) throw new StudioError("INVALID_REFERENCE", failures.INVALID_REFERENCE);
      const bytes = await retryPersistence(deps, () => deps.storage.download(asset.storage_path));
      if (!bytes) throw new StudioError("INVALID_REFERENCE", failures.INVALID_REFERENCE);
      const actual = await inspectOutput(bytes, asset.media_type, asset.provider_model);
      if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.byte_size || actual.width !== asset.width || actual.height !== asset.height) throw new StudioError("INVALID_REFERENCE", failures.INVALID_REFERENCE);
      const normalized = await normalizeReference(bytes, { generated: asset.kind === "generated" });
      reference = { bytes: normalized.bytes, mediaType: normalized.metadata.mediaType };
    }
    // An ambiguous CAS response must fail closed: it may already have marked
    // the provider call attempted. Do not retry this boundary or call Google.
    providerMayHaveDispatched = true;
    if (!await deps.store.beginProvider(jobId, executionRunId)) return { jobId };
    await report(deps, "generating", jobId);
    const input: GenerationInput = { requestId: job.request_id, model: job.model, prompt: job.prompt, aspectRatio: job.aspect_ratio, resolution: job.resolution };
    const result = await deps.provider(input, reference);
    const metadata = await inspectOutput(result.bytes, result.mediaType, result.providerModel);
    await retryPersistence(deps, () => deps.store.saveOutputMetadata(jobId, executionRunId, metadata));
    await report(deps, "saving", jobId);
    await saveObject(deps, outputPath(job.user_id, jobId), result.bytes, metadata);
    objectSaved = true;
    const asset = await retryPersistence(deps, () => deps.store.completeJob(jobId, executionRunId, metadata));
    await report(deps, "completed", jobId, asset.id);
    return { jobId, assetId: asset.id };
  } catch (error) {
    if (objectSaved) {
      // Preserve the saving journal so terminal-run reconciliation can complete
      // metadata independently of the paid request, including a lost DB reply.
      return { jobId };
    }
    await retryPersistence(deps, () => deps.store.failJob(jobId, executionRunId, safeFailure(error), providerMayHaveDispatched));
    await report(deps, "failed", jobId);
    return { jobId };
  }
}

/** Caller must first establish that the stored Trigger run is terminal. Never
 * invoke from a duplicate task event: the original run may still be working. */
export async function recoverJob(jobId: string, deps: WorkerDependencies): Promise<WorkerResult> {
  validateTaskPayload({ jobId });
  const job = await retryPersistence(deps, () => deps.store.findJob(jobId));
  if (!job) throw new StudioError("JOB_NOT_FOUND", "This generation could not be found.", 404);
  if (job.status === "completed") return { jobId, ...(job.asset_id ? { assetId: job.asset_id } : {}) };
  if (job.output_metadata && job.execution_run_id && await verifyObject(deps, outputPath(job.user_id, jobId), job.output_metadata)) {
    const asset = await retryPersistence(deps, () => deps.store.completeJob(jobId, job.execution_run_id!, job.output_metadata!));
    await report(deps, "completed", jobId, asset.id);
    return { jobId, assetId: asset.id };
  }
  // No recoverable object after dispatch is an unknown paid outcome. Accounting
  // remains consumed and this helper never invokes the provider or uploads.
  const uncertain = !!job.provider_dispatched_at;
  await retryPersistence(deps, () => deps.store.failJob(jobId, job.execution_run_id, safeFailure(new StudioError(uncertain ? "PERSISTENCE_UNCERTAIN" : "WORKER_STOPPED", "")), uncertain));
  await report(deps, "failed", jobId);
  return { jobId };
}

export async function createWorkerDependencies(stage?: WorkerDependencies["stage"]): Promise<WorkerDependencies> {
  const [{ createAdminClient }, { createStudioStore }] = await Promise.all([import("../../supabase/admin.ts"), import("./store.ts")]);
  const bucket = createAdminClient().storage.from(BUCKET);
  return {
    store: createStudioStore(), provider: generateStudioImage, stage,
    storage: {
      async download(path) {
        const { data, error } = await bucket.download(path);
        if (error) {
          const status = Number((error as { statusCode?: string | number }).statusCode);
          if (status === 404 || (error as { error?: string }).error === "not_found") return null;
          throw new StudioError("PERSISTENCE_UNCERTAIN", failures.PERSISTENCE_UNCERTAIN, 503);
        }
        if (!data || data.size > 16 * 1024 * 1024) throw new StudioError("PERSISTENCE_UNCERTAIN", failures.PERSISTENCE_UNCERTAIN, 503);
        return new Uint8Array(await data.arrayBuffer());
      },
      async upload(path, bytes, mediaType) {
        const { error } = await bucket.upload(path, bytes, { contentType: mediaType, upsert: false, cacheControl: "0" });
        if (error) throw new StudioError("PERSISTENCE_UNCERTAIN", failures.PERSISTENCE_UNCERTAIN, 503);
      },
    },
  };
}
