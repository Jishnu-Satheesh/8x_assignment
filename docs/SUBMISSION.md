# Final submission information

- **Candidate:** Jishnu Satheesh
- **Public application:** https://8x-assignment-ecru.vercel.app
- **Image Studio:** https://8x-assignment-ecru.vercel.app/image-studio
- **My Assets:** https://8x-assignment-ecru.vercel.app/assets
- **Public repository:** https://github.com/Jishnu-Satheesh/8x_assignment
- **Submission branch:** `main`, preserving both prior feature PRs, the Assets implementation and capture evidence.
- **Approved application source:** `96b37b8`; Trigger Production worker `20261024.1`.

## Ready-to-use description

A Higgsfield-inspired creative workspace that makes discovery approachable through curated Explore inspiration and grouped navigation. Image Studio provides real Google Gemini generation with optional image references, model-supported settings, background progress and persistent private history. My Assets adds a responsive gallery with accessible previews, original prompts/settings and downloads.

The application uses Next.js App Router, TypeScript, Tailwind/shadcn Radix, Vercel AI SDK/Google, Supabase anonymous Auth/PostgreSQL/private Storage, and one Trigger.dev v4 task. Next.js returns a durable job after dispatch; the worker validates, generates, saves and finalizes the image. Realtime is narrowly scoped and authenticated polling recovers progress. No filesystem usage ledger is required in Production.

## Review journey

1. Explore, search/filter inspiration and open its style/source preview.
2. Open Image Studio and start a guest workspace. Write a prompt, optionally add a reference, and choose supported model/settings.
3. Generate an image. Reload during processing or return later to recover the same job and persisted image.
4. Open My Assets to preview its original prompt/model/settings and download it. Image Studio also supports regeneration and reference reuse.

## Verification and product decisions

All three implemented modules received candidate approval. Production verification included one automated Nano Banana 2 generation at 512px, active reload recovery, real persisted-image/download hash matching, owner isolation, private Storage and signed URL expiry, scoped Realtime, and desktop/mobile Chrome checks. Assets used the existing saved image for local and public checks; its failure cases used explicit mocks. Typecheck, lint, build and 42 focused tests passed. See [final release QA](FINAL_SPRINT_QA.md) and [Assets QA](ASSETS_QA.md).

Guest identity reduces registration friction and remains tied to the browser; clearing cookies loses access. The owner approved temporary CAPTCHA opt-out. Atomic global/user/network/rate/concurrency controls remain active: the final ledger showed **15 of 20 lifetime attempts consumed, five remaining**, including the nine-attempt legacy offset. Failed/uncertain attempts remain counted; uncertain paid calls are never automatically replayed. The quota counts attempts, and provider cost varies by model/resolution.

Source inspiration photographs and AI-generated assets are clearly distinguished. [Design system](DESIGN_SYSTEM.md) and [source imagery](ASSET_SOURCES.md) document visual decisions and provenance. Brand DNA, Blueprint, approval/rejection feedback, cinematic and video modules were not started.

## Capture integrity

Capture remains automatic and original entries are preserved. A pasted credential was revoked and independently rejected before its original capture was published. GitHub initially blocked that revoked value; the candidate approved the specific exception. Current credentials remain private. No raw capture or Git history was rewritten to conceal the incident.

Feature development is complete. Further work requires a new instruction.
