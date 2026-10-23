import "server-only";
import { createGoogle } from "@ai-sdk/google";
import { generateText } from "ai";
import { StudioError, type GenerationInput } from "./contracts.ts";

export async function generateStudioImage(input: GenerationInput, reference?: { bytes: Uint8Array; mediaType: string }, transport: typeof fetch = fetch) {
  const google = createGoogle({ fetch: async (url, init) => {
    const response = await transport(url, { ...init, redirect: "error" });
    // Safe operational metadata only; never log prompts, headers, bytes, or
    // provider error messages (which can include credential details).
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      const reason = String(body.error?.status ?? "UNKNOWN");
      console.error("studio_provider_rejected", { model: input.model, status: response.status, reason: /^[A-Z_]+$/.test(reason) ? reason : "UNKNOWN" });
    }
    return response;
  } });
  try {
    const result = await generateText({
      model: google(input.model),
      messages: [{ role: "user", content: [
        { type: "text", text: input.prompt },
        ...(reference ? [{ type: "file" as const, data: reference.bytes, mediaType: reference.mediaType }] : []),
      ] }],
      providerOptions: { google: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: input.aspectRatio, imageSize: input.resolution } } },
      maxOutputTokens: 8192,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(120_000),
    });
    const images = result.files.filter(f => ["image/png", "image/jpeg", "image/webp"].includes(f.mediaType));
    if (images.length !== 1 || result.finishReason !== "stop") throw new StudioError("NO_IMAGE", "The model could not create this image. Try a different description or reference.", 422);
    const image = images[0];
    if (!image.uint8Array.length || image.uint8Array.length > 16 * 1024 * 1024) throw new StudioError("INVALID_OUTPUT", "The generated image could not be loaded. Try a smaller resolution.", 502);
    return { bytes: image.uint8Array, mediaType: image.mediaType, providerModel: result.response.modelId ?? input.model };
  } catch (error) {
    if (error instanceof StudioError) throw error;
    const status = (error as { statusCode?: number }).statusCode;
    if (transport === fetch) console.error("studio_provider_failure", { model: input.model, status: status ?? null, name: (error as Error).name });
    if (status === 429) throw new StudioError("PROVIDER_BUSY", "Google is busy or the provider allowance is exhausted. Please try later.", 429);
    if ((error as Error).name === "TimeoutError" || (error as Error).name === "AbortError") throw new StudioError("TIMEOUT", "The generation timed out. It may still have used provider credits. No retry was sent.", 504);
    throw new StudioError("PROVIDER_ERROR", "Image generation is unavailable right now. Please try later.", 502);
  }
}
