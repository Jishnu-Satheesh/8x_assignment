# Phase 2 — Image Studio QA

Status: implementation verified locally; **candidate visual approval pending**. Scope stops at Image Studio. Local URL: http://localhost:3000/image-studio.

## Decisions

- Reused Next.js App Router, Radix/shadcn primitives, existing fonts and semantic graphite/coral tokens. After candidate review, Studio fills the available workspace width, with 400px controls on large desktops and 360px at medium widths. Controls scroll independently and keep Generate visible on desktop. Studio defaults to a 72px global rail; Explore retains expanded grouped navigation. Mobile uses the existing accessible drawer and a stacked workspace.
- Direct Google access through pinned `ai@7.0.150` / `@ai-sdk/google@4.0.104`; no Gateway or additional provider. Installed source forwards references, aspect ratio and resolution correctly. `generateText` supplies the final image and actual response model metadata. An official Google SDK fallback was unnecessary.
- Supported stable IDs: `gemini-3.1-flash-image` (default Nano Banana 2), `gemini-3-pro-image` (Nano Banana Pro). Only successful canaries enable models. No preview aliases, video models, ignored seed controls, or fake integrations.
- Generated asset/job contracts preserve AI provenance, actual model, prompt/settings, dimensions, creation time, job ID and reference lineage. Generated-reference IDs are checked against recorded content hashes. Explore imagery stays explicitly source photography.

## Actual verification

| Check | Result |
| --- | --- |
| TypeScript, lint, Webpack production build | Pass |
| Focused Node tests | 13 passing: Explore filtering; Studio request validation; durable cap/concurrency/duplicates/throttling/corruption; completion contention; exact SDK model/settings/reference serialization and safe blocked/429 handling |
| Real Chrome DevTools | 41 recorded checks pass in `phase2-browser-results.json` |
| Initial verification viewports | 1440×900, 1024×768, 768×1024, 390×844; initial controls 336px, desktop rail 72→252→72, tablet/mobile drawer 280px; no horizontal overflow. The width refinement below supersedes the original pane measurements. |
| Keyboard/focus | Real typing in prompt, native model/options controls, validation focuses prompt, drawer Tab/Escape/focus return, keyboard Enter on Regenerate, Explore preview Escape/focus return |
| Generation journey | Real output from each model; uploaded reference; generated image reused with verified lineage; session history selection; Regenerate retained original prompt/model/options/reference after draft changed |
| Downloads | Actual JPEG files from both model outputs saved to Downloads; SHA-256 matched the server's generated-asset records |
| Mobile | Real 512px generation in touch/mobile emulation, output and all three actions fit the responsive workspace; reduced-motion emulation |
| Errors | Corrupt reference rejected; unsupported model, Pro 512px, unknown setting and malformed reference rejected server-side; offline error explains credit uncertainty and allows recovery |
| Deployment guard | Separate production runtime without durable-host opt-in showed generation disabled; no provider request made |
| Secrets/capture | Actual credential absent from built client artifacts and staged changes. Watcher live, error null, two verified sessions. Credential-bearing raw log preserved locally and excluded from commits |

Layout and generation paths had no Chrome console errors/warnings. Negative tests intentionally produce invalid-image/4xx/offline console messages; those are expected test outcomes, not claimed absent. Checks used the **real headless Chrome DevTools MCP**, via the existing bridge, not simulated browser results.

## Paid request accounting

- Two initial canaries: one Flash 512px request, one Pro 1K request; each succeeded in one call with no SDK warnings. Safe evidence: `phase2-model-verification.json`; generated canary files remain ignored locally.
- One app reference request failed with a safe provider error. The exact underlying failure was not retained; it is not attributed to a confirmed cause. Its reservation remains consumed. No automatic retry occurred.
- One standalone small reference diagnostic succeeded using the same adapter.
- Four subsequent app requests succeeded: Flash 512px with uploaded reference, Pro 1K with generated reference, Pro 1K keyboard Regenerate, Flash 512px in touch/mobile mode.
- Eight intentional generation attempts in total, seven successful. No high-resolution test, automatic retry, grounding/search or batch generation. Provider billing for the failed attempt is not asserted.
- The app ledger currently records five attempts (one failed, four successful), leaving 15 of its fixed 20 attempts. The three explicit canary/diagnostic calls were outside the app ledger and are accounted above.

## Failures and resolutions

1. The first cached production artifact omitted Studio CSS imported through global CSS. Importing the stylesheet directly from the Studio route produced the correct layout; measured and visually inspected afterward.
2. Next's internal bind-address URL used `0.0.0.0`, causing a same-origin mismatch with `localhost`. The check now uses the HTTP authority, with an exact configured origin available behind a TLS proxy. Rejected requests made no provider calls.
3. Chrome's textarea `fill` changed DOM value without React state. Tests now use actual keyboard input and confirm the live count. Native selects require visible option text. These were test-interaction corrections, not fabricated success evidence.
4. Changing Chrome to mobile mode reloaded the page and cleared documented transient history. One separate small mobile generation verified the real mobile path; completed desktop generations were not replayed.
5. Focused independent review found completion bookkeeping could fail immediately on a short ledger lock conflict after a paid image was ready. Local lock acquisition now waits up to two seconds; tests cover contention and exhausted waiting. A completed image is returned even if completion indexing fails, while its allowance remains consumed. In that rare state, download remains available and reference reuse is explicitly disabled with upload guidance. This rare UI fallback was not forced in Chrome and no further paid generations were used for this bookkeeping fix.

## Limits and retained trade-offs

- History is in memory, limited to six images and a 32 MB data-URL budget. Reloading or leaving Studio clears it. Original references are retained for regenerating those results. This is not the future persistent Assets module.
- The hard cap is 20 dispatched attempts per installation, including failed/uncertain outcomes; one active generation, three starts/minute and ten seconds between starts. Reservations persist before dispatch. No provider retries or allowance refunds.
- Production generation requires an explicit persistent single-Node-host configuration. Vercel/AWS Lambda generation stays disabled. The filesystem ledger is not claimed to be a distributed limiter. Abandoned locks or corrupt ledgers deliberately fail closed; an owner must reconcile usage before repairing them. Automatic abandoned-lock recovery was not introduced because ownership cannot be safely inferred across this managed environment's process namespaces.
- Provider timeouts, blocked/no-image responses and 429s are covered by transport checks; actual forced provider timeout/429 tests were not purchased. 2K/4K and every supported ratio were not generated. Supported UI choices derive from official capabilities and serialization checks. No physical-device/screen-reader, hosted, performance or public deployment qualification is claimed.
- The pasted credential must be rotated. Its raw capture must remain unchanged locally and must not be staged/pushed. This prevents committing that session's capture alongside the feature. Other capture setup and historical logs remain tracked. No capture system changes were made.

## Review artifacts

### Candidate width refinement — 2026-10-23

The candidate requested more workspace and controls width after visual review. At 1920px, the original Studio used 1480px of the 1848px available beside the rail. Studio now uses all 1848px; controls increase from 336px to 400px and the right workspace grows from 1144px to 1448px. Controls are 360px at 768–1279px; mobile remains stacked. The prompt hint can use its available row width instead of wrapping inside a fixed 160px cap. The loading layout shares the controls-width token. Explore keeps its 1480px editorial maximum.

Typecheck, lint and production build pass. Standalone typecheck was rerun after the build regenerated `.next/types`; the first concurrent run encountered those generated files being replaced, requiring no application change. Sixteen targeted real Chrome checks pass at 1920×1080, 1440×900, 1024×768, 768×1024 and 390×844, including expanded navigation at 1024px, visible desktop Generate, one-line model descriptions/hint, no overflow, no missing images, no console errors/warnings, and Explore's retained width. Evidence: [width QA](phase2-width-qa.json). No new unit tests or generation requests were needed for this CSS change; provider usage is unchanged. The earlier generation screenshots and 41-check report document the original end-to-end verification.

- [Revised wide desktop](screenshots/studio-width-1920x1080.png)
- [Revised desktop](screenshots/studio-width-1440x900.png)
- [Revised mobile](screenshots/studio-width-390x844.png)

- [Desktop empty workspace](screenshots/studio-empty-1440x900.png)
- [Desktop generated result](screenshots/studio-generated-1440x900.png)
- [Processing state](screenshots/studio-processing-1440x900.png)
- [Mobile full workspace with result](screenshots/studio-generated-mobile-full.png)
- [Mobile navigation](screenshots/studio-mobile-navigation.png)
- [Mobile error state](screenshots/studio-error-390x844.png)

Official references: [Flash stable model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image), [Pro stable model](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image), [Google image capabilities](https://ai.google.dev/gemini-api/docs/image-generation), [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google).

No other module, public deployment, merge, or push is authorized by this handoff. Stop for candidate visual review and explicit Phase 2 approval.
