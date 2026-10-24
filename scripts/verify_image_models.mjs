// Explicit paid smoke test: one request per stable model, no retries.
// Run: node --env-file=.env.local scripts/verify_image_models.mjs
// Secrets and provider error payloads are never printed or saved.
import { generateImage } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("Missing server-side Gemini credential.");
  process.exit(1);
}
const report = { checkedAt: new Date().toISOString(), provider: "google", results: [] };
await mkdir(".studio-data/verification", { recursive: true, mode: 0o700 });
for (const [model, resolution] of [["gemini-3.1-flash-image", "512"], ["gemini-3-pro-image", "1K"]]) {
  let sent = 0;
  const provider = createGoogle({ fetch: async (url, init) => {
    sent++;
    return fetch(url, { ...init, redirect: "error" });
  } });
  const started = Date.now();
  try {
    const result = await generateImage({
      model: provider.image(model),
      prompt: "Create a minimal studio photograph of a warm coral ceramic sphere on a graphite pedestal. Soft side lighting, no text.",
      aspectRatio: "1:1",
      providerOptions: { google: { imageConfig: { imageSize: resolution } } },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(120_000),
    });
    const bytes = result.image.uint8Array;
    if (!bytes.length || !result.image.mediaType.startsWith("image/")) throw new Error("No image");
    const extension = result.image.mediaType === "image/jpeg" ? "jpg" : "png";
    await writeFile(`.studio-data/verification/${model}.${extension}`, bytes, { mode: 0o600 });
    report.results.push({ model, resolution, aspectRatio: "1:1", passed: true, sent, bytes: bytes.length,
      mediaType: result.image.mediaType, sha256: createHash("sha256").update(bytes).digest("hex"),
      elapsedMs: Date.now() - started, warnings: result.warnings.map(w => w.type) });
  } catch (error) {
    report.results.push({ model, resolution, passed: false, sent, elapsedMs: Date.now() - started,
      errorType: error?.name ?? "Error", status: error?.statusCode ?? null });
  }
  console.log(JSON.stringify(report.results.at(-1)));
}
await writeFile("docs/phase2-model-verification.json", JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.results.every(r => r.passed) ? 0 : 1;
