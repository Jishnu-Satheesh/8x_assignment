import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { inspectOutput, normalizeReference } from "./image-processing.ts";

const fixture = () => sharp({ create: { width: 1800, height: 900, channels: 3, background: "coral" } }).png().toBuffer();
test("reference decoding normalizes to bounded WebP and hashes the normalized bytes", async () => {
  const result = await normalizeReference(await fixture());
  assert.equal(result.metadata.width, 1536);
  assert.equal(result.metadata.height, 768);
  assert.equal(result.metadata.mediaType, "image/webp");
  assert.equal(result.metadata.sha256, createHash("sha256").update(result.bytes).digest("hex"));
  assert.equal(result.metadata.bytes, result.bytes.length);
});
test("reference rejects malformed, oversized, and excessive-pixel input", async () => {
  const beyondUploadPixels = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  for (const bytes of [Buffer.from("invalid"), Buffer.alloc(5 * 1024 * 1024 + 1), beyondUploadPixels]) {
    await assert.rejects(normalizeReference(bytes), { code: "INVALID_REFERENCE" });
  }
  const trusted = await normalizeReference(beyondUploadPixels, { generated: true });
  assert.ok(trusted.metadata.width <= 1536 && trusted.metadata.height <= 1536);
});
test("output verifies the real format, byte and pixel bounds", async () => {
  const bytes = await fixture();
  const metadata = await inspectOutput(bytes, "image/png", "verified-model");
  assert.equal(metadata.providerModel, "verified-model");
  assert.equal(metadata.width, 1800);
  await assert.rejects(inspectOutput(bytes, "image/webp", "model"), { code: "INVALID_OUTPUT" });
  await assert.rejects(inspectOutput(Buffer.alloc(16 * 1024 * 1024 + 1), "image/png", "model"), { code: "INVALID_OUTPUT" });
  await assert.rejects(inspectOutput(Buffer.from("invalid"), "image/png", "model"), { code: "INVALID_OUTPUT" });
  const excessivePixels = await sharp({ create: { width: 8001, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(inspectOutput(excessivePixels, "image/png", "model"), { code: "INVALID_OUTPUT" });
  await assert.rejects(normalizeReference(excessivePixels, { generated: true }), { code: "INVALID_REFERENCE" });
});
test("trusted generated references accept larger persisted images while uploads retain their limits", async () => {
  const largeBytes = await sharp({ create: { width: 1400, height: 1400, channels: 3, background: "coral" } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(largeBytes.length > 5 * 1024 * 1024);
  await assert.rejects(normalizeReference(largeBytes), { code: "INVALID_REFERENCE" });
  const normalized = await normalizeReference(largeBytes, { generated: true });
  assert.equal(normalized.metadata.mediaType, "image/webp");
  assert.equal(normalized.metadata.width, 1400);
  await assert.rejects(normalizeReference(Buffer.alloc(16 * 1024 * 1024 + 1), { generated: true }), { code: "INVALID_REFERENCE" });
  await assert.rejects(normalizeReference(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), { generated: true }), { code: "INVALID_REFERENCE" });
});
