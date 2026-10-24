import { StudioError, validateRequest } from "../contracts.ts";
import type { FreshGeneration } from "./types.ts";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function parseGeneration(value: unknown): { input: FreshGeneration | null; requestId: string; regenerateAssetId: string | null; challengeToken: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudioError("INVALID_INPUT", "Check the generation settings.");
  const v = value as Record<string, unknown>;
  const allowed = ["requestId", "model", "prompt", "aspectRatio", "resolution", "referenceAssetId", "regenerateAssetId", "challengeToken"];
  if (Object.keys(v).some(k => !allowed.includes(k))) throw new StudioError("UNSUPPORTED_SETTING", "This request contains an unsupported setting.");
  if (!isUuid(v.requestId)) throw new StudioError("INVALID_REQUEST", "Start a new generation request.");
  if (v.regenerateAssetId !== undefined) {
    if (!isUuid(v.regenerateAssetId) || Object.keys(v).some(k => !["requestId", "regenerateAssetId", "challengeToken"].includes(k))) throw new StudioError("INVALID_INPUT", "Regenerate with the original image settings.");
    return { input: null, requestId: v.requestId, regenerateAssetId: v.regenerateAssetId, challengeToken: v.challengeToken };
  }
  if (v.referenceAssetId !== undefined && v.referenceAssetId !== null && !isUuid(v.referenceAssetId)) throw new StudioError("INVALID_REFERENCE", "Choose an image from this workspace.");
  const validated = validateRequest({ requestId: v.requestId, prompt: v.prompt, model: v.model, aspectRatio: v.aspectRatio, resolution: v.resolution });
  return { input: { ...validated, referenceAssetId: (v.referenceAssetId as string | null) ?? null }, requestId: v.requestId, regenerateAssetId: null, challengeToken: v.challengeToken };
}
