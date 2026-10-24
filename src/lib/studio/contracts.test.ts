import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest } from "./contracts.ts";

const input = { requestId: "90d69ef4-1745-4a66-b3a9-953c8af79f17", model: "gemini-3.1-flash-image", prompt: "A coral ceramic vase", aspectRatio: "1:1", resolution: "1K" };
test("trims a valid generation request", () => {
  assert.equal(validateRequest({ ...input, prompt: "  A coral vase  " }).prompt, "A coral vase");
});
test("rejects unknown models, preview aliases and unsupported options", () => {
  for (const patch of [{ model: "seedance" }, { model: "gemini-3-pro-image-preview" }, { aspectRatio: "7:3" }, { resolution: "8K" }, { seed: 42 }]) {
    assert.throws(() => validateRequest({ ...input, ...patch }));
  }
  assert.throws(() => validateRequest({ ...input, model: "gemini-3-pro-image", resolution: "512" }));
});
test("rejects empty/oversized prompts and invalid request IDs", () => {
  for (const patch of [{ prompt: "   " }, { prompt: "x".repeat(4001) }, { requestId: "bad" }]) assert.throws(() => validateRequest({ ...input, ...patch }));
});
test("rejects remote/SVG references and fabricated generated lineage", () => {
  for (const reference of [{ dataUrl: "https://example.org/a.jpg", name: "a" }, { dataUrl: "data:image/svg+xml;base64,PHN2Zz4=", name: "a" }, { dataUrl: "data:image/png;base64,aGVsbG8=", name: "a", source: "ai-generated", assetId: "fake" }]) {
    assert.throws(() => validateRequest({ ...input, reference }));
  }
});
