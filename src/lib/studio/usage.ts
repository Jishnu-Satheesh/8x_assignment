import "server-only";
import { mkdir, open, readFile, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { StudioError } from "./contracts.ts";

type Attempt = { id: string; at: number; status: "processing" | "succeeded" | "failed" | "uncertain"; assetId?: string; sha256?: string };
type Ledger = { version: 1; attempts: Attempt[] };
async function transact<T>(dir: string, action: (ledger: Ledger) => T): Promise<T> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, "usage.lock");
  try { await mkdir(lock); } catch { throw new StudioError("BUSY", "Please wait while another request finishes.", 429); }
  try {
    let ledger: Ledger;
    try {
      ledger = JSON.parse(await readFile(join(dir, "usage.json"), "utf8"));
      if (ledger.version !== 1 || !Array.isArray(ledger.attempts) || ledger.attempts.some(a => typeof a.id !== "string" || !Number.isFinite(a.at) || !["processing", "succeeded", "failed", "uncertain"].includes(a.status))) throw new Error("Invalid ledger");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new StudioError("USAGE_UNAVAILABLE", "Generation allowance is unavailable. No request was sent.", 503);
      ledger = { version: 1, attempts: [] };
    }
    const result = action(ledger);
    const file = await open(join(dir, "usage.next"), "w", 0o600);
    try { await file.writeFile(JSON.stringify(ledger)); await file.sync(); } finally { await file.close(); }
    await rename(join(dir, "usage.next"), join(dir, "usage.json"));
    return result;
  } finally { await rmdir(lock); }
}
export async function reserveAttempt(dir: string, id: string, options: { now?: number; cap?: number } = {}) {
  return transact(dir, ledger => {
    const now = options.now ?? Date.now();
    const cap = Math.min(20, Math.max(1, options.cap ?? 20));
    if (ledger.attempts.some(a => a.id === id)) throw new StudioError("DUPLICATE", "This request was already submitted. Choose Generate for a new image.", 409);
    if (ledger.attempts.length >= cap) throw new StudioError("USAGE_LIMIT", "This workspace has reached its generation allowance. Contact the workspace owner.", 429);
    for (const a of ledger.attempts) if (a.status === "processing" && now - a.at > 180_000) a.status = "uncertain";
    if (ledger.attempts.some(a => a.status === "processing")) throw new StudioError("BUSY", "Please wait for the current generation to finish.", 429);
    const recent = ledger.attempts.filter(a => now - a.at < 60_000);
    if (recent.length >= 3 || ledger.attempts.some(a => now - a.at < 10_000)) throw new StudioError("RATE_LIMIT", "Please wait a moment before generating again.", 429);
    ledger.attempts.push({ id, at: now, status: "processing" });
    return { remaining: cap - ledger.attempts.length };
  });
}
export async function finishAttempt(dir: string, id: string, status: "succeeded" | "failed", asset?: { id: string; sha256: string }) {
  return transact(dir, ledger => {
    const a = ledger.attempts.find(a => a.id === id);
    if (!a) throw new StudioError("USAGE_UNAVAILABLE", "Generation allowance is unavailable.", 503);
    a.status = status;
    if (asset) { a.assetId = asset.id; a.sha256 = asset.sha256; }
  });
}
export async function verifyLineage(dir: string, id: string, sha256: string) {
  return transact(dir, ledger => ledger.attempts.some(a => a.status === "succeeded" && a.assetId === id && a.sha256 === sha256));
}
