import "server-only";
import verification from "../../../../docs/phase2-model-verification.json";
import { MODELS, type StudioAvailability } from "../contracts.ts";
import { publicProtectionReady } from "./http.ts";

export function localDevelopment() {
  return (
    process.env.STUDIO_LOCAL_DEVELOPMENT === "true" &&
    !process.env.VERCEL &&
    process.env.STUDIO_ORIGIN === "http://localhost:3000"
  );
}
export function configuration(): StudioAvailability {
  const enabledModels = MODELS.filter((m) =>
    verification.results.some((r) => r.model === m.id && r.passed),
  ).map((m) => m.id);
  const configured = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "TRIGGER_PROJECT_REF",
    "TRIGGER_SECRET_KEY",
    "ABUSE_PROTECTION_SECRET",
  ].every((k) => !!process.env[k]);
  if (
    localDevelopment() &&
    !process.env.TRIGGER_SECRET_KEY?.startsWith("tr_dev_")
  )
    return {
      enabledModels,
      available: false,
      reason: "Local generation needs the Trigger development environment key.",
    };
  if (!configured)
    return {
      enabledModels,
      available: false,
      reason:
        "The durable workspace is being connected. Your existing layout is ready.",
    };
  if (!localDevelopment() && !publicProtectionReady())
    return {
      enabledModels,
      available: false,
      reason: "Public generation is awaiting abuse-protection setup.",
    };
  if (!localDevelopment() && process.env.STUDIO_WORKER_VERIFIED !== "true")
    return {
      enabledModels,
      available: false,
      reason: "Public generation is awaiting worker deployment verification.",
    };
  return { enabledModels, available: true };
}
