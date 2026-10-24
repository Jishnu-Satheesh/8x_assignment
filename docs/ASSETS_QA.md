# Minimal My Assets QA

Date: 24 October 2026. Branch: `feat/minimal-assets`. **Approved by the candidate, published to main, and verified in Production.** Public deployment was qualified before 10:00 AM IST, meeting the conditional 10:30 gate. Feature work stopped after the checks below passed, before the 11:30 cutoff.

Public route: **https://8x-assignment-ecru.vercel.app/assets**. Approved implementation commit `96b37b8` was fast-forwarded into `main`, preserving the existing history. Local review remains available at http://localhost:3000/assets.

## Actual checks

| Area | Outcome |
| --- | --- |
| Static checks | Typecheck, full lint and production build passed; `/assets` registered as a dynamic route. Existing 42 tests passed. No dependency or migration changes. |
| Real owned gallery | Used the genuine anonymous QA identity that owns Production asset `5a2c67bd-81b6-4fcf-844e-2ce25a34e92c`. Local APIs verified the same owner and returned the actual persisted AI-generated image. No successful asset response was mocked. |
| Session setup | A private loopback QA harness transferred that test identity's genuine HttpOnly session into an isolated local browser context. Supabase continued to verify it normally. Tokens were never printed or committed. The temporary bootstrap server was stopped after setup. |
| Gallery / metadata | One saved image, correct original prompt, Nano Banana 2, 512×512, 1:1, 512px and actual creation date. Explicit AI-generated source label. |
| Download | Actual preview Download button worked. Authorized bytes: 161,876; SHA-256 `5a82e785e93f41f7d5effc20489d210b4b86869461099ce8be7abc7ad034380f`, matching the Production asset/database. |
| Responsive | Real Chrome DevTools MCP at 1440×900, 1024×768, 768×1024, 390×844. Zero horizontal overflow/missing images. Three desktop columns, two intermediate/tablet columns, one mobile column. |
| Preview / keyboard | Accessible Radix dialog showed real image and metadata. Escape closed it and restored focus to its card. Mobile dialog width 358px, maximum height 812px, close button visible, zero horizontal overflow. |
| Navigation | My Assets active; desktop sidebar 252px. Entering Image Studio restored its default 72px rail and displayed the existing image; returning to Assets restored the gallery. Mobile drawer showed My Assets active with focus inside. |
| Reload | The same persisted asset returned after browser reload and route navigation. |
| Loading | Three skeleton cards and busy status appeared during refresh; refresh disabled while loading. |
| Guest / empty | Separate clean browser context showed guest entry. Actual anonymous sign-in reached an authenticated zero-image state. Its Open Image Studio link navigated correctly. No generation call. |
| Failure / retry | Mocked one history HTTP 503: clear error and Try again, then recovery using the real API. Deliberately missing preview image produced fallback; Reload preview recovered the real image. Mocked download 503 produced visible error; retry downloaded successfully. |
| Explore regression | Perfume search + Product filter returned one result; no overflow. |
| Console | Fresh final normal path had no errors/warnings. The deliberately missing image generated an expected 404 during the negative case. |
| Usage | At local QA completion: 14/20 consumed, six remaining. Final release check: 15/20 consumed, five remaining; an additional completed job was recorded during final review. **Assets automation made zero paid calls.** |
| Capture | Watcher healthy, no error, two real canaries retained; capture configuration and scripts unchanged. Available automatic logs remain tracked and unedited. |

## Resolution and limits

Lint caught state updates in the initial loading effect. Loading now applies asynchronous request results with cancellation guards; the final lint/typecheck/build and browser checks passed. No lint rule was disabled.

The gallery uses the existing recent-history API, currently capped at 24 completed generated images. There is no pagination, deletion, bulk management or feedback workflow. Guest identity is browser-bound; clearing cookies loses access. Preview image failures offer an explicit retry. No Image Studio generation settings or provider behavior changed.

The existing server-side ownership/RLS/private Storage contracts are reused. Production isolation and signed URL evidence are in [final release QA](FINAL_SPRINT_QA.md). Production checks on the published commit passed: the genuine owner saw the same saved image, preview metadata and matching download; reload recovered it. A second authenticated identity saw zero images. Public desktop/mobile had no overflow, missing images or normal-path console errors. Twelve deployed Assets client chunks contained no configured privileged credentials.

## Screenshots and results

- [Desktop gallery](qa/assets-desktop-gallery.png)
- [Desktop preview](qa/assets-desktop-preview.png)
- [Mobile gallery](qa/assets-mobile-gallery.png)
- [Mobile preview](qa/assets-mobile-preview.png)
- [Guest state](qa/assets-mobile-guest.png)
- [Authenticated empty state](qa/assets-mobile-empty.png)
- [Mocked request failure](qa/assets-error-state.png)
- [Browser results](qa/assets-browser-results.json)

## Production evidence

- [Public desktop gallery](qa/assets-production-desktop.png)
- [Public mobile gallery](qa/assets-production-mobile.png)
- [Production browser results](qa/assets-production-results.json)

The deployed download returned HTTP 200, 161,876 bytes and the same SHA-256 shown above. Production verification reused the existing saved image and made no further provider calls. Candidate visual and publication approval is retained in automatic capture.
