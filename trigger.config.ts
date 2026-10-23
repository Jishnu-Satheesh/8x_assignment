import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  runtime: "node-22",
  dirs: ["./src/trigger"],
  maxDuration: 240,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  // Sharp's native binaries must be installed for the worker's target platform.
  build: { external: ["sharp"] },
  enableConsoleLogging: false,
});
