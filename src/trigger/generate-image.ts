import { metadata, task } from "@trigger.dev/sdk";
import { createWorkerDependencies, recoverJob, runGenerationJob, validateTaskPayload } from "../lib/studio/durable/worker.ts";

export const generateImage = task({
  id: "generate-image",
  queue: { concurrencyLimit: 2 },
  retry: { maxAttempts: 1 },
  maxDuration: 240,
  run: async (payload: { jobId: string }, { ctx }) => {
    try {
      const { jobId } = validateTaskPayload(payload);
      const deps = await createWorkerDependencies(async (stage, id, assetId) => {
        metadata.set("stage", stage).set("jobId", id);
        if (assetId) metadata.set("assetId", assetId);
        await metadata.flush();
      });
      return await runGenerationJob(jobId, ctx.run.id, deps);
    } catch {
      // The SDK records thrown errors; never attach upstream errors as causes.
      throw new Error("The image task could not finish. Its saved state will be reconciled without a new generation.");
    }
  },
  onFailure: async ({ payload, ctx }) => {
    try {
      const { jobId } = validateTaskPayload(payload);
      const deps = await createWorkerDependencies();
      const job = await deps.store.findJob(jobId);
      // A failed duplicate/manual replay must not terminate the original run.
      if (job && (job.execution_run_id === ctx.run.id || (!job.execution_run_id && job.trigger_run_id === ctx.run.id))) await recoverJob(jobId, deps);
    } catch {
      // Authenticated terminal-run reconciliation can retry persistence later.
    }
  },
});
