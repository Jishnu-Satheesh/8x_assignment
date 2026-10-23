export const MODELS = [
  { id: "gemini-3.1-flash-image", name: "Nano Banana 2", description: "Fast, versatile image creation", resolutions: ["512", "1K", "2K", "4K"] },
  { id: "gemini-3-pro-image", name: "Nano Banana Pro", description: "Precision for complex compositions", resolutions: ["1K", "2K", "4K"] },
] as const;
export const RATIOS = ["1:1", "4:5", "3:2", "16:9", "9:16"] as const;
export type ModelId = (typeof MODELS)[number]["id"];
export type Resolution = "512" | "1K" | "2K" | "4K";
export type AspectRatio = (typeof RATIOS)[number];
export type ReferenceInput = { name: string; dataUrl: string; assetId?: string };
export type GenerationInput = { requestId: string; model: ModelId; prompt: string; aspectRatio: AspectRatio; resolution: Resolution; reference?: ReferenceInput };
export type GeneratedAsset = {
  id: string; jobId: string; source: "ai-generated"; provider: "google";
  model: ModelId; providerModel: string; prompt: string; aspectRatio: AspectRatio; resolution: Resolution;
  createdAt: string; width: number; height: number; mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string; referenceReusable?: boolean; reference?: { name: string; assetId?: string; sha256: string };
};
export type GenerationJob =
  | { id: string; status: "processing"; input: GenerationInput; startedAt: string }
  | { id: string; status: "succeeded"; asset: GeneratedAsset }
  | { id: string; status: "failed"; code: string; message: string };
export type StudioAvailability = { enabledModels: ModelId[]; available: boolean; reason?: string };
export class StudioError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.name = "StudioError"; this.code = code; this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudioError("INVALID_INPUT", "Check your generation settings.");
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(k => !keys.includes(k))) throw new StudioError("UNSUPPORTED_SETTING", "This request contains an unsupported setting.");
}
export function validateRequest(value: unknown): GenerationInput {
  const v = object(value);
  onlyKeys(v, ["requestId", "model", "prompt", "aspectRatio", "resolution", "reference"]);
  const model = MODELS.find(m => m.id === v.model);
  if (!model) throw new StudioError("INVALID_MODEL", "Choose an available image model.");
  if (typeof v.requestId !== "string" || !uuid.test(v.requestId)) throw new StudioError("INVALID_REQUEST", "Start a new generation request.");
  if (typeof v.prompt !== "string" || !v.prompt.trim() || v.prompt.trim().length > 4000) throw new StudioError("INVALID_PROMPT", "Describe your image in 1–4,000 characters.");
  if (!RATIOS.includes(v.aspectRatio as AspectRatio) || !(model.resolutions as readonly unknown[]).includes(v.resolution)) throw new StudioError("UNSUPPORTED_SETTING", "Choose an aspect ratio and resolution supported by this model.");
  let reference: ReferenceInput | undefined;
  if (v.reference !== undefined) {
    const r = object(v.reference);
    onlyKeys(r, ["name", "dataUrl", "assetId"]);
    if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 160 || typeof r.dataUrl !== "string" || r.dataUrl.length > 7_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.dataUrl) || (r.assetId !== undefined && (typeof r.assetId !== "string" || !uuid.test(r.assetId)))) throw new StudioError("INVALID_REFERENCE", "Use one PNG, JPEG, or WebP image up to 5 MB.");
    reference = { name: r.name.trim(), dataUrl: r.dataUrl, ...(r.assetId ? { assetId: r.assetId as string } : {}) };
  }
  return { requestId: v.requestId, model: model.id, prompt: v.prompt.trim(), aspectRatio: v.aspectRatio as AspectRatio, resolution: v.resolution as Resolution, ...(reference ? { reference } : {}) };
}
