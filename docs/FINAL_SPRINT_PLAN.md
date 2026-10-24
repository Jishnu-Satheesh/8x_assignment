# Final submission sprint

Date: 24 October 2026. Starting branch: `feat/phase2-1-durable-generation`, approved at `6c51d60`.

## Scope and time gates

1. Qualify and deploy the existing Explore and durable Image Studio.
2. Only if public deployment is fully working before **10:30 AM IST**, implement a minimal `/assets` gallery using existing owned asset contracts, preview, metadata and download. No feedback, Brand DNA, Blueprint, cinematic or video modules.
3. At **11:30 AM IST**, stop feature development and finish verification and submission information.

## Release approach

The candidate selected the existing assignment Supabase project `ejsvicehcmqwtlwkshrc` and the Production environment of Trigger project `proj_lrqcmizeifueeloezqaj`. The connected Vercel team is `jishnus-projects-79d97227`; project name and canonical hostname require candidate selection. Other projects remain untouched.

Preserve the existing Next.js → Supabase Auth/PostgreSQL → Trigger → Gemini → private Storage workflow. Keep the one task, current model IDs, durable contracts, ownership and one-way provider dispatch fence. No dependency or migration additions are planned.

Files in scope: `README.md`, `.vercelignore`, `.gitignore`, environment/release and QA documentation; narrowly necessary configuration fixes only if readiness or deployed checks expose failures. Credentials stay in ignored local environment files and service secret stores. Use explicit allowlists when transferring variables; never upload the database password or Gemini key to the browser or ordinary deployment source. `.vercelignore` excludes raw captures and local artifacts without changing capture or Git tracking.

## Approval and configuration gates

- Revoke the Gemini credential found in raw capture. Save a replacement directly in an ignored environment file; verify the old key is rejected without a paid generation. Preserve capture entries exactly.
- Candidate chooses the Vercel project/hostname and provides Production Trigger and matching Turnstile configuration directly in ignored files.
- Enable Supabase Auth CAPTCHA with the same Turnstile secret; verify anonymous sign-in rate limits. Production origin must be exact HTTPS; disable the local exception.
- Request explicit approval for a concrete production release: intended project/commit, worker secret setup/deployment, Auth/protection settings, quota limits and one live generation. Keep paid generation blocked until this approval.
- Deploy and verify `generate-image` registration, retries disabled and concurrency two. Set `STUDIO_WORKER_VERIFIED` only after registration has been verified. PostgreSQL remains the budget authority.

## Accounting baseline

At sprint preflight: four durable reservations plus a nine-attempt legacy offset, **13 of 20 lifetime attempts consumed**. Per-user limit three, keyed-network limit six, active limit two, three starts/minute and ten seconds between starts. Preserve reservations and offsets; no reset or refund. Obtain approval before increasing the hard limit or changing production limits.

## Acceptance

- Correct service environments; replacement credential works and exposed credential is revoked.
- Public URL serves Explore and Studio with protected guest identity, Secure cookies, exact-origin writes and CAPTCHA validation.
- Global/user/network/rate/concurrency reservations remain atomic; anonymous recreation cannot bypass the global budget.
- One actual lowest-resolution Nano Banana 2 generation runs in the deployed Production worker; its private asset, metadata and settings survive reload/navigation and download with matching bytes.
- Other users and unauthenticated requests cannot retrieve owned jobs/assets/tokens; private objects are not public. Realtime and authenticated recovery work.
- Targeted desktop/mobile Chrome checks pass, including Explore, without unexpected console errors or overflow.
- README and final QA describe actual outcomes and limitations. Reconcile into the submission branch by preserving ancestry; never rewrite history or raw captures.

## Initial evidence

Capture passed: automatic watcher running, no error, two verified real-session canaries. Migration `20261023190752` is applied; `studio-private` is private with supported image MIME restrictions. Production release checks are pending in `FINAL_SPRINT_QA.md`.
