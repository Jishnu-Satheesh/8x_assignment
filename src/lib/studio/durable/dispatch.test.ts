import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { configure } from "@trigger.dev/sdk";
import { dispatchJob } from "./dispatch.ts";
import type { JobRow, StudioStore } from "./types.ts";

test("dispatch sends only job ID with stable idempotency; ambiguous failure retains reservation", async () => {
  let reject = false, requests = 0;
  const received: { payload: unknown; options: { idempotencyKey: string; maxAttempts: number } }[] = [];
  const server = createServer(async (req, res) => {
    requests++;
    let body = ""; for await (const chunk of req) body += chunk;
    received.push(JSON.parse(body));
    if (reject) { req.socket.destroy(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: "run_mock_01", isCached: false }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  configure({ secretKey: "tr_dev_unit_test_only", baseURL: `http://127.0.0.1:${address.port}` });
  const job = { id: "20000000-0000-4000-8000-000000000001", status: "queued", dispatch_status: "pending", trigger_run_id: null } as JobRow;
  const links: unknown[] = [];
  const store = { findJob: async () => job, linkRun: async (_id: string, runId: string | null, state: string) => { links.push({ runId, state }); } } as unknown as StudioStore;
  try {
    await dispatchJob(job, store);
    assert.deepEqual(typeof received[0].payload === "string" ? JSON.parse(received[0].payload).json : received[0].payload, { jobId: job.id });
    assert.match(received[0].options.idempotencyKey, /^[a-f0-9]{64}$/);
    assert.equal(received[0].options.maxAttempts, 1);
    assert.deepEqual(links[0], { runId: "run_mock_01", state: "sent" });
    reject = true;
    await dispatchJob(job, store);
    assert.equal(received[1].options.idempotencyKey, received[0].options.idempotencyKey);
    assert.equal(requests, 2, "an uncertain dispatch must not retry its HTTP request");
    assert.deepEqual(links[1], { runId: null, state: "uncertain" });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
