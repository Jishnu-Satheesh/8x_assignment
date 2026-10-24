import { createClient } from "@supabase/supabase-js";

// This module is shared by the Next server and standalone Trigger worker.
// Import only from server routes/tasks; no privileged values are public env vars.
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } });
}
