---
name: Dark Mode Card System (Global)
description: Global dark-mode card colors, borders, and dividers shared across home, menu, appointment flows, admin, and client views
type: design
---

Global dark-mode card spec (applies everywhere — admin, client portal, appointment flows, menu, home):

- Card background: `#0F1011` (token: `--bg-surface`)
- Secondary surface: `#1B1B1E` (token: `--bg-surface-2`)
- Card border: `0.5px solid #1B1B1E` (tokens: `--border`, `--card-border`, `--nav-border-color`)
- Internal divisions inside cards: `#1B1B1E` (token: `--divider`)
- No bottom division on the last row inside any card (`.card-elevated > *:last-child` border-bottom forced 0)
- `.card-elevated` in dark mode: solid `#0F1011` bg + fading hairline border via `::before` mask (border visible 0–35%, fades to transparent by 55%) so the card visually melts into the black `--bg-base` below the midpoint
- No box-shadow on cards in dark mode

Hero cards on the home screen (next appointment + last visit) keep their own treatment via `.card-portal-hero` — see `mem://style/design-system/portal-hero-cards`. Hero cards use a radial gradient fading to `--bg-base` plus a fading top border; everything else uses the standard `.card-elevated` style above.

Light mode is unchanged.
