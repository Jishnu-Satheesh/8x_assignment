"use client";
import { useEffect, useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import type { StudioJob } from "@/lib/studio/durable/types";

async function tokenFor(jobId: string) {
  const response = await fetch(
    `/api/image-studio/jobs/${jobId}/realtime-token`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Live updates unavailable");
  return (await response.json()) as { accessToken: string; runId: string };
}
function Subscription({
  jobId,
  token,
  onUpdate,
}: {
  jobId: string;
  token: { accessToken: string; runId: string };
  onUpdate: () => Promise<void>;
}) {
  const { run, error } = useRealtimeRun(token.runId, {
    accessToken: token.accessToken,
    refreshAccessToken: async () => (await tokenFor(jobId)).accessToken,
    skipColumns: ["payload", "output"],
  });
  const stage = run?.metadata?.stage;
  const status = run?.status;
  useEffect(() => {
    if (status || stage) void onUpdate();
  }, [stage, status, onUpdate]);
  return error ? (
    <p className="field-help">
      Live updates paused. Checking your saved job automatically.
    </p>
  ) : null;
}
export function StudioRealtime({
  job,
  onUpdate,
}: {
  job: StudioJob;
  onUpdate: () => Promise<void>;
}) {
  const [token, setToken] = useState<{ accessToken: string; runId: string }>();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!job.runId) return;
    let active = true;
    void tokenFor(job.id)
      .then((value) => {
        if (active) {
          setToken(value);
          setUnavailable(false);
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [job.id, job.runId]);
  return token ? (
    <Subscription jobId={job.id} token={token} onUpdate={onUpdate} />
  ) : unavailable ? (
    <p className="field-help">Checking your saved job automatically.</p>
  ) : null;
}
