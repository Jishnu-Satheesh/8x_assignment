# Final submission QA

Production qualified on **24 October 2026, before 10:00 AM IST**, satisfying the conditional 10:30 Assets gate. Public app: https://8x-assignment-ecru.vercel.app. Base Image Studio release `4104e8d`; Vercel production deployment `dpl_HJP9BFiCmVVWXhza5BsTo4xCW2X2`, main branch. Trigger Production version `20261024.1`. My Assets was subsequently candidate-approved, published from `96b37b8` and verified publicly; see [Assets QA](ASSETS_QA.md).

| Area | Actual verification |
| --- | --- |
| Release approval | Candidate explicitly approved the bounded public release, CAPTCHA opt-out, existing quotas and one 512px generation. |
| Build/regression | 42 tests passed, including four new production-protection cases. Typecheck, lint and production build passed. Hosted rollback SQL suite passed against the same assignment database. |
| Service targets | Vercel `8x-assignment`; Supabase `ejsvicehcmqwtlwkshrc`; Trigger `proj_lrqcmizeifueeloezqaj`, Production. Supabase migration `20261023190752` retained; no sprint migration. |
| Worker | One registered task, `generate-image`, version `20261024.1`; production secrets matched the intended project and replacement key. Task concurrency two and maxAttempts one retained. Actual Production run completed with a persisted asset. |
| Authentication | Real guest sign-in through the public UI; HttpOnly, Secure and SameSite=Lax cookie attributes verified privately through Chrome network metadata. Identity and image survived active reload and navigation. |
| Paid journey | Exactly one HTTP generation request: Nano Banana 2, 512px, 1:1. Job/asset `5a2c67bd-81b6-4fcf-844e-2ce25a34e92c`; run `run_06gmo8ttp4ljs4pumi51i52pa2`. Reload recovered the same generating job, then its completed 512×512 image. |
| Download | Actual Download button exercised. Authorized JPEG attachment: 161,876 bytes, SHA-256 `5a82e785e93f41f7d5effc20489d210b4b86869461099ce8be7abc7ad034380f`, matching the persisted database metadata. |
| Ownership/private access | A second genuine guest identity received 404 for the first owner's job, token, image and download. Unauthenticated history/job/image returned 401; cross-origin POST returned 403. Public Storage retrieval denied (400). Signed URL worked (200), then expired (400). |
| Accounting/idempotency | Exact duplicate POST returned 202 and the same job; Trigger run count stayed one and remaining usage stayed six. Unsupported Pro/512 returned 400 `UNSUPPORTED_SETTING`. Release QA consumption 14/20; final check 15/20 with five remaining after an additional completed job during review. No reset/refund/increase. Limits: three/user, six/keyed network, two active, three starts/minute, ten-second gap. |
| Realtime | Actual Trigger HTTP 200 observed in preserved Chrome network records. Owner route minted only `read:runs:run_06gmo8ttp4ljs4pumi51i52pa2`, 300-second expiry. Cross-user token request denied. No token values published. |
| Studio browser | Real Chrome DevTools MCP: 1440×900 and 390×844, zero overflow/missing images. Completed mobile image recovery was explicitly awaited. Desktop controls 400px, mobile 390px. Completion focused H2. Prompt/settings opened with Enter; original prompt/model visible. Use as reference showed AI-generated reference. Mobile drawer Escape closed and returned focus. |
| Explore | Search perfume + Product returned one result. Source-photo preview identified inspiration rather than generated output. Escape closed it and restored focus. Studio image survived return navigation. |
| Console | Normal final navigation/render path had no errors/warnings. Intentional unsupported-setting 400 was checked separately and caused the expected browser resource error. |
| Secret boundaries | 40 local built client files, 63 emitted worker files and 11 actually deployed Studio client chunks and 12 Assets client chunks had zero configured privileged-secret matches. Runtime values were transferred privately; no values printed. |
| Capture/history | Automatic watcher retained; original entries unedited. Both prior feature PR merge commits preserved. Verified-revoked key allowed raw capture publication; GitHub initially blocked it, candidate authorized the specific exception, and feature/main pushes succeeded without history rewriting. |

## Failures and resolutions

Trigger deployment's build-log stream timed out and its CLI exited 1. The hosted build continued: authenticated CLI registry read verified version `20261024.1` and its single task; the actual Production generation subsequently completed. No duplicate deployment or paid retry was sent.

The regular Chrome MCP could not launch without an X server. The existing real headless MCP bridge was used. QA initially took a mobile screenshot immediately after viewport emulation reloaded the page; it was replaced after waiting for the persisted image and completed controls. Immediate drawer measurement preceded the closing transition; after it settled, closure and focus return passed. A private QA helper quoting error was repaired before any generation submission.

## Limits and release posture

CAPTCHA is explicitly disabled at the candidate's request via `STUDIO_CAPTCHA_MODE=disabled`. Anonymous signup has no human challenge. Exact HTTPS origin, verified user ownership, trusted keyed network identity, Supabase Auth limits and PostgreSQL quotas remain active. This is a bounded assignment release with **five attempts remaining** at the final verification. Cookie deletion loses access; account recovery/linking remains outside scope.

Only Nano Banana 2 was called in Production. Pro and reference/regeneration paid journeys retain their prior Phase 2.1 local verification; no additional credits were spent repeating them. Failure scenarios remain covered by mocks/rollback tests and prior local QA. No production outage, high-resolution or offline simulation is claimed.

The exposed credential returned 401 after revocation; its replacement returned 200 in a read-only check and is absent from capture. Original raw entries are preserved, including the revoked value. No usable credential was published. Active capture continues to append and is committed at meaningful milestones.

## Evidence

- [Browser results](qa/production-browser-results.json)
- [Desktop processing](qa/production-desktop-processing.png)
- [Desktop completed](qa/production-desktop-completed.png)
- [Mobile completed](qa/production-mobile-completed.png)
- [Phase 2.1 local QA](PHASE2_1_QA.md)

My Assets met the conditional gate, passed its checks, received candidate visual/publication approval and is live. No other module was started. Final submission information is in [SUBMISSION.md](SUBMISSION.md).
