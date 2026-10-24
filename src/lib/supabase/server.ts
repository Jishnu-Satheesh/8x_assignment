import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { StudioError } from "../studio/contracts.ts";

export function authConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new StudioError(
      "NOT_CONFIGURED",
      "This workspace is being connected. Please try later.",
      503,
    );
  return { url, key };
}
export async function createSessionClient() {
  const { url, key } = authConfig();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && !!process.env.VERCEL,
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values)
          jar.set(name, value, options);
      },
    },
  });
}
export async function requireUser() {
  const client = await createSessionClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new StudioError(
      "AUTH_REQUIRED",
      "Start your guest workspace to continue.",
      401,
    );
  return { client, user: data.user };
}
