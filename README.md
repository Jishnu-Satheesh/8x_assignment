# Creative workspace — 8x assignment

A Higgsfield-inspired workspace with curated Explore discovery and a working Image Studio. It uses the assignment's graphite/coral design system, grouped navigation and responsive creation workspace.

Explore and Image Studio are approved. Phase 2.1 adds real guest identities, persistent private images, background generation and reload recovery. The verified public app is [8x-assignment-ecru.vercel.app](https://8x-assignment-ecru.vercel.app). See [final QA](docs/FINAL_SPRINT_QA.md) for production evidence and limits.

## Run locally

Use Node **22.18 or newer**. Install pinned dependencies and put configuration directly in ignored `.env.local`, using `.env.example` for variable names. Never paste credentials into an agent conversation or commit an environment file.

```bash
rtk proxy npm ci
rtk proxy npm run dev
```

Open [localhost:3000](http://localhost:3000). Explore works without external services. Image Studio needs the configured Supabase project, Gemini key, Trigger Development key and connected development worker:

```bash
rtk proxy npm run trigger:dev
```

The [environment guide](docs/PHASE2_1_ENVIRONMENT.md) covers migrations, Auth, variables and production gates. Migrations are in `supabase/migrations/`; use the intended hosted project and official migration workflow. Do not reset usage or repurpose another project's database.

## What works

- Search/filter inspiration and inspect style/source details.
- Open a guest Image Studio, write a prompt and optionally upload a reference.
- Generate with Nano Banana 2 (`gemini-3.1-flash-image`, default) or Nano Banana Pro (`gemini-3-pro-image`). Only supported ratios/resolutions are exposed.
- Follow real queued/preparing/generating/saving stages, with Realtime and authenticated polling recovery.
- Reload or navigate away and recover jobs/images. Inspect original metadata, download, regenerate with original settings or reuse an image as a reference.

Guest ownership is tied to the browser's Supabase session. Clearing cookies or switching devices loses access; account linking/recovery is not implemented. Attributed source inspiration is distinguished from AI-generated images. A minimal My Assets gallery is implemented on `feat/minimal-assets` and awaits visual review/publication approval; see [Assets QA](docs/ASSETS_QA.md). Cinematic Studio and Brand DNA remain **Soon**.

## Architecture and safeguards

Next.js authenticates/validates, atomically reserves PostgreSQL usage, creates a durable job and returns after Trigger dispatch. The focused `generate-image` task calls Gemini, validates the output, writes private Supabase Storage and finalizes its asset. Next.js does not wait for the paid operation or use a filesystem usage ledger.

Owner RLS and verified sessions protect jobs/assets. Privileged credentials stay server-side. Images use authorized retrieval and temporary signed URLs. Public generation requires exact HTTPS origin protection, a verified Production worker and the database kill switch. CAPTCHA is required by default; the candidate authorized temporary `STUDIO_CAPTCHA_MODE=disabled` while retaining database quotas and rate limits. Anonymous signup has no human challenge in that mode.

The initial hard lifetime budget is **20 attempts**, including the nine-attempt legacy offset. Failed and uncertain requests remain counted. User, keyed-network, rate and concurrency limits also apply. No automatic reset or paid retry occurs. A worker crash before Storage can lose the returned output; recovery never replays an uncertain Gemini call. See the [environment guide](docs/PHASE2_1_ENVIRONMENT.md) for limits and reliability boundaries.

## Verification

```bash
rtk proxy npm test
rtk proxy npm run typecheck
rtk proxy npm run lint
rtk proxy npm run build
```

Run build and typecheck sequentially. `rtk proxy npm run test:db` runs the hosted rollback SQL suite against the explicitly configured assignment database. Browser QA uses real Chrome DevTools MCP; an isolated headless bridge is available through `rtk proxy python3 scripts/chrome_mcp.py server` when the connected browser cannot launch.

Do not routinely run `scripts/verify_image_models.mjs` or historical paid journey scripts: they consume credits. Prior local evidence includes 38 tests, typecheck/lint/build, database isolation/quota checks and three real background generations. [Phase 2.1 QA](docs/PHASE2_1_QA.md) distinguishes development-worker evidence from production checks.

## Project and submission evidence

- `src/components/explore/`, `src/lib/inspiration.ts`: local discovery.
- `src/components/studio/`, `src/app/api/image-studio/`: creation UX and authorized APIs.
- `src/lib/studio/durable/`, `src/trigger/generate-image.ts`: lifecycle, dispatch, persistence and guarded worker.
- `src/lib/supabase/`, `src/proxy.ts`, `supabase/migrations/`: identity, cookie refresh, schema and policies.
- [Design system](docs/DESIGN_SYSTEM.md), [source imagery](docs/ASSET_SOURCES.md), [Phase 1 QA](docs/PHASE1_QA.md), [Phase 2 QA](docs/PHASE2_QA.md), [sprint plan](docs/FINAL_SPRINT_PLAN.md).

Read `AGENTS.md` and `CAPTURE-TEST.md` before work. Capture remains automatic and raw entries must be preserved exactly. A previously pasted credential was withheld from publication until revocation; the old key now returns HTTP 401 and its replacement is absent from capture. The original record can be preserved without publishing a usable credential. QA documents the incident and verification. `.vercelignore` excludes captures and secret files from deployment uploads without changing capture or Git tracking.
