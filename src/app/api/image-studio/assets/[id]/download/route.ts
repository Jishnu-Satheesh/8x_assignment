import { ownedAsset } from "@/lib/studio/durable/asset-access";
import { errorResponse, privateHeaders } from "@/lib/studio/durable/http";
import { StudioError } from "@/lib/studio/contracts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { asset, storage } = await ownedAsset((await context.params).id);
    const { data, error } = await storage.download(asset.storage_path);
    if (!data || error)
      throw new StudioError(
        "DOWNLOAD_FAILED",
        "The image could not be downloaded. Please try again.",
        503,
      );
    const extension =
      asset.media_type === "image/jpeg"
        ? "jpg"
        : asset.media_type === "image/webp"
          ? "webp"
          : "png";
    return new Response(data, {
      headers: {
        ...privateHeaders,
        "Content-Type": asset.media_type,
        "Content-Disposition": `attachment; filename="8x-${asset.id}.${extension}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
