// Local development worker only. This does not deploy a Trigger worker.
import { spawn } from "node:child_process";
if (!process.env.TRIGGER_PROJECT_REF || !process.env.TRIGGER_SECRET_KEY) throw new Error("Configure the Trigger development environment in .env.local");
if (!process.env.TRIGGER_SECRET_KEY.startsWith("tr_dev_")) throw new Error("Use a Trigger development key for local testing");
const child = spawn("npx", ["--yes", "trigger.dev@4.8.1", "dev", "start", "--env-file", ".env.local", "--max-concurrent-runs", "2", "--skip-update-check", "--skip-telemetry"], { stdio: ["inherit", "pipe", "pipe"] });
function safe(chunk) {
  let output = chunk.toString();
  for (const value of Object.values(process.env)) if (value && value.length > 5) output = output.split(value).join("[configured]");
  return output.replace(/https?:\/\/[^\s]*[?][^\s]*/g, "[authentication URL: open from your own terminal]");
}
child.stdout.on("data", chunk => process.stdout.write(safe(chunk)));
child.stderr.on("data", chunk => process.stderr.write(safe(chunk)));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", code => { process.exitCode = code ?? 1; });
