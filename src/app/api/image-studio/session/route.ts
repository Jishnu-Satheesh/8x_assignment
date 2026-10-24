import { createSessionClient } from "@/lib/supabase/server";
import { StudioError } from "@/lib/studio/contracts";
import {
  configuration,
  localDevelopment,
} from "@/lib/studio/durable/availability";
import {
  captchaRequired,
  errorResponse,
  object,
  privateHeaders,
  publicProtectionReady,
  readJson,
  sameOrigin,
} from "@/lib/studio/durable/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const client = await createSessionClient();
    const { data } = await client.auth.getUser();
    return Response.json(
      {
        user: data.user
          ? { id: data.user.id, anonymous: data.user.is_anonymous === true }
          : null,
        availability: configuration(),
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const value = object(await readJson(request));
    if (Object.keys(value).some((k) => k !== "challengeToken"))
      throw new StudioError("INVALID_INPUT", "Use the guest workspace button.");
    if (!localDevelopment() && !publicProtectionReady())
      throw new StudioError(
        "PUBLIC_DISABLED",
        "Guest workspaces are awaiting abuse-protection setup.",
        503,
      );
    const client = await createSessionClient();
    const existing = await client.auth.getUser();
    if (existing.data.user)
      return Response.json(
        {
          user: {
            id: existing.data.user.id,
            anonymous: existing.data.user.is_anonymous === true,
          },
        },
        { headers: privateHeaders },
      );
    const captchaToken =
      typeof value.challengeToken === "string" &&
      value.challengeToken.length <= 2048
        ? value.challengeToken
        : undefined;
    if (!localDevelopment() && captchaRequired() && !captchaToken)
      throw new StudioError(
        "CHALLENGE_REQUIRED",
        "Complete the security check to start your workspace.",
        403,
      );
    const { data, error } = await client.auth.signInAnonymously({
      options: { ...(captchaToken ? { captchaToken } : {}) },
    });
    if (error?.code === "captcha_failed")
      throw new StudioError(
        "CHALLENGE_REQUIRED",
        "A security check is needed to open your workspace. Complete it here, or ask the owner to finish guest access setup.",
        403,
      );
    if (error || !data.user)
      throw new StudioError(
        "AUTH_UNAVAILABLE",
        "Guest sign-in is unavailable. Ask the owner to enable anonymous sign-ins, or try again shortly.",
        503,
      );
    return Response.json(
      {
        user: { id: data.user.id, anonymous: data.user.is_anonymous === true },
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
