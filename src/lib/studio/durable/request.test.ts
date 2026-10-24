import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGeneration } from "./request.ts";
import { presentJob } from "./presentation.ts";
import type { JobRow } from "./types.ts";
const requestId = "20000000-0000-4000-8000-000000000001";
const valid = { requestId, model: "gemini-3.1-flash-image", prompt: " A coral vessel ", aspectRatio: "1:1", resolution: "512" };
test("durable request supports allowlisted settings and owned-reference identifier only", () => {
  assert.equal(parseGeneration(valid).input?.prompt, "A coral vessel");
  assert.equal(parseGeneration({ ...valid, referenceAssetId: requestId }).input?.referenceAssetId, requestId);
  for (const value of [{ ...valid, user_id: requestId }, { ...valid, reference: { dataUrl: "data:image/png;base64,AAAA" } }, { ...valid, model: "gemini-3-pro-image" }, { ...valid, referenceAssetId: "../another-user" }]) assert.throws(() => parseGeneration(value));
});
test("regeneration binds original saved asset rather than client-supplied settings", () => {
  assert.equal(parseGeneration({ requestId, regenerateAssetId: requestId }).regenerateAssetId, requestId);
  assert.throws(() => parseGeneration({ ...valid, regenerateAssetId: requestId }));
});
test("completed job without a persisted asset never presents a successful result", () => {
  const job = { id: requestId, status: "completed", created_at: new Date().toISOString() } as JobRow;
  assert.equal(presentJob(job, null).status, "saving");
  assert.equal(presentJob(job, null).asset, null);
});
