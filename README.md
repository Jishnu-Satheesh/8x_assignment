# Higgsfield-inspired creative workspace

Phase 1 builds a calmer Explore experience: grouped navigation, an editorial starting point, three intent cards, and a small searchable collection with useful previews. The candidate approved the visual direction; acceptance of the working app remains pending manual review.

## Run locally

Use Node **22.18 or newer**. The verified environment uses Node 22.19.0 and npm 10.9.3. No API keys or environment variables are required.

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

Explore is the working destination. Image Studio, Cinematic Studio, My Assets, and Brand DNA are visibly marked **Soon**. The local collection supports search, category filters, resetting results, and accessible previews with light, composition, color, and source information. The photographs are inspiration, not generated results. This phase has no authentication, billing, generation, database, worker, or model integration.

## Project map

- `src/app/`: App Router entry points, preset CSS, semantic theme overrides, and shared responsive styles.
- `src/components/ui/`: shadcn Radix Luma primitives, adapted to the supplied control dimensions and semantic overlays.
- `src/components/workspace/`: desktop navigation and mobile drawer.
- `src/components/explore/`: editorial entry, search/filter collection, robust images, and previews.
- `src/lib/inspiration.ts`: the typed local collection and deterministic search/filter helper.
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
rtk proxy python3 scripts/phase1_browser_qa.py
```

The browser script saves its actual measurements and checks in `docs/phase1-browser-results.json` and screenshots under `docs/screenshots/`. It requires the local Chrome installation and network access for the on-demand MCP CLI. The QA report distinguishes tested behavior from states not naturally encountered in this static phase.
