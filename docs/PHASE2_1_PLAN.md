# Phase 2.1 — Durable Image Generation

Status: implementation in progress. The candidate configured dedicated staging Supabase and Trigger development credentials, authorized CLI migrations against staging and current-key local paid tests, and enabled anonymous sign-ins. No deployment, merge or push is authorized. Phase 2’s approved layout and Gemini adapter are preserved.

## Preflight

- Read `AGENTS.md`, `CAPTURE-TEST.md`, Phase 2 plan/QA and capture-recovery report. Automatic watcher is running without errors; the original two real-session canaries remain verified. Do not change capture or reformat raw logs.
- Started from `feat/phase2-image-studio` at `3bb0f9d`; preserve all existing commits on `feat/phase2-1-durable-generation`.
- Inspected `service.ts`, `provider.ts`, `usage.ts`, contracts, generation route and frontend state. The SDK already has zero Gemini retries, bounded image output and a 120-second timeout. References are decoded/normalized with Sharp. The current endpoint waits for generation and returns base64; history is React state; quota/lineage records use local files.
- The connected Supabase account exposes only `lunes-ai-staging`. The candidate confirmed the assignment uses a different account/project. Leave the connected project untouched. No assignment Supabase/Trigger config exists in this repo; only `GOOGLE_GENERATIVE_AI_API_KEY` is currently configured locally.
- No local Supabase, Docker, PostgreSQL or Trigger CLI executable is installed. A Trigger CLI profile directory exists, but that does not establish authenticated access to the assignment project. No callable Trigger MCP is available in this session.
- Consulted current official SSR/anonymous-auth/Storage docs and Trigger v4 task/retry/idempotency/Realtime docs. Current package metadata: Supabase JS 2.118.0, SSR 0.12.7; Trigger SDK/React hooks/build 4.8.1. Pin and inspect installed APIs before implementation. Existing Node 22 satisfies the current Supabase requirement. Explicit grants are required in addition to RLS under Supabase's current Data API exposure rules.

## Files and dependencies

| Area | Planned changes |
| --- | --- |
| Auth | `src/lib/supabase/server.ts`, `admin.ts`, `database.types.ts`, `src/proxy.ts`, `src/app/api/image-studio/session/route.ts`; cookie sessions with `@supabase/ssr`, fresh verified identity for paid operations |
| Database | `supabase/migrations/` and focused SQL/integration tests; inspect the selected project's existing schema before preparing/applying additive migrations |
| Provider | Extract the existing verified Google adapter into a worker-compatible server module; retain a `server-only` Next wrapper. Preserve both stable IDs, reference normalization, settings and zero retries. Do not import React's `server-only` sentinel into a standalone Node worker |
| Durable workflow | `src/lib/studio/durable/` for repository, validation, quota/dispatch and storage operations; retire filesystem quota/lineage from the active generation path |
| Task | `src/trigger/generate-image.ts`, `trigger.config.ts`; one focused task using pinned Trigger v4 SDK and the existing Sharp dependency |
| API | Refactor `generate/route.ts`; add reference-upload, owned job status/history, per-run Realtime token, authorized image/download and persistence-recovery endpoints as needed |
| UI | Update `image-studio.tsx`, `studio-viewer.tsx`, and a focused Realtime subscription component. Keep current widths/tokens; replace in-memory history/base64 results with durable IDs, metadata and authorized URLs |
| Documentation/tests | Environment example, deployment checklist, focused failure tests, `docs/PHASE2_1_QA.md`, real desktop/mobile screenshots |

New runtime dependencies are limited to `@supabase/supabase-js`, `@supabase/ssr`, `@trigger.dev/sdk`, `@trigger.dev/react-hooks`; use matching `@trigger.dev/build` only where the native Sharp worker build needs it. No ORM, separate queue service, monorepo or new image provider.

## Data and authorization contracts

- `generation_jobs`: UUID ID, verified owner, client request UUID, validated prompt/model/settings, reference asset ID, stage, dispatch state/run ID, durable provider-dispatch marker, validated output journal, safe error code/message and timestamps. Unique `(user_id, request_id)` and unique non-null Trigger run ID. Ownership and reference foreign keys prevent cross-user lineage.
- `assets`: UUID, verified owner, kind (`generated` or `reference`), generation job where applicable, private bucket/path, MIME/dimensions/bytes/SHA-256, prompt/model/settings, original reference lineage and creation time. One generated asset per job; deterministic private output path per owner/job. Stable IDs allow later Brand DNA/Blueprint/feedback references without those modules now.
- `generation_usage`: one unique reservation per job/request, verified owner, status (`reserved`, `attempted`, `succeeded`, `failed`, `uncertain`), timestamps and pseudonymous abuse key if configured. Failed/unknown paid attempts remain consumed. Never remove usage implicitly when an anonymous identity disappears.
- One private quota-control row supplies an atomic global lifetime counter, rate/concurrency limits, per-user ceiling and generation kill switch. Start disabled. Reservation/job creation/counter increments occur in one PostgreSQL transaction under row locking. Trigger concurrency is secondary protection.
- Preserve legacy filesystem attempts as a global budget offset, without inventing their user ownership. The current ledger has nine consumed attempts (one failed, eight succeeded), leaving 11 of the overall 20 allowance unless the owner explicitly chooses a new budget. This exceeds the earlier Phase 2 QA snapshot of five. Disable the old generation path and reconcile a final ledger snapshot at cutover; do not assume this preflight count stays constant. Do not import browser-only assets into an arbitrary new user's account.
- Enable RLS on all application tables and add explicit SELECT grants/policies for `(select auth.uid()) = user_id`. Browser/user roles cannot insert jobs/assets/usage, update owners/status or execute quota/worker mutation RPCs. Server mutation functions are service-role-only, with public/anon/authenticated EXECUTE revoked and fixed search paths. Add owner/history, status and foreign-key indexes.
- Use a private Storage bucket. Allow only owner-scoped authenticated reads; writes flow through validated server/worker operations, with bounded upload counts/bytes. Keep privileged keys server-side. Issue short-lived signed image access after ownership checks and an authenticated download route. Return no image bytes/base64 through job status or Realtime.

## Auth and abuse controls

Use real Supabase anonymous users with cookie refresh through Next 16 `proxy.ts`. Paid endpoints verify identity through Auth, not an unverified session object or user-editable metadata. Studio and private API responses are dynamic/private/no-store. Requests use same-origin checks and bounded bodies.

Use Supabase-supported CAPTCHA/rate limits for anonymous creation before public use, plus generation CAPTCHA/trusted-request abuse controls and authoritative global limits independent of identity. A new anonymous account cannot reset the global counter, concurrency or rate budget. Per-user ceilings and, where the deployment provides a trusted network identity, a keyed network budget provide additional bounds. Do not trust arbitrary forwarded-IP headers.

The UI explains that anonymous ownership survives reload/navigation on the same browser, but clearing cookies or changing devices loses access. Do not implement account linking/registration in this phase.

## Job lifecycle and paid-operation safety

1. Authenticate, validate model/settings and owned reference, then atomically create the job/reservation. Duplicate requests return the existing authorized job without consuming quota again.
2. Dispatch `{jobId}` only to `generate-image`, using a stable job-derived Trigger idempotency key. Persist the returned run ID. On ambiguous dispatch, retain the reservation and reconcile the existing run; do not silently enqueue another task. Return HTTP 202 promptly.
3. Task loads the authorized stored job/reservation, claims execution atomically, retrieves/validates the private reference, and reports `preparing`. It never accepts caller-supplied ownership, prompts, bytes or credentials in its payload.
4. Persist a one-way provider-dispatch marker before the Gemini request, then report `generating`. Both SDK retries and whole-task retries are disabled (`maxRetries: 0`, `maxAttempts: 1`). PostgreSQL guards remain effective for duplicate events and manual run replay after Trigger's idempotency TTL expires.
5. Validate the response, journal output metadata, report `saving`, and upload to the deterministic private path. Retry bounded Storage/database operations independently with the same bytes and object key. On an ambiguous upload, verify the existing object's hash instead of overwriting or generating again.
6. Atomically persist the asset and complete job/usage, then report `completed`. A Trigger run completing alone never proves asset success. Duplicate finalization returns the existing asset. Stale/terminal runs are reconciled from durable state.
7. Recovery may verify an already saved object and retry metadata finalization without Gemini. A crash/timeout after dispatch with no recoverable object becomes failed/uncertain, with consumed accounting; never automatically replay the paid request. Preserve safe error information and explain manual new-generation consequences.

Use actual `queued → preparing → generating → saving → completed/failed` UI stages. Internal dispatch/uncertainty states map to honest explanations, with no fabricated percentage. Trigger metadata contains only safe stage/ID information. Realtime access tokens are short-lived and read-only for an authenticated user's single stored run; refresh requires a fresh ownership check. Use documented `useRealtimeRun`, with authenticated status polling as fallback. Every apparent run completion re-queries the database and asset outcome.

## Environment variables — names only

| Runtime | Names |
| --- | --- |
| Next server | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, `STUDIO_ORIGIN`, `ABUSE_PROTECTION_SECRET` |
| CAPTCHA | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public site identifier), `TURNSTILE_SECRET_KEY` (server only); corresponding Supabase Auth CAPTCHA configuration |
| Trigger worker | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`; selected development project/environment and CLI authentication |
| Optional development migration access | `SUPABASE_DB_URL` only if the owner chooses local CLI/SQL access instead of connecting the correct account through MCP |

The browser receives no Supabase secret/service-role key, Trigger secret, Gemini key or database password. Supabase clients can stay server-side; only the CAPTCHA site identifier and owner-scoped ephemeral Realtime token reach the browser. The old `STUDIO_DATA_DIR` / `STUDIO_DURABLE_SINGLE_HOST` settings leave the active generation path. Missing configuration keeps paid generation disabled. Store values directly in ignored environment files/platform settings, never in chat or committed files.

## Implementation and acceptance gates

- [x] Inspect current code/capture/branch, official docs and environment names; identify missing target configuration.
- [x] Dedicated staging configuration verified by value-free URL/project matching. Supabase CLI migrations authorized; unrelated connected project untouched.
- [x] Candidate explicitly authorizes the current Gemini credential for local paid tests until Vercel deployment. The still-sensitive raw capture stays local and uncommitted. Rotation/revocation remains a publication/deployment gate.
- [ ] Implement migrations, private policies and atomic functions; prove cross-user and unauthenticated denial, duplicate/concurrent reservation limits and retained uncertain accounting against the designated development database.
- [ ] Implement cookie auth, bounded uploads, asynchronous API, one worker and persistence recovery. Verify stale dispatch, duplicate task, worker-crash boundary and independent save retries using mocks rather than repeated paid calls.
- [ ] Recover active/completed jobs and full metadata after reload/navigation; download, regenerate original settings/reference, and reuse an owned generated asset.
- [ ] Run typecheck, lint, build, focused unit/integration checks and targeted real Chrome desktop/mobile/Explore regression. Plan at most two small real generations initially; justify any additional call by an uncovered acceptance criterion. Use the current credential only under the candidate’s explicit local-testing authorization. Never publish the sensitive raw capture.
- [ ] Document exactly which SDK, database, worker, Storage, browser and failure checks ran. Public readiness remains **not qualified** until actual hosted deployment/auth/CAPTCHA/worker checks pass and deployment is explicitly authorized.
- [ ] Commit safe increments and available safe capture evidence; no push, merge, remote worker deployment or production enablement without authorization. Stop for Phase 2.1 visual approval.

## Required owner intervention

Supply identifiers for the separate assignment Supabase and Trigger projects, configure the listed secrets directly, choose how reviewed development migrations will be applied, and enable the required anonymous-auth/CAPTCHA settings on that project. Confirm explicit authorization before any hosted schema mutation or worker deployment; running a configured local development worker is distinct from deploying production. The unrelated connected account is not an acceptable substitute.

The existing raw capture includes the old credential. Preserve it; do not redact or delete entries. Rotation was confirmed by the candidate, but publishability must be assessed against the usable-credential restriction before including any such log in a public commit. This is a logging/security conflict to document, not a reason to fabricate a clean transcript.

## Official references consulted

[Supabase SSR/Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs), [anonymous auth](https://supabase.com/docs/guides/auth/auth-anonymous), [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [current Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [Trigger task configuration](https://trigger.dev/docs/tasks/overview), [idempotency boundaries](https://trigger.dev/docs/idempotency), [bounded operation retries](https://trigger.dev/docs/errors-retrying), [Realtime authentication](https://trigger.dev/docs/realtime/auth), [React hooks](https://trigger.dev/docs/realtime/react-hooks/overview), [Trigger project configuration](https://trigger.dev/docs/config/config-file).
