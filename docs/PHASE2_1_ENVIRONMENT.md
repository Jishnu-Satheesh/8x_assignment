# Phase 2.1 environment and deployment

The configured Supabase staging project is separate from the unrelated connected MCP account. Use the credentials placed directly in ignored `.env.local`. Never copy values into prompts, documentation or Git. The official Supabase CLI uses `SUPABASE_DB_URL`; migrations are versioned in `supabase/migrations/`. The session pooler on port 5432 works in this IPv4 environment, while the direct IPv6-only host does not.

| Variable | Next server | Trigger worker | Migration tooling | Browser |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Required | Required | Target check | No client needed |
| `SUPABASE_PUBLISHABLE_KEY` | Required for cookie Auth/RLS | — | — | Not currently sent |
| `SUPABASE_SECRET_KEY` | Required for guarded mutations/Storage | Required | — | Never |
| `SUPABASE_DB_URL` | — | — | Required, privileged | Never |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No generation in Next | Required | — | Never |
| `TRIGGER_PROJECT_REF` | Project configuration | Required | — | Never |
| `TRIGGER_SECRET_KEY` | Dispatch, run lookup and scoped tokens | CLI dev environment | — | Never |
| `TRIGGER_PROFILE` | — | Local CLI login profile | — | Never |
| `STUDIO_ORIGIN` | Exact allowed origin | — | — | — |
| `ABUSE_PROTECTION_SECRET` | Random server-side HMAC key | — | — | Never |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Build-time public site identifier | — | — | Yes |
| `TURNSTILE_SECRET_KEY` | Server challenge verification | — | — | Never |
| `STUDIO_CAPTCHA_MODE` | `required` by default; explicit owner-approved `disabled` for bounded assignment release | — | — | Never |
| `STUDIO_LOCAL_DEVELOPMENT` | Explicit loopback-only exception | Local tooling | Enable-local guard | Never |
| `STUDIO_WORKER_VERIFIED` | Production gate, default false | — | — | Never |

Local development needs a `tr_dev_` key and a CLI login profile authorized for the same project. A production API key alone cannot authenticate the CLI to a different account. The candidate logged into the authorized project through the `default` CLI profile; this repo uses `TRIGGER_PROFILE=default`. For a separate profile, run `rtk proxy npx trigger.dev@4.8.1 login --profile 8x-assignment` and set `TRIGGER_PROFILE=8x-assignment`. Run `rtk proxy npm run trigger:dev`. This starts a development worker; it does not deploy. The worker reads `.env.local` and calls the existing verified Gemini adapter. Trigger v4 runs Node 22 and installs Sharp as a native external dependency. The CLI's optional telemetry dependency currently requests Node 22.22 or newer; use a maintained compatible Node release for deployment.

Run `rtk proxy node --env-file=.env.local scripts/studio-db.mjs dry-run`, then `migrate` against the designated staging target. `test` executes the rollback SQL suite; `advisors` runs official security advisors. `enable-local` enables the database kill switch only with the explicit localhost guard; `pause` stops new reservations while retaining images/jobs. Legacy attempts remain a nine-attempt global offset, without assigning old browser images to invented users. All reservations, including failures and uncertain outcomes, remain consumed. The initial total lifetime ceiling is 20, per identity 3, per keyed network 3 by migration default (this staging review uses 6, with three QA reservations already consumed), active jobs 2, starts 3/minute with a 10-second gap. Changing these requires an intentional database operation; nothing automatically resets them.

Auth uses real anonymous Supabase identities and HttpOnly cookie sessions. Clearing cookies or changing devices loses access; account linking/recovery is outside this phase. Supabase Auth CAPTCHA must match the site's Turnstile configuration. For local-only staging verification, the owner may temporarily disable Auth CAPTCHA; public generation still fails closed without the public protections. A global PostgreSQL counter limits paid work independently of how many anonymous accounts exist. Reference uploads are bounded separately to 10/user and 100 globally, including pending uploads; uploaded references are decoded and normalized, never accepted as arbitrary paths or URLs.

## Before any public deployment

**Final-sprint override, 24 October:** the candidate explicitly requested production CAPTCHA be disabled temporarily. `STUDIO_CAPTCHA_MODE=disabled` is the only production opt-out; missing Turnstile keys alone never enable it. This retains exact HTTPS origin checks, verified guest ownership, a Production Trigger key, the worker gate, private Storage and atomic global/user/network/rate/concurrency limits. The hard budget is not reset. Supabase Auth CAPTCHA must also remain disabled for this mode. Anonymous signup has no human challenge; retain Auth signup rate limits and treat this as a limited assignment release. Remove the opt-out and configure matching Turnstile keys/Auth protection to restore CAPTCHA. The generic `CAPTCHA` variable is unused.

- Obtain explicit deployment authorization. No Vercel release, Trigger worker deployment, production enablement or merge is authorized by Phase 2.1.
- Rotate/revoke the credential still present in the raw capture, update runtime secrets directly, and verify that every committed/pushed blob is safe. Preserve the raw records unchanged. Their publication is blocked while that credential remains usable.
- Configure separate production Supabase/Trigger environments and apply reviewed migrations intentionally. Keep the private bucket and policies, owner-only reads, and service-only mutation RPCs. Verify isolation with real identities and signed URL expiry in that environment.
- Enable Auth CAPTCHA and anonymous creation rate limits; configure matching Turnstile variables and the exact HTTPS origin. Vercel's trusted `x-vercel-forwarded-for` supplies the keyed network identity. The application never trusts generic forwarded-IP headers. Restrict origin and use Secure cookies on Vercel.
- Deploy the focused Trigger worker only after authorization. Verify actual task registration, environment secrets, concurrency, retry guards and full image persistence against that deployment; local dev execution is separate evidence. Then explicitly set `STUDIO_WORKER_VERIFIED=true` and enable the database kill switch with the intended hard budget.
- Verify frontend build-time CAPTCHA configuration, Auth refresh, private downloads, Realtime read-one-run token scope, polling fallback and generated history. Vercel does not need a writable usage-ledger filesystem or Gemini image-generation execution time.

## Reliability boundaries

The task payload contains only a job ID. The database claim and one-way provider marker fence duplicate/manual replay beyond Trigger's idempotency TTL. Gemini and whole-task retries are disabled. Upload/finalization retries operate on the same bytes and deterministic object path. A verified saved object can be finalized later without Google. A crash before the object is saved can lose the returned bytes; that outcome is reported as uncertain and consumes the reservation. The product offers a deliberate new generation, never an automatic paid replay.

Authenticated job polling remains available when Realtime is unavailable. It reconciles terminal Trigger runs and verifies the durable asset outcome; a completed Trigger run alone is insufficient. There is no separately deployed periodic reconciler: recovery occurs when the owner opens/queries the workspace, or through the task's failure hook. A prolonged Trigger/database outage retains the job/reservation until those services recover. Reference-upload failures retain bounded pending reservations; automatic garbage collection and full asset management are outside this phase.

Sources consulted: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous), [Storage policies](https://supabase.com/docs/guides/storage/security/access-control), [Trigger idempotency](https://trigger.dev/docs/idempotency), [retries](https://trigger.dev/docs/errors-retrying), [Realtime auth](https://trigger.dev/docs/realtime/auth), [React hooks](https://trigger.dev/docs/realtime/react-hooks/overview).
