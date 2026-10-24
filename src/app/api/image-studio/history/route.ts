import { requireUser } from "@/lib/supabase/server";
import { configuration } from "@/lib/studio/durable/availability";
import { reconcileJob } from "@/lib/studio/durable/dispatch";
import { errorResponse, privateHeaders } from "@/lib/studio/durable/http";
import { presentAsset, presentJob } from "@/lib/studio/durable/presentation";
import { createStudioStore } from "@/lib/studio/durable/store";

export async function GET() {
  try {
    const { user, client } = await requireUser();
    const reads = createStudioStore(client),
      writes = createStudioStore();
    const [initial, quota] = await Promise.all([
      reads.listJobs(user.id),
      writes.getQuota(),
    ]);
    const jobs = await Promise.all(initial.map((j) => reconcileJob(j, writes)));
    const assets = await reads.listAssets(user.id);
    const state = configuration();
    if (!quota.enabled) {
      state.available = false;
      state.reason =
        "Generation is paused by the workspace owner. Your saved images remain available.";
    } else if (quota.consumed >= quota.global_limit) {
      state.available = false;
      state.reason =
        "This workspace has reached its generation allowance. Your saved images remain available.";
    }
    return Response.json(
      {
        assets: assets.map(presentAsset),
        jobs: await Promise.all(
          jobs.map(async (j) =>
            presentJob(
              j,
              j.asset_id ? await reads.findAsset(j.asset_id, user.id) : null,
            ),
          ),
        ),
        availability: state,
        allowance: {
          remaining: Math.max(0, quota.global_limit - quota.consumed),
          userLimit: quota.user_limit,
        },
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
