import "server-only";
import { createHmac } from "node:crypto";
import { StudioError } from "../contracts.ts";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export function errorResponse(error: unknown) {
  const safe =
    error instanceof StudioError
      ? error
      : new StudioError(
          "UNAVAILABLE",
          "The workspace could not be reached. Please try again shortly.",
          503,
        );
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    {
      status: safe.status,
      headers: {
        ...privateHeaders,
        ...(safe.status === 429 ? { "Retry-After": "10" } : {}),
      },
    },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected =
    process.env.STUDIO_ORIGIN ||
    (process.env.VERCEL
      ? ""
      : new URL(request.url).origin.replace("0.0.0.0", "localhost"));
  if (
    !origin ||
    origin !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new StudioError(
      "INVALID_ORIGIN",
      "Use the Image Studio page in this workspace.",
      403,
    );
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new StudioError("TOO_LARGE", "This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new StudioError("TOO_LARGE", "This request is too large.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new StudioError("INVALID_INPUT", "Use the Image Studio form.", 415);
  try {
    return JSON.parse(
      Buffer.from(await boundedBody(request, 24_000)).toString("utf8"),
    ) as unknown;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    throw new StudioError("INVALID_INPUT", "Check the generation settings.");
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StudioError("INVALID_INPUT", "Check the generation settings.");
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new StudioError(
      "INVALID_ID",
      "This workspace item could not be found.",
    );
  return value;
}
export function captchaRequired() {
  // Explicit owner-controlled opt-out; never infer this from missing keys.
  return process.env.STUDIO_CAPTCHA_MODE !== "disabled";
}
export function publicProtectionReady() {
  const origin = process.env.STUDIO_ORIGIN;
  try {
    if (!origin || new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)
      return false;
  } catch { return false; }
  return Boolean(
    process.env.ABUSE_PROTECTION_SECRET &&
      (!captchaRequired() ||
        (process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)),
  );
}
export async function checkChallenge(token: unknown) {
  // Local development has a globally bounded DB budget. Public environments fail closed.
  if (
    process.env.STUDIO_LOCAL_DEVELOPMENT === "true" &&
    !process.env.VERCEL &&
    process.env.STUDIO_ORIGIN === "http://localhost:3000" &&
    !process.env.TURNSTILE_SECRET_KEY
  )
    return;
  if (!publicProtectionReady())
    throw new StudioError(
      "PUBLIC_DISABLED",
      "Public generation is awaiting abuse-protection setup.",
      503,
    );
  if (!captchaRequired()) return;
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new StudioError(
      "CHALLENGE_REQUIRED",
      "Complete the security check before continuing.",
      403,
    );
  const result = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
    .then((r) => r.json())
    .catch(() => null);
  if (
    !result?.success ||
    result.hostname !== new URL(process.env.STUDIO_ORIGIN!).hostname
  )
    throw new StudioError(
      "CHALLENGE_FAILED",
      "The security check expired. Please try again.",
      403,
    );
}
export function abuseKey(request: Request) {
  const secret = process.env.ABUSE_PROTECTION_SECRET;
  if (!secret)
    throw new StudioError(
      "NOT_CONFIGURED",
      "Workspace protection is not configured yet.",
      503,
    );
  // Vercel overwrites x-vercel-forwarded-for. Never trust general forwarded-IP headers.
  const identity = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    : "local-development";
  if (!identity)
    throw new StudioError(
      "PROTECTION_UNAVAILABLE",
      "Workspace protection is temporarily unavailable.",
      503,
    );
  return createHmac("sha256", secret).update(identity).digest("hex");
}
