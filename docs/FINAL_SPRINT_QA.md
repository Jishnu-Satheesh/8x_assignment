# Final submission QA

Date: 24 October 2026. Pending checks are not passes.

| Check | Actual outcome |
| --- | --- |
| Approved source | `feat/phase2-1-durable-generation` at `6c51d60`, synchronized with origin before sprint changes. |
| Capture | Watcher running, no error, two verified sessions. Raw entries remain unedited. The exposed key is now verified revoked, permitting the original capture to accompany release commits without publishing a usable credential. |
| Supabase target | Candidate selected assignment project `ejsvicehcmqwtlwkshrc`. Migration `20261023190752` applied. |
| Storage baseline | `studio-private` is private; 16 MB limit; PNG/JPEG/WebP allowed. |
| Usage baseline | Four durable reservations + nine legacy attempts = 13/20 consumed. Existing limits retained. |
| Focused regression | All 42 tests passed, including four new production protection tests. Typecheck, full lint and production build passed. Hosted rollback SQL suite passed for authorization, quota and lifecycle. No paid calls yet. |
| Production Trigger | CLI 4.8.1 production **dry run passed** with the existing project/profile; code bundles successfully. This did not deploy or register a Production worker. Production key, approval and actual deployment verification remain pending. |
| Vercel | Candidate deployed `8x-assignment` (`prj_Vf0Z7lp1UE4og5BW5Ym7jiAvLFbC`), source main merge `292190e`. Canonical public URL `https://8x-assignment-ecru.vercel.app` serves Explore/Studio HTTP 200. API correctly reports generation disabled while protection setup is unmet. |
| Turnstile / Auth | Candidate explicitly requested temporary production CAPTCHA bypass. Explicit `STUDIO_CAPTCHA_MODE=disabled` prepared; quotas, origin/owner/network checks and worker gate remain mandatory. Deployment pending. |
| Credential revocation | Candidate confirmed revoked/replaced. Captured key rejected with HTTP 401 `UNAUTHENTICATED`; replacement read-only API check returned 200, differs and is absent from captured key values. No paid request used. |
| Worker bundle secret scan | 63 emitted worker build files scanned, excluding installed dependencies; zero configured secret matches. |
| Client secret scan | All 40 emitted client files scanned against configured privileged values, including the Production Trigger key: zero matches. |
| Committed credential scan | Current Gemini, Supabase privileged, database, Trigger and abuse-protection values had zero matches in capture files across existing Git history. No secret values were printed. |
| Live generation / recovery / download | Pending production approval and deployment. Local evidence is in `PHASE2_1_QA.md`. |
| Submission branch / URL | Pending release qualification. No production claim made. |

The normal connected Chrome MCP could not launch its headful browser because no X server is available. The existing real headless MCP bridge will be used for deployed browser checks. `git diff --check` passes for release files; raw capture frontmatter retains its recorder-written padding and is not reformatted.

Official references checked: [Vercel deployment](https://vercel.com/docs/deployments), [Trigger deployment](https://trigger.dev/docs/deployment/overview), [Trigger environment variables](https://trigger.dev/docs/deploy-environment-variables), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). TinyFish failed authentication; official docs were accessed directly instead.
