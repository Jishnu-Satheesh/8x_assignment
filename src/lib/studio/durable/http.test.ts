import assert from "node:assert/strict";
import test from "node:test";
import { abuseKey, checkChallenge, publicProtectionReady, sameOrigin } from "./http.ts";

async function production(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const settings = {
    VERCEL: "1", STUDIO_LOCAL_DEVELOPMENT: "false",
    STUDIO_ORIGIN: "https://studio.example.test", ABUSE_PROTECTION_SECRET: "a".repeat(32),
    STUDIO_CAPTCHA_MODE: undefined, TURNSTILE_SECRET_KEY: undefined,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined, ...values,
  };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(settings)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { await run(); }
  finally { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test("CAPTCHA is required unless the owner explicitly disables it", async () => {
  await production({}, async () => {
    assert.equal(publicProtectionReady(), false);
    await assert.rejects(checkChallenge(undefined), { code: "PUBLIC_DISABLED" });
  });
  await production({ STUDIO_CAPTCHA_MODE: "disabled" }, async () => {
    assert.equal(publicProtectionReady(), true);
    await checkChallenge(undefined);
  });
});

test("disabling CAPTCHA still requires an exact HTTPS origin and keyed protection", async () => {
  for (const settings of [
    { STUDIO_ORIGIN: "http://studio.example.test" },
    { STUDIO_ORIGIN: "https://studio.example.test/path" },
    { STUDIO_ORIGIN: "invalid" },
    { ABUSE_PROTECTION_SECRET: undefined },
  ]) await production({ STUDIO_CAPTCHA_MODE: "disabled", ...settings }, async () => {
    assert.equal(publicProtectionReady(), false);
    await assert.rejects(checkChallenge(undefined), { code: "PUBLIC_DISABLED" });
  });
});

test("configured CAPTCHA continues to reject missing tokens", async () => {
  await production({ TURNSTILE_SECRET_KEY: "test-secret", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-site" }, async () => {
    assert.equal(publicProtectionReady(), true);
    await assert.rejects(checkChallenge(undefined), { code: "CHALLENGE_REQUIRED" });
  });
});

test("CAPTCHA opt-out does not bypass origin or trusted-network enforcement", async () => {
  await production({ STUDIO_CAPTCHA_MODE: "disabled" }, () => {
    assert.throws(() => sameOrigin(new Request("https://studio.example.test/api", { headers: { origin: "https://other.example.test" } })), { code: "INVALID_ORIGIN" });
    assert.throws(() => abuseKey(new Request("https://studio.example.test/api", { headers: { "x-forwarded-for": "203.0.113.1" } })), { code: "PROTECTION_UNAVAILABLE" });
    const request = new Request("https://studio.example.test/api", { headers: { origin: "https://studio.example.test", "x-vercel-forwarded-for": "203.0.113.1" } });
    sameOrigin(request);
    assert.match(abuseKey(request), /^[a-f0-9]{64}$/);
  });
});
