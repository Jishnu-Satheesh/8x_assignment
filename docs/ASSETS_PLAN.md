# Minimal My Assets

The public deployment was qualified before 10:00 AM IST on 24 October, satisfying the candidate's 10:30 gate. This bounded extension is authorized by the final-sprint instructions. Stop feature work by 11:30 AM IST and request visual review before publishing this extension.

Files: `src/app/assets/page.tsx`, `loading.tsx`, `src/app/assets.css`, `src/components/assets/asset-library.tsx`; existing shell navigation/breadcrumb and proxy matcher. Record actual checks in `ASSETS_QA.md`.

Reuse the existing `StudioAsset` contract, session/history and owned image/download routes. Reuse the shared Dialog, Button and Skeleton components and semantic design tokens. No new dependency, integration or migration. No feedback, Brand DNA or generation controls are added.

Journey: open My Assets → recover existing guest session → see saved generated images → open accessible preview with prompt/model/settings/date → download. New guests can start the existing real guest workspace; authenticated empty users get a clear link to Image Studio. Include loading, request failure/retry and image/download failure states. Keep images private and original source labels explicit.

Acceptance: typecheck/lint/build and existing focused suite pass; real Chrome verifies populated gallery using genuine owned asset data, empty and guest states, preview/Escape/focus, download, navigation/reload and responsive layout. Mock only failure responses, never successful generated assets. Make no additional paid generation calls. Report the current recent-history bound and browser-session ownership limitation.
