import { requireUser } from "@/lib/supabase/server";
import { StudioError } from "@/lib/studio/contracts";
import { configuration } from "@/lib/studio/durable/availability";
import { dispatchJob } from "@/lib/studio/durable/dispatch";
import {
  abuseKey,
  checkChallenge,
  errorResponse,
  privateHeaders,
  readJson,
  sameOrigin,
} from "@/lib/studio/durable/http";
import { presentJob } from "@/lib/studio/durable/presentation";
import { parseGeneration } from "@/lib/studio/durable/request";
import { createStudioStore } from "@/lib/studio/durable/store";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await requireUser();
    const value = parseGeneration(await readJson(request));
    const state = configuration();
    if (!state.available)
      throw new StudioError(
        "NOT_CONFIGURED",
        state.reason ?? "Generation is unavailable.",
        503,
      );
    const store = createStudioStore();
    let input = value.input;
    if (value.regenerateAssetId) {
      const original = await store.findAsset(value.regenerateAssetId, user.id);
      if (
        !original?.ready ||
        original.kind !== "generated" ||
        !original.model ||
        !original.aspect_ratio ||
        !original.resolution
      )
        throw new StudioError(
          "NOT_FOUND",
          "The original image is not available in this workspace.",
          404,
        );
      input = {
        requestId: value.requestId,
        model: original.model,
        prompt: original.prompt ?? "",
        aspectRatio: original.aspect_ratio,
        resolution: original.resolution,
        referenceAssetId: original.reference_asset_id,
      };
    }
    if (!input || !state.enabledModels.includes(input.model))
      throw new StudioError(
        "MODEL_UNAVAILABLE",
        "This image model is unavailable.",
      );
    await checkChallenge(value.challengeToken);
    const reserved = await store.reserveJob(user.id, input, abuseKey(request));
    const job = reserved.created
      ? await dispatchJob(reserved.job, store)
      : reserved.job;
    const asset = job.asset_id
      ? await store.findAsset(job.asset_id, user.id)
      : null;
    return Response.json(
      { job: presentJob(job, asset) },
      { status: 202, headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
