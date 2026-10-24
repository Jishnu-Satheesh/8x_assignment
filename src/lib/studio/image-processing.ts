import sharp from "sharp";
import { createHash } from "node:crypto";
import { StudioError } from "./contracts.ts";
import type { ImageMetadata } from "./durable/types.ts";

const formats = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
function describe(bytes: Uint8Array, width: number, height: number, mediaType: ImageMetadata["mediaType"], providerModel: string | null): ImageMetadata {
  return { bytes: bytes.byteLength, width, height, mediaType, providerModel, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** generated is trusted worker-only input after saved ownership/hash validation;
 * never populate it from an upload request. */
export async function normalizeReference(bytes: Uint8Array, options?: { generated?: boolean }): Promise<{ bytes: Uint8Array; metadata: ImageMetadata }> {
  const maxBytes = (options?.generated ? 16 : 5) * 1024 * 1024;
  const maxPixels = options?.generated ? 40_000_000 : 25_000_000;
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new StudioError("INVALID_REFERENCE", options?.generated ? "The saved reference image exceeds the supported size." : "Use a reference image up to 5 MB.");
  try {
    const decoder = sharp(bytes, { limitInputPixels: maxPixels, animated: false, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!(metadata.format! in formats) || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) throw new Error("Invalid image");
    const normalized = await decoder.rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { bytes: normalized.data, metadata: describe(normalized.data, normalized.info.width, normalized.info.height, "image/webp", null) };
  } catch {
    throw new StudioError("INVALID_REFERENCE", "The reference could not be read. Choose a valid PNG, JPEG, or WebP image.");
  }
}

export async function inspectOutput(bytes: Uint8Array, mediaType: string, providerModel: string | null): Promise<ImageMetadata> {
  try {
    if (!bytes.byteLength || bytes.byteLength > 16 * 1024 * 1024) throw new Error("Invalid size");
    const decoder = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: "warning" });
    const metadata = await decoder.metadata();
    const actual = formats[metadata.format as keyof typeof formats];
    if (!actual || actual !== mediaType || !metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    // Reading the header alone does not establish that all pixels can decode.
    await decoder.stats();
    return describe(bytes, metadata.width, metadata.height, actual, providerModel);
  } catch {
    throw new StudioError("INVALID_OUTPUT", "The generated image could not be decoded. No retry was sent.", 502);
  }
}
