import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { StudioError } from "../contracts.ts";
import { inspectOutput } from "../image-processing.ts";
import type { AssetRow, JobRow, StudioStore } from "./types.ts";
import { outputPath } from "./types.ts";
import { recoverJob, runGenerationJob, validateTaskPayload, type WorkerDependencies } from "./worker.ts";

const jobId = "90d69ef4-1745-4a66-b3a9-953c8af79f17";
const ownerId = "6bbeebcc-1666-4ad6-b3df-679152726db2";
const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "coral" } }).webp().toBuffer();
const metadata = await inspectOutput(image, "image/webp", "gemini-3-pro-image");
function harness() {
  const job: JobRow = { id: jobId, user_id: ownerId, request_id: jobId, model: "gemini-3-pro-image", prompt: "private prompt", aspect_ratio: "1:1", resolution: "1K", reference_asset_id: null, status: "queued", dispatch_status: "sent", trigger_run_id: "run-original", execution_run_id: null, provider_dispatched_at: null, output_metadata: null, asset_id: null, error_code: null, error_message: null, uncertain: false, created_at: "", updated_at: "" };
  const objects = new Map<string, Uint8Array>();
  const calls = { provider: 0, upload: 0, finalize: 0, journal: 0, failed: 0 };
  const asset = { id: "asset-id" } as AssetRow;
  const store = {
    async findJob() { return { ...job }; },
    async claimJob(_id: string, runId: string) {
      const claimed = !job.execution_run_id && job.status === "queued";
      if (claimed) { job.execution_run_id = runId; job.status = "preparing"; }
      return { job: { ...job }, claimed };
    },
    async beginProvider(_id: string, runId: string) {
      if (job.provider_dispatched_at || job.execution_run_id !== runId) return false;
      job.provider_dispatched_at = "dispatched"; job.status = "generating"; return true;
    },
    async saveOutputMetadata(_id: string, _run: string, value: typeof metadata) { calls.journal++; job.output_metadata = value; job.status = "saving"; },
    async completeJob() { calls.finalize++; job.status = "completed"; job.asset_id = asset.id; return asset; },
    async failJob(_id: string, _run: string | null, error: { code: string; message: string }, uncertain: boolean) { calls.failed++; job.status = "failed"; job.error_code = error.code; job.error_message = error.message; job.uncertain = uncertain; },
  } as unknown as StudioStore;
  const deps: WorkerDependencies = {
    store,
    storage: {
      async download(path) { return objects.get(path) ?? null; },
      async upload(path, bytes) { calls.upload++; assert.ok(job.output_metadata, "journal must precede upload"); if (objects.has(path)) throw new Error("already exists"); objects.set(path, bytes); },
    },
    async provider() { calls.provider++; return { bytes: image, mediaType: "image/webp", providerModel: "gemini-3-pro-image" }; },
    pause: async () => {},
  };
  return { job, objects, calls, deps };
}
test("payload accepts only one UUID jobId, rejecting prompts and owner overrides", () => {
  assert.deepEqual(validateTaskPayload({ jobId }), { jobId });
  for (const value of [{ jobId, prompt: "private" }, { jobId: "invalid" }, { jobId, userId: ownerId }, null]) assert.throws(() => validateTaskPayload(value));
});
test("duplicate task events and manual replay never issue another provider request", async () => {
  const h = harness();
  assert.deepEqual(await runGenerationJob(jobId, "run-original", h.deps), { jobId, assetId: "asset-id" });
  await runGenerationJob(jobId, "run-original", h.deps);
  await runGenerationJob(jobId, "run-manual", h.deps);
  assert.equal(h.calls.provider, 1);
  assert.equal(h.calls.upload, 1);
  assert.equal(h.calls.failed, 0);
});
test("an active duplicate returns without recovery or mutating the original run", async () => {
  const h = harness(); h.job.execution_run_id = "run-original"; h.job.status = "generating"; h.job.provider_dispatched_at = "marker";
  await runGenerationJob(jobId, "run-replay", h.deps);
  assert.equal(h.calls.provider, 0); assert.equal(h.calls.failed, 0); assert.equal(h.job.status, "generating");
});
test("provider timeout remains consumed and returns a canonical safe failure without replay", async () => {
  const h = harness(); h.deps.provider = async () => { h.calls.provider++; throw new StudioError("TIMEOUT", "PRIVATE API KEY"); };
  await runGenerationJob(jobId, "run-original", h.deps);
  await runGenerationJob(jobId, "run-replay", h.deps);
  assert.equal(h.calls.provider, 1); assert.equal(h.job.uncertain, true);
  assert.equal(h.job.error_code, "TIMEOUT"); assert.ok(!h.job.error_message?.includes("PRIVATE"));
});
test("safe upload and finalization retries preserve a single paid request", async () => {
  const h = harness(); const upload = h.deps.storage.upload; const complete = h.deps.store.completeJob;
  let uploads = 0, finals = 0;
  h.deps.storage.upload = async (...args) => { if (++uploads === 1) throw new Error("temporary"); return upload(...args); };
  h.deps.store.completeJob = async (...args) => { if (++finals === 1) throw new Error("temporary"); return complete(...args); };
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(h.job.status, "completed"); assert.equal(uploads, 2); assert.equal(finals, 2); assert.equal(h.calls.provider, 1);
});
test("ambiguous upload verifies the existing object instead of overwriting or replaying", async () => {
  const h = harness(); h.deps.storage.upload = async (path, bytes) => { h.calls.upload++; h.objects.set(path, bytes); throw new Error("response lost"); };
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(h.job.status, "completed"); assert.equal(h.calls.upload, 1); assert.equal(h.calls.provider, 1);
});
test("terminal-run recovery finalizes a journaled verified object with no provider request", async () => {
  const h = harness(); h.job.execution_run_id = "run-original"; h.job.provider_dispatched_at = "marker"; h.job.status = "saving"; h.job.output_metadata = metadata;
  h.objects.set(outputPath(ownerId, jobId), image);
  assert.deepEqual(await recoverJob(jobId, h.deps), { jobId, assetId: "asset-id" });
  assert.equal(h.calls.provider, 0); assert.equal(h.calls.upload, 0); assert.equal(h.job.status, "completed");
});
test("terminal crash after the provider marker without an object fails uncertain without Gemini", async () => {
  const h = harness(); h.job.execution_run_id = "run-original"; h.job.provider_dispatched_at = "marker"; h.job.status = "generating";
  await recoverJob(jobId, h.deps);
  assert.equal(h.calls.provider, 0); assert.equal(h.job.uncertain, true); assert.equal(h.job.status, "failed");
});
test("recovery never finalizes mismatched bytes and preserves uncertainty", async () => {
  const h = harness(); h.job.execution_run_id = "run-original"; h.job.provider_dispatched_at = "marker"; h.job.status = "saving"; h.job.output_metadata = metadata;
  h.objects.set(outputPath(ownerId, jobId), Buffer.from("wrong"));
  await recoverJob(jobId, h.deps);
  assert.equal(h.calls.finalize, 0); assert.equal(h.calls.provider, 0); assert.equal(h.job.uncertain, true);
});
test("an ambiguous provider marker never calls Google and retains uncertainty", async () => {
  const h = harness();
  h.deps.store.beginProvider = async () => { h.job.provider_dispatched_at = "marker"; throw new Error("PRIVATE CONNECTION DETAIL"); };
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(h.calls.provider, 0); assert.equal(h.job.uncertain, true); assert.equal(h.job.status, "failed");
  assert.ok(!h.job.error_message?.includes("PRIVATE"));
});
test("failed metadata persistence never uploads or reissues the provider request", async () => {
  const h = harness(); let journals = 0;
  h.deps.store.saveOutputMetadata = async () => { journals++; throw new Error("PRIVATE DB DETAIL"); };
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(journals, 3); assert.equal(h.calls.provider, 1); assert.equal(h.calls.upload, 0); assert.equal(h.job.uncertain, true);
});
test("exhausted finalization leaves saving metadata available for terminal recovery", async () => {
  const h = harness(); const complete = h.deps.store.completeJob;
  h.deps.store.completeJob = async () => { throw new Error("database unavailable"); };
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(h.job.status, "saving"); assert.ok(h.job.output_metadata); assert.equal(h.calls.failed, 0);
  h.deps.store.completeJob = complete;
  await recoverJob(jobId, h.deps);
  assert.equal(h.job.status, "completed"); assert.equal(h.calls.provider, 1);
});
test("a denied provider CAS exits without a paid request or failing another execution", async () => {
  const h = harness(); h.deps.store.beginProvider = async () => false;
  await runGenerationJob(jobId, "run-original", h.deps);
  assert.equal(h.calls.provider, 0); assert.equal(h.calls.failed, 0);
});
test("only a verified owned generated asset opts into the larger reference bounds", async () => {
  const bytes = await sharp({ create: { width: 1400, height: 1400, channels: 3, background: "coral" } }).png({ compressionLevel: 0 }).toBuffer();
  const info = await inspectOutput(bytes, "image/png", "gemini-3-pro-image");
  for (const scenario of ["generated", "reference", "wrong-owner", "wrong-hash", "wrong-format"] as const) {
    const h = harness(); const path = `${ownerId}/generated/reference/image`; h.job.reference_asset_id = "reference-id";
    const asset = { id: "reference-id", user_id: scenario === "wrong-owner" ? "someone-else" : ownerId, kind: scenario === "reference" ? "reference" : "generated", ready: true, storage_path: path, media_type: scenario === "wrong-format" ? "image/webp" : info.mediaType, width: info.width, height: info.height, byte_size: info.bytes, sha256: scenario === "wrong-hash" ? "wrong" : info.sha256, provider_model: info.providerModel } as AssetRow;
    h.objects.set(path, bytes); h.deps.store.findAsset = async () => asset;
    const provider = h.deps.provider;
    h.deps.provider = async (input, reference) => { assert.ok(reference); assert.equal(reference.mediaType, "image/webp"); assert.ok(reference.bytes.length < 5 * 1024 * 1024); return provider(input, reference); };
    await runGenerationJob(jobId, "run-original", h.deps);
    assert.equal(h.calls.provider, scenario === "generated" ? 1 : 0, scenario);
    assert.equal(h.job.status, scenario === "generated" ? "completed" : "failed", scenario);
  }
});
