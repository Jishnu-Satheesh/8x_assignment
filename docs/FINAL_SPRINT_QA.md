# Final submission QA

Date: 24 October 2026. Pending checks are not passes.

| Check | Actual outcome |
| --- | --- |
| Approved source | `feat/phase2-1-durable-generation` at `6c51d60`, synchronized with origin before sprint changes. |
| Capture | Watcher running, no error, two verified sessions. Raw credential-bearing capture remains unchanged and unpublished pending revocation. |
| Supabase target | Candidate selected assignment project `ejsvicehcmqwtlwkshrc`. Migration `20261023190752` applied. |
| Storage baseline | `studio-private` is private; 16 MB limit; PNG/JPEG/WebP allowed. |
| Usage baseline | Four durable reservations + nine legacy attempts = 13/20 consumed. Existing limits retained. |
| Focused regression | `npm test` passed all 38 tests. Hosted rollback SQL suite passed again for authorization, quota and lifecycle. No paid calls were made. |
| Production Trigger | CLI 4.8.1 production **dry run passed** with the existing project/profile; code bundles successfully. This did not deploy or register a Production worker. Production key, approval and actual deployment verification remain pending. |
| Vercel | Connected team verified; no assignment project existed during discovery. Candidate selection/configuration pending. |
| Turnstile / Auth | Production widget and matching Supabase CAPTCHA setup pending. CAPTCHA was disabled for prior staging tests. |
| Credential revocation | Pending candidate action and secret-safe verification. Current local Gemini key still appears in raw capture. |
| Worker bundle secret scan | 63 emitted worker build files scanned, excluding installed dependencies; zero configured secret matches. |
| Committed credential scan | Current Gemini, Supabase privileged, database, Trigger and abuse-protection values had zero matches in capture files across existing Git history. No secret values were printed. |
| Live generation / recovery / download | Pending production approval and deployment. Local evidence is in `PHASE2_1_QA.md`. |
| Submission branch / URL | Pending release qualification. No production claim made. |

The normal connected Chrome MCP could not launch its headful browser because no X server is available. The existing real headless MCP bridge will be used for deployed browser checks. `git diff --check` passes for release files; raw capture frontmatter retains its recorder-written padding and is not reformatted.

Official references checked: [Vercel deployment](https://vercel.com/docs/deployments), [Trigger deployment](https://trigger.dev/docs/deployment/overview), [Trigger environment variables](https://trigger.dev/docs/deploy-environment-variables), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). TinyFish failed authentication; official docs were accessed directly instead.
