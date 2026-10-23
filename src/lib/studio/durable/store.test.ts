import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createStudioStore } from "./store.ts";
import { StudioError } from "../contracts.ts";

function fixture(body: unknown, status = 200) {
  const requests: { url: URL; body: unknown }[] = [];
  const client = createClient("https://studio.invalid", "test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { store: createStudioStore(client), requests };
}

test("owner asset lookup hides pending reference records", async () => {
  const { store, requests } = fixture([]);
  assert.equal(await store.findAsset("asset", "owner"), null);
  assert.equal(requests[0].url.searchParams.get("user_id"), "eq.owner");
  assert.equal(requests[0].url.searchParams.get("ready"), "eq.true");
});

test("generated history is ready, owned and limited to latest 24", async () => {
  const { store, requests } = fixture([]);
  assert.deepEqual(await store.listAssets("owner"), []);
  const params = requests[0].url.searchParams;
  assert.equal(params.get("user_id"), "eq.owner");
  assert.equal(params.get("kind"), "eq.generated");
  assert.equal(params.get("ready"), "eq.true");
  assert.equal(params.get("limit"), "24");
  assert.equal(params.get("order"), "created_at.desc");
});

test("reservation sends only the authenticated ownership and validated payload", async () => {
  const { store, requests } = fixture({ job: { id: "job" }, created: false });
  const result = await store.reserveJob("owner", { requestId: "request", model: "gemini-3.1-flash-image", prompt: "image", aspectRatio: "1:1", resolution: "512", referenceAssetId: null }, "network-hash");
  assert.equal(result.created, false);
  assert.equal(requests[0].url.pathname, "/rest/v1/rpc/studio_reserve_job");
  assert.deepEqual(requests[0].body, { p_owner_id: "owner", p_request_id: "request", p_model: "gemini-3.1-flash-image", p_prompt: "image", p_aspect_ratio: "1:1", p_resolution: "512", p_reference_asset_id: null, p_abuse_key: "network-hash" });
});

test("known database fences become actionable safe errors", async () => {
  const { store } = fixture({ code: "P0001", message: "STUDIO_REQUEST_CONFLICT", details: "private SQL details" }, 400);
  await assert.rejects(store.reserveJob("owner", { requestId: "request", model: "gemini-3.1-flash-image", prompt: "image", aspectRatio: "1:1", resolution: "512", referenceAssetId: null }, "network-hash"), (error: unknown) => error instanceof StudioError && error.code === "REQUEST_CONFLICT" && error.status === 409 && !error.message.includes("SQL"));
});

test("unexpected database failures never disclose internal messages", async () => {
  const { store } = fixture({ code: "42501", message: "service-role credential abc secret", details: "private SQL" }, 403);
  await assert.rejects(store.getQuota(), (error: unknown) => error instanceof StudioError && error.code === "PERSISTENCE_UNAVAILABLE" && error.status === 503 && !error.message.includes("secret"));
});

test("provider dispatch preserves a false one-way compare-and-set result", async () => {
  const { store, requests } = fixture(false);
  assert.equal(await store.beginProvider("job", "run"), false);
  assert.deepEqual(requests[0].body, { p_job_id: "job", p_run_id: "run" });
});
