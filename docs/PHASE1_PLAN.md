# Phase 1 implementation plan

**Goal:** Deliver a calm, polished Higgsfield-inspired Explore workspace with useful discovery and grouped navigation. Candidate acceptance remains pending until manual UI review.

**Architecture:** One Next.js App Router application at the repository root. Render the initial collection locally; use small client components for navigation, search/filter state, and Radix overlays. No backend, account, billing, model calls, or persistence services.

**Stack:** TypeScript, Next.js, React, Tailwind, shadcn/ui with Radix and preset `b6SuZl7d7Q`, Lucide. Record the actual installed versions and preset inspection in the QA report.

**Source of truth:** [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and the candidate's Phase 1 brief. Execute inline in the current capture-enabled repository; preserve existing history and capture artifacts.

**Visual direction approved by the candidate on 2026-10-23:** [Superdesign v1](https://p.superdesign.dev/draft/61e6ccfc-8cf2-4ee2-b6e7-a4d0d1dbb4ca), saved as [the visual reference](design/phase1-reference.html). The approval authorizes implementation; final acceptance still requires inspection of the working local app. The generated reference covers the shell, hero, and intent cards; the required searchable gallery, interaction states, responsive rules, and accessibility are implemented from the brief.

## Capture and repository preflight

- [x] Read `CAPTURE-TEST.md`: PASS.
- [x] Verify the first actual assignment-session prompt is the original agent-capture installation prompt.
- [x] Verify exact canary prompts and real final responses in two distinct transcript-backed sessions.
- [x] Confirm `.agent-logs/` exists, is not ignored, and contains this assignment prompt.
- [x] Run a persistent transcript watcher and verify its live heartbeat/held lock across commands.
- [x] Inspect the baseline: commit `744e1f3`, no existing application, clean tracked files before this turn.
- [x] Verify authenticated `gh` access outside the network sandbox.

Never manually edit capture entries. Use the watcher's append-only projection. Include available logs in milestone commits; a final response can only be captured after that response exists. Request sandbox permission if `.git/` protection prevents the requested commits, and report any rejected operation accurately.

## Design decisions

Choose a single editorial feature and a consistent image grid. Stacked template shelves repeat decisions; a generation-first composer would imply functionality outside this phase. Keep the recognizable discovery-to-studio workflow through grouped navigation and three intent cards: discover a visual direction, imagine an image, and plan a cinematic scene. The latter two explicitly identify the next phase.

Use an understated typographic identity, dark semantic surfaces, warm peach emphasis, restrained borders, and large legitimate source imagery. Explain the photographic inspiration and creative direction in previews. There are no fake generations or fabricated community metrics.

## Reviewable milestones

### 1. Foundation and provenance

Files: `package.json`, lockfile, `components.json`, Next/TypeScript/ESLint/PostCSS configuration, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/*`, `src/lib/utils.ts`, `public/fonts/`, `docs/DESIGN_SYSTEM.md`.

- [x] Inspect the current shadcn CLI and decode the supplied preset; choose Radix explicitly.
- [x] Bootstrap at the repository root without replacing capture files, ignore rules, or Git history.
- [x] Initialize from the supplied preset and inspect generated dependencies, style, and semantic variables.
- [x] Apply the complete custom dark palette, typography, spacing, geometry, motion, and reduced-motion rules.
- [x] Add only the primitives and dependencies Phase 1 actually uses; self-host fonts.
- [x] Commit foundation and available capture logs; verify the commit if permitted. Foundation and Explore were committed together in `0a3394b` after the plan milestone `acf414e`.

### 2. Navigation and editorial Explore

Files: `src/components/workspace/*`, `src/components/explore/*`, `src/lib/inspiration.ts`, `src/app/page.tsx`, `src/app/loading.tsx`, `public/images/`, `docs/ASSET_SOURCES.md`.

- [x] Build the 252/72 px desktop sidebar, grouped destinations, 64 px topbar, and 280 px Radix mobile drawer.
- [x] Explore is active; Image Studio, Cinematic Studio, My Assets, Brand DNA say Soon and have no working destination links.
- [x] Build an editorial heading/feature, exactly three intent cards, and a curated responsive grid.
- [x] Add a typed local dataset with descriptive alternatives, categories, useful style information, and image provenance.
- [x] Search title, category, tags, and creative direction; category filters combine with search. Show a live result count and a clear reset action.
- [x] Open accessible image previews with style information, source attribution, Escape/backdrop/close-button dismissal, focus trapping, and focus restoration.
- [x] Provide honest upcoming-feature explanations, keyboard/focus states, skeletons, an empty collection, no matches, and failed-image handling.
- [x] Commit this feature milestone with available capture logs; verify the commit if permitted. Verified `0a3394b` in Git history.

### 3. Verification and candidate handoff

Files: focused behavior tests where justified, `docs/PHASE1_QA.md`, `docs/screenshots/*`, `README.md`.

- [x] Run typecheck, lint, meaningful behavior checks, and a production build; fix failures. Four data tests pass; the supported Webpack build passes in this managed environment.
- [x] Run the local app and use connected Chrome DevTools MCP at **1440×900**, **1024×768**, **768×1024**, and **390×844**. Used an isolated headless instance of the actual MCP server because the registered headful launch had no usable display.
- [x] At each viewport inspect readability, grid/layout, overflow, and loaded images. Test desktop collapse and mobile drawer where applicable.
- [x] Test combined search/filter/reset, no results, preview dismissal, keyboard activation, focus trapping/restoration, disabled destinations, and reduced motion. Final production replay: **68/68 assertions**.
- [x] Inspect console errors and network failures. Save real screenshots and write a factual QA report including failures/resolutions and any untested items. Final Lighthouse navigation audit: **53 passed, 0 failed**, accessibility **100**.
- [x] Review for out-of-scope services, misleading working links, leaked credentials, and palette/spacing drift. Independent review completed; one optional combined-reset suggestion is documented as deferred.
- [x] Prepare the verified source, report, screenshots, and available logs for the final verification commit. Its actual hash is reported after Git confirms it.
- [x] Prepare the candidate handoff with the running local URL and screenshots in `docs/PHASE1_QA.md`. Later phases remain unimplemented.
- [ ] Candidate manually inspects the working app and explicitly approves Phase 1. Stop at Phase 1; acceptance does not automatically authorize later modules.

## Acceptance criteria

1. Capture prerequisites remain valid; raw capture entries are preserved.
2. The app runs from the current repository and builds successfully with documented versions.
3. Navigation contains the exact three groups and five destinations; only Explore works. Desktop collapse and the accessible mobile drawer work.
4. The page includes a clear editorial heading, three honest intent cards, a curated local collection, working combined search/filter, and meaningful accessible previews.
5. The design uses the supplied semantic tokens, fonts, dimensions, spacing scale, and motion constraints consistently.
6. All four requested viewport checks and real interaction checks are documented with actual outcomes and screenshots; no horizontal overflow, missing assets, or application console errors remain.
7. No later-phase implementation or fake integration is introduced.
8. **Acceptance requires the candidate's explicit approval after inspecting the UI. Automated QA does not grant acceptance.**
