// Run with: node --env-file=.env.local scripts/studio-db.mjs inspect|dry-run|migrate|test|pause|enable-local
// Credentials stay in the ignored env file and never appear in command text/output.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const command = process.argv[2];
const connection = process.env.SUPABASE_DB_URL;
if (!connection || !process.env.SUPABASE_URL)
  throw new Error("Configure SUPABASE_DB_URL and SUPABASE_URL locally");
const db = new URL(connection),
  api = new URL(process.env.SUPABASE_URL);
const ref = api.hostname.split(".")[0];
if (
  !(
    db.hostname === `db.${ref}.supabase.co` ||
    decodeURIComponent(db.username).endsWith(`.${ref}`)
  )
)
  throw new Error("Database and Supabase project do not match");
function safe(value) {
  let result = String(value);
  for (const v of Object.values(process.env))
    if (v && v.length > 5) result = result.split(v).join("[value]");
  return result.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database-url]");
}
try {
  if (["dry-run", "migrate", "advisors"].includes(command)) {
    const args =
      command === "advisors"
        ? [
            "db",
            "advisors",
            "--db-url",
            connection,
            "--type",
            "security",
            "--level",
            "warn",
            "--fail-on",
            "error",
          ]
        : [
            "db",
            "push",
            "--db-url",
            connection,
            "--skip-vault",
            "--yes",
            ...(command === "dry-run" ? ["--dry-run"] : []),
          ];
    const output = execFileSync("npx", ["--yes", "supabase@2.122.0", ...args], {
      encoding: "utf8",
      stdio: "pipe",
    });
    console.log(safe(output));
  } else {
    const client = new pg.Client({
      connectionString: connection,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    });
    try {
      await client.connect();
      if (command === "inspect") {
        console.log(
          (
            await client.query(
              "select schemaname,tablename from pg_tables where schemaname in ('public','studio_private') order by 1,2",
            )
          ).rows,
        );
      } else if (command === "test") {
        await client.query(readFileSync("tests/studio-database.sql", "utf8"));
        console.log(
          "Hosted rollback SQL suite passed (authorization, quota and lifecycle).",
        );
      } else if (["pause", "enable-local"].includes(command)) {
        if (
          command === "enable-local" &&
          (process.env.STUDIO_LOCAL_DEVELOPMENT !== "true" ||
            process.env.VERCEL ||
            process.env.STUDIO_ORIGIN !== "http://localhost:3000")
        )
          throw new Error("Local-only generation guard is required");
        await client.query(
          "update studio_private.studio_quota set enabled=$1 where singleton",
          [command === "enable-local"],
        );
        console.log({
          generationEnabledForLocalTesting: command === "enable-local",
        });
      } else throw new Error("Unknown database command");
    } finally {
      await client.end();
    }
  }
} catch (error) {
  // exec errors may contain the secret-bearing child argv; never print the object/stack.
  console.error(
    safe(error.stderr?.toString() || error.message).replace(
      /Command failed:[^\n]*/g,
      "Database command failed",
    ),
  );
  process.exitCode = 1;
}
