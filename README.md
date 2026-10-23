# Higgsfield-inspired creative workspace

Explore provides grouped navigation and a curated searchable collection. Image Studio adds real Gemini generation in a two-pane creative workspace. Phase 1 was approved; Phase 2 awaits candidate visual approval.

## Run locally

Use Node **22.18 or newer**. The verified environment uses Node 22.19.0 and npm 10.9.3. Explore needs no credentials. For Image Studio, put `GOOGLE_GENERATIVE_AI_API_KEY` directly in ignored `.env.local`; never paste it into agent chat. See `.env.example` for non-secret configuration names.

```bash
rtk proxy npm ci
rtk proxy npm run dev
```

Open [localhost:3000](http://localhost:3000).

```bash
rtk proxy npm run typecheck
rtk proxy npm run lint
rtk proxy npm test
rtk proxy npm run build
rtk proxy npm run start
```

The production build uses Next's supported Webpack option. In this managed environment, Turbopack's PostCSS worker cannot open its local port, including after escalation; Webpack builds successfully. Development uses the standard Next development server.

## Product boundaries

Explore and Image Studio work. Cinematic Studio, My Assets, and Brand DNA remain **Soon**. Explore photographs are attributed source inspiration. Studio results are explicitly AI-generated; session history holds up to six images within a 32 MB data-URL budget and clears on reload or leaving Studio. Download images to keep them. No accounts, billing, asset library, Brand DNA, database, worker, video, or additional providers are implemented.

Studio defaults to Nano Banana 2 (`gemini-3.1-flash-image`) and also supports Nano Banana Pro (`gemini-3-pro-image`). Exact stable IDs passed real canaries; no preview aliases. Five supported aspect ratios are offered. Flash supports 512px/1K/2K/4K; Pro supports 1K/2K/4K. Higher resolutions were not used in QA. One image and one optional reference per request; references are decoded, bounded and normalized server-side. Regenerate uses the selected result's original settings/reference.

### Generation allowance and deployment

Each installation has a hard maximum of **20 dispatched attempts**, including failures and unknown outcomes, recorded under ignored `.studio-data/usage.json`. The allowance does not reset automatically. Only one generation runs at a time, with at most three starts per minute and at least ten seconds between starts. Requests have unique IDs, output/token/byte bounds and a 120-second provider deadline. There are no automatic retries.

Production generation fails closed unless `STUDIO_DURABLE_SINGLE_HOST=true` and an absolute `STUDIO_DATA_DIR` points to a persistent directory shared by all requests on **one Node host**. Preserve this ledger across releases/restarts. Configure exact `STUDIO_ORIGIN` behind a TLS reverse proxy. Vercel/AWS Lambda generation is disabled: a local file ledger is not a distributed/serverless safeguard. No public deployment is part of this assignment phase. A stale filesystem lock or corrupt ledger blocks generation; inspect pending jobs and reconcile with provider usage before an owner repairs it. Do not delete the ledger to silently reset spending.

## Project map

- `src/app/`: App Router entry points, preset CSS, semantic theme overrides, and shared responsive styles.
- `src/components/ui/`: shadcn Radix Luma primitives, adapted to the supplied control dimensions and semantic overlays.
- `src/components/workspace/`: desktop navigation and mobile drawer.
- `src/components/explore/`: editorial entry, search/filter collection, robust images, and previews.
- `src/lib/inspiration.ts`: the typed local collection and deterministic search/filter helper.
- `src/components/studio/`, `src/lib/studio/`, `src/app/api/image-studio/`: the complete generation journey, contracts, direct AI SDK Google adapter, and durable safeguard.
- `public/`: local source photographs, WOFF2 fonts, and font licenses.
- [Design system](docs/DESIGN_SYSTEM.md), [implementation plan](docs/PHASE1_PLAN.md), [asset provenance](docs/ASSET_SOURCES.md), and [QA report](docs/PHASE1_QA.md).

## Capture and browser verification

Read `AGENTS.md` and `CAPTURE-TEST.md` before assignment work. Start new agent sessions through `scripts/codex-captured`. Keep `.agent-logs/` tracked, preserve captured entries verbatim, and commit the available logs alongside meaningful work.

Browser QA uses the real Chrome DevTools MCP. The registered server's headful launch has no usable display in this managed session, so the QA bridge launches an isolated headless instance of the same MCP server. It forwards actual MCP tools; it does not simulate browser results.

With the app running, start the bridge in a separate terminal and run the checks:

```bash
rtk proxy python3 scripts/chrome_mcp.py server
```

```bash
rtk proxy python3 scripts/phase2_browser_qa.py --layout
rtk proxy python3 scripts/phase2_browser_qa.py --regression
```

The Phase 2 script targets page 2 in the bridge and saves measurements to `docs/phase2-browser-results.json`. `--journey` spends three real generations; `--mobile-generation` spends one 512px generation. Do not rerun these as routine checks. `scripts/verify_image_models.mjs` is also an explicit paid test (one request per model), run with `node --env-file=.env.local`. It writes only safe metadata and ignored local image files. The [Phase 2 QA report](docs/PHASE2_QA.md) records actual calls and limitations.

A credential was pasted into this conversation. Its automatic raw log remains untouched locally and must not be staged or pushed. The credential must be rotated; replacement values belong directly in `.env.local`. This exception is documented in `docs/PHASE2_PLAN.md` and the QA report; do not sanitize the original capture to make it publishable.
