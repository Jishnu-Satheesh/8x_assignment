import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
