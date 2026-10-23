import { requireUser } from "@/lib/supabase/server";
import { StudioError } from "@/lib/studio/contracts";
import { reconcileJob } from "@/lib/studio/durable/dispatch";
import { errorResponse, privateHeaders, uuid } from "@/lib/studio/durable/http";
import { presentJob } from "@/lib/studio/durable/presentation";
import { createStudioStore } from "@/lib/studio/durable/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, client } = await requireUser();
    const reads = createStudioStore(client);
    let job = await reads.findJob(uuid((await context.params).id), user.id);
    if (!job)
      throw new StudioError(
        "NOT_FOUND",
        "This generation was not found in your workspace.",
        404,
      );
    job = await reconcileJob(job, createStudioStore());
    return Response.json(
      {
        job: presentJob(
          job,
          job.asset_id ? await reads.findAsset(job.asset_id, user.id) : null,
        ),
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
