---
name: Radius tokens
description: Semantic radius rules for clickables, inputs, pills + brand-pill CTA exception list.
type: design
---
Three semantic radius tokens, defined in `src/index.css` and exposed as Tailwind utilities in `tailwind.config.ts`:

- `--radius-control: 12px` → ALL clickable elements (buttons, toggles, segmented items, CTA rows). Tailwind: `rounded-control`.
- `--radius-input: 10px` → ALL form inputs (input, textarea, select, OTP cells). Tailwind: `rounded-input`.
- `--radius-pill: 9999px` → Non-clickable pills (chips, badges, pill containers). Tailwind: `rounded-pill`.

shadcn primitives patched: `Button`, `Toggle` use `rounded-control`. `Input`, `Textarea` use `rounded-input`.

DO NOT TOUCH (intentional surfaces): cards (`rounded-2xl`/28px popups), modals/sheets/drawers, switch knobs, drawer handles, scroll thumbs, status dots, illustrations, broadcast-asset preview pills.

## INTENTIONAL EXCEPTION — brand-driven pill CTAs (keep `rounded-full`)

Pill-shaped CTAs are a conscious editorial variant of the design system. They carry the brand's voice on these surfaces and MUST stay `rounded-full`:

- **Public site pages**: Home, Servicios*, HeadlinePost, Headlines, StickyBookingBar
- **GHL form submits**: GhlContactForm, GhlNewsletterForm, GhlRecruitmentForm
- **Broadcast tools**: BroadcastComposer, BroadcastAssetStudio, BroadcastModal, PendingAllocationModal

Everywhere else, clickable elements = 12px (`rounded-control`). Do not normalize the surfaces above. Mirror this list in the comment block at the top of `src/index.css`.

For new code: prefer `rounded-control` / `rounded-input` / `rounded-pill` over hardcoded `borderRadius:`. If you must inline, use `borderRadius: "var(--radius-control)"`.
