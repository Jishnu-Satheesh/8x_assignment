import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { StudioError } from "@/lib/studio/contracts";
import { normalizeReference } from "@/lib/studio/image-processing";
import {
  abuseKey,
  boundedBody,
  errorResponse,
  privateHeaders,
  sameOrigin,
  uuid,
} from "@/lib/studio/durable/http";
import { createStudioStore } from "@/lib/studio/durable/store";
import { BUCKET } from "@/lib/studio/durable/types";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await requireUser();
    const requestId = uuid(request.headers.get("x-request-id"));
    const filename =
      (request.headers.get("x-file-name")
        ? decodeURIComponent(request.headers.get("x-file-name")!)
        : "Reference image"
      )
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 160) || "Reference image";
    const bytes = await boundedBody(request, 5 * 1024 * 1024);
    const normalized = await normalizeReference(bytes);
    const store = createStudioStore(),
      admin = createAdminClient();
    const row = await store.reserveReference(
      user.id,
      requestId,
      filename,
      normalized.metadata,
      abuseKey(request),
    );
    if (!row.ready) {
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(row.storage_path, normalized.bytes, {
          contentType: normalized.metadata.mediaType,
          upsert: false,
        });
      if (error) {
        const existing = await admin.storage
          .from(BUCKET)
          .download(row.storage_path);
        if (
          !existing.data ||
          existing.error ||
          !Buffer.from(await existing.data.arrayBuffer()).equals(
            Buffer.from(normalized.bytes),
          )
        )
          throw new StudioError(
            "UPLOAD_FAILED",
            "The reference could not be saved. Please try again.",
            503,
          );
      }
      await store.completeReference(row.id, user.id);
    }
    return Response.json(
      {
        reference: {
          id: row.id,
          name: row.filename,
          imageUrl: `/api/image-studio/assets/${row.id}/image`,
          source: "uploaded",
        },
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
