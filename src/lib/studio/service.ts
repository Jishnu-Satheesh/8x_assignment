import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import verification from "../../../docs/phase2-model-verification.json";
import { MODELS, StudioError, type GeneratedAsset, type GenerationInput, type ModelId, type StudioAvailability } from "./contracts.ts";
import { generateStudioImage } from "./provider.ts";
import { finishAttempt, reserveAttempt, verifyLineage } from "./usage.ts";

export function availability(): StudioAvailability {
  const enabledModels = MODELS.filter(m => verification.results.some(r => r.model === m.id && r.passed)).map(m => m.id) as ModelId[];
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { enabledModels, available: false, reason: "Image generation needs a server-side Gemini key. Ask the workspace owner to configure it." };
  // A single durable Node host is supported. Ephemeral/serverless ledgers cannot enforce the global cap.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || (process.env.NODE_ENV === "production" && (process.env.STUDIO_DURABLE_SINGLE_HOST !== "true" || !process.env.STUDIO_DATA_DIR || !isAbsolute(process.env.STUDIO_DATA_DIR)))) return { enabledModels, available: false, reason: "Generation is disabled until this deployment has a durable usage safeguard." };
  return { enabledModels, available: enabledModels.length > 0, ...(enabledModels.length ? {} : { reason: "No image models have passed verification yet." }) };
}
function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export async function runGeneration(input: GenerationInput): Promise<GeneratedAsset> {
  const state = availability();
  if (!state.available) throw new StudioError("NOT_CONFIGURED", state.reason ?? "Generation is unavailable.", 503);
  if (!state.enabledModels.includes(input.model)) throw new StudioError("MODEL_UNAVAILABLE", "This model has not passed verification.", 400);
  const dir = resolve(process.env.STUDIO_DATA_DIR || ".studio-data");
  let reference: { bytes: Uint8Array; mediaType: string } | undefined;
  let referenceHash: string | undefined;
  if (input.reference) {
    const bytes = Buffer.from(input.reference.dataUrl.split(",")[1], "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new StudioError("INVALID_REFERENCE", "Use a reference image up to 5 MB.");
    referenceHash = digest(bytes);
    if (input.reference.assetId && !await verifyLineage(dir, input.reference.assetId, referenceHash)) throw new StudioError("INVALID_REFERENCE", "This generated reference is no longer available in this workspace. Upload it as a new reference.");
    try {
      const decoder = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
      const metadata = await decoder.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported format");
      reference = { bytes: await decoder.rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer(), mediaType: "image/webp" };
    } catch { throw new StudioError("INVALID_REFERENCE", "The reference could not be read. Choose a valid PNG, JPEG, or WebP image."); }
  }
  await reserveAttempt(dir, input.requestId);
  try {
    const result = await generateStudioImage(input, reference);
    const metadata = await sharp(result.bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height) throw new StudioError("INVALID_OUTPUT", "The generated image could not be decoded.", 502);
    const id = randomUUID();
    const asset: GeneratedAsset = {
      id, jobId: input.requestId, source: "ai-generated", provider: "google", model: input.model, providerModel: result.providerModel,
      prompt: input.prompt, aspectRatio: input.aspectRatio, resolution: input.resolution, createdAt: new Date().toISOString(),
      width: metadata.width, height: metadata.height, mediaType: result.mediaType as GeneratedAsset["mediaType"],
      dataUrl: `data:${result.mediaType};base64,${Buffer.from(result.bytes).toString("base64")}`,
      ...(input.reference ? { reference: { name: input.reference.name, ...(input.reference.assetId ? { assetId: input.reference.assetId } : {}), sha256: referenceHash! } } : {}),
    };
    await finishAttempt(dir, input.requestId, "succeeded", { id, sha256: digest(result.bytes) });
    return asset;
  } catch (error) {
    // Reservation is never refunded, including unknown/timeout outcomes. No replay.
    try { await finishAttempt(dir, input.requestId, "failed"); } catch { /* Leave the durable reservation consumed. */ }
    if (error instanceof StudioError) throw error;
    throw new StudioError("INVALID_OUTPUT", "The generated image could not be loaded. No retry was sent.", 502);
  }
}
