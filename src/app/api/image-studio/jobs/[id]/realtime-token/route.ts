import { auth } from "@trigger.dev/sdk";
import { requireUser } from "@/lib/supabase/server";
import { StudioError } from "@/lib/studio/contracts";
import { errorResponse, privateHeaders, uuid } from "@/lib/studio/durable/http";
import { createStudioStore } from "@/lib/studio/durable/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { client, user } = await requireUser();
    const job = await createStudioStore(client).findJob(
      uuid((await context.params).id),
      user.id,
    );
    const runId = job?.trigger_run_id ?? job?.execution_run_id;
    if (!job || !runId)
      throw new StudioError(
        "NOT_FOUND",
        "Live updates are not yet available for this job.",
        404,
      );
    const accessToken = await auth.createPublicToken({
      scopes: { read: { runs: [runId] } },
      expirationTime: "5m",
    });
    return Response.json({ accessToken, runId }, { headers: privateHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
