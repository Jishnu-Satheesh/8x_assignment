import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateStudioImage } from "./provider.ts";
import type { GenerationInput } from "./contracts.ts";

const input: GenerationInput = { requestId: "90d69ef4-1745-4a66-b3a9-953c8af79f17", model: "gemini-3-pro-image", prompt: "A coral vase", aspectRatio: "4:5", resolution: "1K" };
const image = (await readFile("public/images/desert.webp")).toString("base64");
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "transport-test-key";
test("SDK transport sends the exact stable model, settings and reference without retries", async () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "image/webp", data: image } }] }, finishReason: "STOP" }], modelVersion: input.model, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 } }), { headers: { "content-type": "application/json" } });
  };
  const result = await generateStudioImage(input, { bytes: Buffer.from(image, "base64"), mediaType: "image/webp" }, transport);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith(`/models/${input.model}:generateContent`));
  const body = requests[0].body as { generationConfig: { imageConfig: unknown }; contents: { parts: { inlineData?: unknown }[] }[] };
  assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "4:5", imageSize: "1K" });
  assert.ok(body.contents[0].parts.some(p => p.inlineData));
  assert.equal(result.providerModel, input.model);
  assert.ok(result.bytes.length > 0);
});
test("provider errors and blocked/no-image output are safe and never retried", async () => {
  for (const [status, data] of [[429, { error: { message: "PRIVATE PROVIDER DETAIL" } }], [200, { candidates: [{ content: { role: "model", parts: [{ text: "Cannot generate" }] }, finishReason: "SAFETY" }] }]] as const) {
    let calls = 0;
    await assert.rejects(generateStudioImage(input, undefined, async () => {
      calls++;
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    }), error => error instanceof Error && !error.message.includes("PRIVATE"));
    assert.equal(calls, 1);
  }
});
