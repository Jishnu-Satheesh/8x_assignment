import type { AspectRatio, ModelId, Resolution } from "../contracts.ts";

export const BUCKET = "studio-private";
export type JobStatus = "queued" | "preparing" | "generating" | "saving" | "completed" | "failed";
export type ImageMetadata = { sha256: string; bytes: number; width: number; height: number; mediaType: "image/png" | "image/jpeg" | "image/webp"; providerModel: string | null };
export type FreshGeneration = { requestId: string; model: ModelId; prompt: string; aspectRatio: AspectRatio; resolution: Resolution; referenceAssetId: string | null };
export type JobRow = {
  id: string; user_id: string; request_id: string; model: ModelId; prompt: string;
  aspect_ratio: AspectRatio; resolution: Resolution; reference_asset_id: string | null;
  status: JobStatus; dispatch_status: "pending" | "sent" | "uncertain";
  trigger_run_id: string | null; execution_run_id: string | null;
  provider_dispatched_at: string | null; output_metadata: ImageMetadata | null;
  asset_id: string | null; error_code: string | null; error_message: string | null;
  uncertain: boolean; created_at: string; updated_at: string;
};
export type AssetRow = {
  id: string; user_id: string; kind: "generated" | "reference"; ready: boolean;
  generation_job_id: string | null; storage_path: string; filename: string;
  prompt: string | null; model: ModelId | null; aspect_ratio: AspectRatio | null;
  resolution: Resolution | null; reference_asset_id: string | null; provider_model: string | null;
  media_type: ImageMetadata["mediaType"]; width: number; height: number; byte_size: number;
  sha256: string; created_at: string;
};
export type QuotaState = { enabled: boolean; consumed: number; global_limit: number; user_limit: number };
export interface StudioStore {
  findJob(id: string, ownerId?: string): Promise<JobRow | null>;
  listJobs(ownerId: string): Promise<JobRow[]>;
  findAsset(id: string, ownerId?: string): Promise<AssetRow | null>;
  listAssets(ownerId: string): Promise<AssetRow[]>;
  reserveJob(ownerId: string, input: FreshGeneration, abuseKey: string): Promise<{ job: JobRow; created: boolean }>;
  linkRun(jobId: string, runId: string | null, state: JobRow["dispatch_status"]): Promise<void>;
  claimJob(jobId: string, runId: string): Promise<{ job: JobRow; claimed: boolean }>;
  beginProvider(jobId: string, runId: string): Promise<boolean>;
  saveOutputMetadata(jobId: string, runId: string, metadata: ImageMetadata): Promise<void>;
  completeJob(jobId: string, runId: string, metadata: ImageMetadata): Promise<AssetRow>;
  failJob(jobId: string, runId: string | null, error: { code: string; message: string }, uncertain: boolean): Promise<void>;
  reserveReference(ownerId: string, requestId: string, filename: string, metadata: ImageMetadata, abuseKey: string): Promise<AssetRow>;
  completeReference(assetId: string, ownerId: string): Promise<AssetRow>;
  getQuota(): Promise<QuotaState>;
}
export const outputPath = (ownerId: string, jobId: string) => `${ownerId}/generated/${jobId}/image`;

export type StudioAsset = {
  id: string; jobId: string; source: "ai-generated"; provider: "google";
  model: ModelId; providerModel: string | null; prompt: string; aspectRatio: AspectRatio; resolution: Resolution;
  createdAt: string; width: number; height: number; mediaType: ImageMetadata["mediaType"];
  imageUrl: string; downloadUrl: string; referenceAssetId: string | null;
};
export type StudioJob = {
  id: string; status: JobStatus; runId: string | null; createdAt: string;
  error: { code: string; message: string; uncertain: boolean } | null; asset: StudioAsset | null;
};
