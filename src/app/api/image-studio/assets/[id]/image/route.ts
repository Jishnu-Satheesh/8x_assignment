import { ownedAsset } from "@/lib/studio/durable/asset-access";
import { errorResponse, privateHeaders } from "@/lib/studio/durable/http";
import { StudioError } from "@/lib/studio/contracts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { asset, storage } = await ownedAsset((await context.params).id);
    const { data, error } = await storage.createSignedUrl(
      asset.storage_path,
      120,
    );
    if (error || !data)
      throw new StudioError(
        "IMAGE_UNAVAILABLE",
        "The image could not be opened. Try again shortly.",
        503,
      );
    return new Response(null, {
      status: 302,
      headers: { ...privateHeaders, Location: data.signedUrl },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
