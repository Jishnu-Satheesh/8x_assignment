# Creative workspace design system

This is the source of truth for the creative workspace. The candidate's Phase 1 brief supplies these values. The application uses semantic CSS tokens; components must not contain literal brand colors.

## Foundation

- Framework: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.
- UI foundation: **Radix**.
- shadcn preset: **b6SuZl7d7Q** — [builder](https://ui.shadcn.com/create?preset=b6SuZl7d7Q).
- Preset configuration: Luma style; Zinc base; Orange theme; Amber chart; Lucide icons; Manrope body; Space Grotesk headings; Medium radius; Subtle menu accent; Default menu color.
- The custom dark palette below overrides the preset's Orange theme values. This phase ships one intentional dark appearance.

## Semantic colors

| Token                                           | Value   |
| ----------------------------------------------- | ------- |
| background                                      | #0D0F12 |
| foreground                                      | #F5F5F2 |
| sidebar                                         | #101216 |
| sidebar-foreground                              | #F5F5F2 |
| card                                            | #171A1F |
| card-foreground                                 | #F5F5F2 |
| popover                                         | #1D2128 |
| popover-foreground                              | #F5F5F2 |
| secondary / muted                               | #22262D |
| secondary-foreground                            | #F5F5F2 |
| muted-foreground                                | #B0B5C0 |
| border / input                                  | #30343C |
| primary / sidebar-primary                       | #F6A17D |
| primary-foreground / sidebar-primary-foreground | #21130F |
| accent / sidebar-accent                         | #2A2E36 |
| accent-foreground / sidebar-accent-foreground   | #F5F5F2 |
| ring / sidebar-ring                             | #FFB494 |
| sidebar-border                                  | #30343C |
| destructive                                     | #FF8187 |
| success                                         | #78D6AF |
| warning                                         | #EAC47F |

Amber chart tokens remain preset configuration only; Phase 1 contains no charts. Image scrims and subtle surfaces derive from semantic tokens with opacity.

## Typography

Manrope is the UI/body family; Space Grotesk is the heading family. Self-host font files through the application so runtime rendering does not depend on third-party font requests.

| Role              | Size / line height            | Weight    |
| ----------------- | ----------------------------- | --------- |
| Page headline     | 36 / 42 px; mobile 28 / 34 px | 600       |
| Section heading   | 22 / 28 px                    | 600       |
| Card heading      | 16 / 24 px                    | 600       |
| Navigation / body | 14 / 22 px                    | 500 / 400 |
| Supporting        | 13 / 20 px                    | 400       |
| Overline          | 12 / 16 px                    | 500       |

## Layout and geometry

- Spacing scale: **4, 8, 12, 16, 24, 32, 40, 48, 64 px**. Use named component classes and shared Tailwind utilities based on this scale.
- Explore content maximum width: **1480 px**. Image Studio fills the available workspace width; its controls pane is **400 px at 1280 px and above**, **360 px at 768–1279 px**, and full-width in the stacked mobile layout. This is the candidate-approved Phase 2 width refinement.
- Page padding: **32 px desktop**, **24 px tablet**, **16 px mobile**.
- Sidebar: **252 px expanded**, **72 px collapsed**, **280 px mobile drawer**.
- Topbar: **64 px**.
- Base radius: **12 px**; gallery cards **14 px**; hero **18 px**; controls **10 px**.
- Regular controls: **40 px high**; primary CTA: **44 px high**.
- Borders: **1 px**; shadows restrained.
- Motion: **200 ms or less**; honor `prefers-reduced-motion`.

## Components and interaction

Use shared shadcn/Radix primitives for buttons, input, badges, dialog, drawer, select, and tooltips. App-specific layout, editorial cards, and the gallery compose these primitives. Shared focus styles use the ring token and must remain visible on dark surfaces.

The navigation groups are DISCOVER, CREATE, and WORKSPACE. Explore and Image Studio are working destinations. Cinematic Studio, My Assets, and Brand DNA visibly say **Soon** and do not link to invented routes. Image Studio defaults to the compact rail on entry, with manual expansion available.

Search and category filtering work together over a small typed local collection. Preview dialogs contain a title, description, image alternative, useful creative direction, image credit, and a clear source-photography label. Escape closes overlays; focus is trapped while open and returns to the trigger.

## Imagery and honesty

Curate legitimate, attributed source images and serve optimized local files with stable aspect ratios. Keep a source/license record under `docs/`; never label editorial source photographs as model-generated results. Provide loading and failed-image treatments, descriptive alternatives, readable image overlays, disabled states, an empty-collection state, and a distinct no-search-results state. Phase 2 adds only Gemini Image Studio; generated images have explicit AI provenance and session-only history. Accounts, billing, and other modules remain outside scope.
