import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveAttempt, finishAttempt } from "./usage.ts";

test("durable cap counts failed requests and survives a fresh read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "8x-usage-"));
  await reserveAttempt(dir, "one", { now: 100000, cap: 2 });
  await finishAttempt(dir, "one", "failed");
  await reserveAttempt(dir, "two", { now: 180000, cap: 2 });
  await finishAttempt(dir, "two", "succeeded");
  await assert.rejects(reserveAttempt(dir, "three", { now: 260000, cap: 2 }), /allowance/);
  const saved = JSON.parse(await readFile(join(dir, "usage.json"), "utf8"));
  assert.equal(saved.attempts.length, 2);
});
test("completion waits for brief lock contention; failed bookkeeping preserves the reservation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "8x-usage-"));
  await reserveAttempt(dir, "one");
  await mkdir(join(dir, "usage.lock"));
  const release = new Promise<void>(resolve => { setTimeout(() => { void rmdir(join(dir, "usage.lock")).then(resolve); }, 60); });
  assert.equal(await finishAttempt(dir, "one", "succeeded", { id: "asset-one", sha256: "digest" }), true);
  await release;
  await mkdir(join(dir, "usage.lock"));
  assert.equal(await finishAttempt(dir, "one", "succeeded"), false);
  await rmdir(join(dir, "usage.lock"));
  await assert.rejects(reserveAttempt(dir, "two", { cap: 1 }), /allowance/);
});
test("duplicate IDs, concurrent generation, throttling and corrupt ledgers fail closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "8x-usage-"));
  const outcomes = await Promise.allSettled([reserveAttempt(dir, "one"), reserveAttempt(dir, "two")]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  const saved = JSON.parse(await readFile(join(dir, "usage.json"), "utf8"));
  const id = saved.attempts[0].id;
  await finishAttempt(dir, id, "failed");
  await assert.rejects(reserveAttempt(dir, id), /already/);
  await assert.rejects(reserveAttempt(dir, "three"), /wait/i);
  await writeFile(join(dir, "usage.json"), "broken");
  await assert.rejects(reserveAttempt(dir, "four"), /unavailable/);
});
