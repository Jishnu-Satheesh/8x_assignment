import "server-only";
import { tasks, runs } from "@trigger.dev/sdk";
import type { JobRow, StudioStore } from "./types.ts";

async function deadline<T>(
  promise: PromiseLike<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Dispatch uncertain")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function dispatchJob(job: JobRow, store: StudioStore) {
  try {
    const handle = await deadline(
      tasks.trigger(
        "generate-image",
        { jobId: job.id },
        {
          idempotencyKey: `studio-${job.id}`,
          maxAttempts: 1,
          tags: [`job:${job.id}`],
        },
        { retry: { maxAttempts: 1 } },
      ),
      10_000,
    );
    await store.linkRun(job.id, handle.id, "sent");
  } catch {
    // A network error cannot prove Trigger did not receive the request.
    // Keep the reservation and never silently create another run.
    await store.linkRun(job.id, null, "uncertain").catch(() => undefined);
  }
  return (await store.findJob(job.id)) ?? job;
}
const terminal = new Set([
  "COMPLETED",
  "FAILED",
  "CRASHED",
  "CANCELED",
  "INTERRUPTED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "EXPIRED",
]);
export async function reconcileJob(job: JobRow, store: StudioStore) {
  if (
    job.status === "completed" ||
    (job.status === "failed" && !(job.uncertain && job.output_metadata))
  )
    return job;
  const age = Date.now() - Date.parse(job.updated_at);
  const id = job.trigger_run_id ?? job.execution_run_id;
  // Polling always reads the DB. Query Trigger only for an old/stalled job.
  if (age < 15_000) return job;
  try {
    let runId = id;
    if (!runId && job.dispatch_status !== "sent") {
      const page = await runs.list(
        { tag: [`job:${job.id}`], limit: 2 },
        { retry: { maxAttempts: 1 } },
      );
      const found = page.data.filter(
        (r) => r.taskIdentifier === "generate-image",
      );
      if (found.length === 1) {
        runId = found[0].id;
        await store.linkRun(job.id, runId, "sent");
      }
    }
    if (runId) {
      const run = await runs.retrieve(runId, { retry: { maxAttempts: 1 } });
      if (terminal.has(run.status)) {
        const { recoverJob, createWorkerDependencies } = await import(
          "./worker.ts"
        );
        await recoverJob(job.id, await createWorkerDependencies());
      }
    } else if (age > 5 * 60_000) {
      await store.failJob(
        job.id,
        null,
        {
          code: "DISPATCH_UNCERTAIN",
          message:
            "The job could not be confirmed. Its reservation is retained; no generation was replayed.",
        },
        true,
      );
    }
  } catch {
    /* Provider/Trigger outages must not erase a recoverable job. */
  }
  return (await store.findJob(job.id)) ?? job;
}
