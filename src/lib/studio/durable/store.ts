import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../supabase/admin.ts";
import { StudioError } from "../contracts.ts";
import type { AssetRow, FreshGeneration, ImageMetadata, JobRow, QuotaState, StudioStore } from "./types.ts";

const errors: Record<string, [string, string, number]> = {
  STUDIO_DISABLED: ["GENERATION_DISABLED", "Image generation is currently paused.", 503],
  STUDIO_GLOBAL_LIMIT: ["GLOBAL_QUOTA_EXCEEDED", "The studio's generation allowance has been used.", 429],
  STUDIO_USER_LIMIT: ["USER_QUOTA_EXCEEDED", "This browser has used its generation allowance.", 429],
  STUDIO_NETWORK_LIMIT: ["NETWORK_QUOTA_EXCEEDED", "This network has used its generation allowance.", 429],
  STUDIO_BUSY: ["STUDIO_BUSY", "The studio is busy. Try again shortly.", 429],
  STUDIO_RATE_LIMIT: ["RATE_LIMITED", "Please wait a moment before generating another image.", 429],
  STUDIO_REQUEST_CONFLICT: ["REQUEST_CONFLICT", "This request was already used with different settings. Start a new request.", 409],
  STUDIO_INVALID_REFERENCE: ["INVALID_REFERENCE", "Choose an available image from this browser's library.", 400],
  STUDIO_REFERENCE_LIMIT: ["REFERENCE_LIMIT", "The reference upload allowance has been reached.", 429],
  STUDIO_INVALID_INPUT: ["INVALID_INPUT", "Check your image settings and try again.", 400],
  STUDIO_JOB_NOT_FOUND: ["JOB_NOT_FOUND", "This generation is no longer available.", 404],
  STUDIO_ASSET_NOT_FOUND: ["ASSET_NOT_FOUND", "This image is no longer available.", 404],
  STUDIO_STATE_CONFLICT: ["STATE_CONFLICT", "This generation has already moved to another stage.", 409],
};

function databaseError(error: { message: string } | null): never {
  const safe = error && errors[error.message];
  if (safe) throw new StudioError(...safe);
  throw new StudioError("PERSISTENCE_UNAVAILABLE", "The image studio could not save or load this request. Try again shortly.", 503);
}

/** Privileged repository. Callers must establish ownership before invoking worker mutations. */
export function createStudioStore(client: SupabaseClient = createAdminClient()): StudioStore {
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error || data === null) databaseError(error);
    return data as T;
  }

  return {
    async findJob(id, ownerId) {
      let query = client.from("generation_jobs").select("*").eq("id", id);
      if (ownerId) query = query.eq("user_id", ownerId);
      const { data, error } = await query.maybeSingle();
      if (error) databaseError(error);
      return data as JobRow | null;
    },
    async listJobs(ownerId) {
      // Quota bounds total jobs to 20; keep active jobs and recent terminal jobs together.
      const { data, error } = await client.from("generation_jobs").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(24);
      if (error) databaseError(error);
      return data as JobRow[];
    },
    async findAsset(id, ownerId) {
      let query = client.from("assets").select("*").eq("id", id).eq("ready", true);
      if (ownerId) query = query.eq("user_id", ownerId);
      const { data, error } = await query.maybeSingle();
      if (error) databaseError(error);
      return data as AssetRow | null;
    },
    async listAssets(ownerId) {
      const { data, error } = await client.from("assets").select("*").eq("user_id", ownerId).eq("kind", "generated").eq("ready", true).order("created_at", { ascending: false }).limit(24);
      if (error) databaseError(error);
      return data as AssetRow[];
    },
    reserveJob: (ownerId: string, input: FreshGeneration, abuseKey: string) => rpc("studio_reserve_job", {
      p_owner_id: ownerId, p_request_id: input.requestId, p_model: input.model, p_prompt: input.prompt,
      p_aspect_ratio: input.aspectRatio, p_resolution: input.resolution,
      p_reference_asset_id: input.referenceAssetId, p_abuse_key: abuseKey,
    }),
    async linkRun(jobId, runId, state) {
      await rpc("studio_link_run", { p_job_id: jobId, p_run_id: runId, p_state: state });
    },
    claimJob: (jobId, runId) => rpc("studio_claim_job", { p_job_id: jobId, p_run_id: runId }),
    beginProvider: (jobId, runId) => rpc("studio_begin_provider", { p_job_id: jobId, p_run_id: runId }),
    async saveOutputMetadata(jobId, runId, metadata) {
      await rpc("studio_save_output_metadata", { p_job_id: jobId, p_run_id: runId, p_metadata: metadata });
    },
    completeJob: (jobId: string, runId: string, metadata: ImageMetadata) => rpc("studio_complete_job", { p_job_id: jobId, p_run_id: runId, p_metadata: metadata }),
    async failJob(jobId, runId, error, uncertain) {
      await rpc("studio_fail_job", { p_job_id: jobId, p_run_id: runId, p_error_code: error.code, p_error_message: error.message, p_uncertain: uncertain });
    },
    reserveReference: (ownerId, requestId, filename, metadata, abuseKey) => rpc("studio_reserve_reference", { p_owner_id: ownerId, p_request_id: requestId, p_filename: filename, p_metadata: metadata, p_abuse_key: abuseKey }),
    completeReference: (assetId, ownerId) => rpc("studio_complete_reference", { p_asset_id: assetId, p_owner_id: ownerId }),
    getQuota: () => rpc<QuotaState>("studio_get_quota"),
  };
}
