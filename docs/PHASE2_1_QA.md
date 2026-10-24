# Phase 2.1 QA — durable Image Studio

Date: 23–24 October 2026. Branch: `feat/phase2-1-durable-generation`.

**Result: implemented and verified locally against the designated hosted staging database and a connected Trigger development worker. Awaiting candidate visual approval. Public deployment is not qualified or authorized.**

## Verification actually performed

| Area | Result and evidence |
| --- | --- |
| Capture preflight | `CAPTURE-TEST.md` PASS; watcher running, no error, two real-session canaries verified. Capture configuration/scripts were preserved. |
| Migration target | Configured database and Supabase API project matched; unrelated MCP project untouched. Direct IPv6 connection failed; candidate supplied a working IPv4 session-pooler URL. Empty application schema inspected before changes. |
| Official migration workflow | Supabase CLI 2.122.0 created `20261023190752_durable_image_studio.sql`; `db push --dry-run` and `db push` succeeded against staging. Migration history exists. Generation initially disabled. |
| Database behavior/security | `scripts/studio-db.mjs test` passed the hosted rollback SQL suite: grants, RLS, service-only invoker RPCs, input constraints, duplicate payload binding, one-way provider marker, idempotent completion, retained uncertain accounting, reference ownership/caps and global/user/network/rate/concurrency limits. |
| Concurrent reservation lock | Two real PostgreSQL connections: the second reservation blocked while the first held the singleton quota lock; after rollback/release it observed the original disabled quota and was rejected. No test reservation was committed. |
| Security advisors | Official `supabase db advisors --type security --level warn --fail-on error` returned an empty result. |
| Real anonymous identities | Supabase anonymous sign-in and app HttpOnly cookie sessions succeeded. Reload and application-server restart retained the browser's identity and its three saved images. |
| Cross-user RLS | A second real anonymous identity saw zero other-owner jobs, assets and usage rows through the Data API. Mutation, private quota RPC and direct Storage upload were denied. |
| Cross-user app authorization | The second identity's valid SSR cookie session returned session HTTP 200, but another owner's job, image and Realtime-token routes each returned HTTP 404. Unauthenticated generation/job/image routes returned 401; cross-origin POST returned 403. |
| Private Storage | Other-user signed URL creation denied; public bucket retrieval denied (400). Owner image route issued temporary access and images decoded in Chrome. A one-second signed URL was denied after expiry (400). |
| Paid generation | Exactly three real Gemini calls, all successful, through the one connected Trigger development task. See the journey table below. No high-resolution or paid failure tests. |
| Async/duplicate workflow | API returns HTTP 202 and an application job. An exact repeated request returned the same completed job; its Trigger run count remained one and usage remained unchanged. Unsupported Pro/512 settings returned 400 `UNSUPPORTED_SETTING`. |
| Realtime | Actual Trigger Realtime network responses returned 200. Decoded client token scope was exactly `read:runs:<owned-run>` with 300-second expiry. No payload/bytes or privileged credentials were sent through Realtime. |
| Recovery/fallback | Reloaded during the first active job and recovered it. Mobile offline emulation displayed “Connection interrupted” / “Reconnecting”; after restoring connectivity, polling recovered the completed third image without another submission. Completed history survived navigation/reload and a Next server restart. |
| Download/metadata | Actual Download button exercised. Authorized response was HTTP 200 with attachment disposition and JPEG MIME. First image's 141,981 bytes matched its persisted SHA-256: `5ed185f25940a0f511f6d8af53c949900dfe3566ac1743aa27b24b96259718aa`. Original prompt, model, output settings, lineage and created time opened in the viewer. |
| Failure safety | Mocked worker/store/SDK tests covered duplicate/manual replay, timeout/crash marker, ambiguous provider CAS, Storage/DB retry exhaustion, saved-object verification/recovery, wrong-owner/hash/format references and uncertain accounting. Google is never replayed by persistence recovery. |
| Browser responsive/accessibility | Real connected headless Chrome DevTools MCP at 1440×900, 1024×768, 768×1024 and 390×844. No horizontal overflow; controls 400 px desktop, 360 px intermediate, full width mobile. Sidebar expanded to 252 px and collapsed; mobile drawer opened, Escape closed it and restored focus. Form input/model/resolution/reference/history/viewer actions exercised. Completion moved focus to the viewer heading. |
| Explore regression | Source-photo Explore loaded; search “dune” returned one direction; preview opened, displayed meaningful style/source information and closed with Escape. Future destinations remain disabled. No normal-path console errors/warnings or missing image assets. Expected offline/negative-authorization requests were tested separately. |
| Client secret boundary | Scanned all 40 built client files for the configured Gemini, Supabase secret, database URL, Trigger secret and abuse-protection secret: zero matches. Staged source was also checked before commits. |

## Real generation journeys

| Job | Model / output | Journey |
| --- | --- | --- |
| `8be169a2-206d-4425-aa1c-203e95e4b629` | Nano Banana 2 / `gemini-3.1-flash-image`, 512×512 | Uploaded/normalized the existing licensed source perfume photograph as a reference; generated, reloaded during the job, recovered and downloaded. |
| `ac7d681d-f377-4d50-9d1c-22546c322ac3` | Nano Banana Pro / `gemini-3-pro-image`, 1024×1024 | Used the first AI-generated output as a private reference; generated and recovered after mobile navigation/network interruption. |
| `eb348a7f-4ce5-41ea-a102-d1251335b81a` | Nano Banana 2 / 512×512 | Selected the original result and pressed Regenerate on mobile. PostgreSQL confirmed identical original prompt, model, ratio, resolution and uploaded-reference ID. Offline/reconnect recovery completed successfully. |

Three calls were necessary to cover both models, cross-model generated-reference reuse, and regeneration with original settings. Trigger reported successful worker durations of 19.9, 38.1 and 21.1 seconds. A successful Trigger run was corroborated by the database asset and actual Storage image. These are local development-worker checks, not deployed production-worker checks.

## Local checks

- `rtk proxy npm test`: **38 tests passed**, eight test files, no failures. The dispatch transport test uses a local HTTP mock, including an uncertain connection outcome; it makes no Trigger/Gemini request.
- `rtk proxy npm run typecheck`: **PASS** after the production build.
- `rtk proxy npm run lint`: **PASS**, 63 source/config files, zero errors or warnings.
- `rtk proxy npm run build`: **PASS**, Next.js 16.4.2 production Webpack build, all Studio API routes and proxy registered.
- `rtk proxy npm audit --omit=dev --json`: **zero vulnerabilities**. A compatible `ws` override resolves the Trigger dependency advisory; unused direct build tooling was removed.
- Focused independent infrastructure, app and integrated reviews completed. Two app findings were fixed and rechecked; final review had no remaining material findings.

## Failures and resolutions

- The initial database URL required IPv6. The candidate supplied the session-pooler URL; target matching and real connection succeeded before migration.
- A production Trigger key and an unrelated CLI account/profile could not run the development worker. The candidate supplied the Development key and logged into the correct account; the authorized `default` profile registered `generate-image`. No production worker was deployed.
- Supabase anonymous signup initially required CAPTCHA while app CAPTCHA variables were blank. The candidate disabled CAPTCHA on this staging project for local testing; real signup subsequently passed. Public generation still fails closed without matching Turnstile configuration and the deployment-verification gate.
- Review reproduced ambiguous POST responses losing request identity. The UI now retains the canonical request in per-user session storage and retries only its original UUID/payload; 5xx, non-JSON, network interruption, reload/history failure and rejected retries remain fenced. History reconciles the durable request ID. No image bytes are stored in that recovery record.
- Review reproduced a removed Turnstile widget not returning during development StrictMode remount. Cleanup now resets the widget reference; setup/cleanup/setup was rechecked with two renders, one removal and one live widget.
- Once the worker started, ESLint scanned generated `.trigger` dependency bundles. Tool artifacts are now explicitly excluded from ESLint/TypeScript and Git. Application source remains checked.
- Final screenshots were taken after server readiness and actual image decoding; early restart/loading screenshots were replaced. Desktop submission now says “Submitting” until the durable queue is confirmed, and retry controls appear only for an interrupted submission.

## Budget and deployment readiness

The previous nine attempts remain a legacy global offset. Three new successful reservations bring the consumed count to **12 of 20**, leaving **8** globally. No accounting was reset or refunded. The per-user ceiling remains 3. Migration default network ceiling is 3; this local staging review deliberately uses 6, leaving three additional manual-review network reservations for a new guest browser. The QA guest has already used its three-user allowance. A new guest identity does not reset the global or network counters.

The local app is `http://localhost:3000/image-studio`, with a running local Trigger development worker. Anonymous images belong to that browser's cookies; a different browser starts an empty workspace. Screenshots show the QA browser's durable results. Cookie clearing/device transfer, account linking, upload garbage collection, scheduled reconciliation and a full My Assets interface remain outside this phase.

Before public enablement: configure and verify production Auth/CAPTCHA/rate limits, trusted network identity, Secure cookies, Storage access and quotas; authorize and deploy the worker; test a real Vercel deployment; rotate/revoke the exposed key; then explicitly enable production generation. `STUDIO_WORKER_VERIFIED` remains false/unset. No Vercel deployment, production Trigger deployment, merge or push was performed.

## Capture/security conflict

The current raw capture contains the still-usable credential previously pasted by the candidate. The candidate explicitly authorized its continued use for local tests until deployment. The capture remains untouched and automatic logging continues, but this sensitive tracked log is intentionally **uncommitted and unpublished**. Committing it would violate the no-secrets requirement; redacting it would violate raw-capture integrity. Safe implementation commits therefore omit this log, and the deviation from 8x's interleaved-log requirement is recorded here. Rotation/revocation is required before publishing affected capture history. No clean transcript was fabricated.

## Screenshots and acceptance

Processing screenshots were captured during the real runs; final polish changed the pre-dispatch label to “Submitting” and hides retry controls while submission is in flight. Empty/completed screenshots show the final build.

- [Desktop empty workspace](qa/phase21-desktop-empty.png)
- [Desktop processing](qa/phase21-desktop-processing.png)
- [Desktop persisted result](qa/phase21-desktop-completed.png)
- [Mobile empty workspace](qa/phase21-mobile-empty.png)
- [Mobile saving](qa/phase21-mobile-processing.png)
- [Mobile reconnecting](qa/phase21-mobile-reconnecting.png)
- [Mobile recovered result/history](qa/phase21-mobile-completed.png)

Candidate visual review/approval is still required. Phase 2.1 stops here; Blueprint, Brand DNA, feedback, Cinematic Studio and video modules have not been started.
