import type { AssetRow, JobRow, StudioAsset, StudioJob } from "./types.ts";

export function presentAsset(asset: AssetRow): StudioAsset {
  if (asset.kind !== "generated" || !asset.ready || !asset.model || !asset.aspect_ratio || !asset.resolution || !asset.generation_job_id) throw new Error("Asset is not a completed generation");
  return { id: asset.id, jobId: asset.generation_job_id, source: "ai-generated", provider: "google", model: asset.model, providerModel: asset.provider_model, prompt: asset.prompt ?? "", aspectRatio: asset.aspect_ratio, resolution: asset.resolution, createdAt: asset.created_at, width: asset.width, height: asset.height, mediaType: asset.media_type, imageUrl: `/api/image-studio/assets/${asset.id}/image`, downloadUrl: `/api/image-studio/assets/${asset.id}/download`, referenceAssetId: asset.reference_asset_id };
}
export function presentJob(job: JobRow, asset: AssetRow | null): StudioJob {
  const completed = job.status === "completed" && asset?.ready && asset.generation_job_id === job.id;
  return { id: job.id, requestId: job.request_id, status: job.status === "completed" && !completed ? "saving" : job.status, runId: job.trigger_run_id ?? job.execution_run_id, createdAt: job.created_at, error: job.status === "failed" ? { code: job.error_code ?? "GENERATION_FAILED", message: job.error_message ?? "This image could not be completed.", uncertain: job.uncertain } : null, asset: completed ? presentAsset(asset) : null };
}
