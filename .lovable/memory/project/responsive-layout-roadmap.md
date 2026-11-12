---
name: Responsive Layout Roadmap
description: Phased plan for app-wide responsive layout system (Stripe-style sidebar, portrait mobile lock). Phase 3 done pre-launch; rest deferred post-launch.
type: feature
---

# Responsive Layout Roadmap

## Status
- **Phase 3 (public site responsive nav):** DONE pre-launch
- **Phases 0-2, 4-5:** DEFERRED post-launch (do not start before launch)

## Goal
- Public site: hamburger in portrait, horizontal top bar above 768px with breathing room
- Barber/Admin/Client apps: Stripe-style collapsible left sidebar on tablet+desktop, full-screen portrait nav on mobile (locked, no landscape reflow), GoHighLevel expanded/collapsed states
- Kiosk: landscape-optimized

## Constraints (current state)
- `maxWidth: 430` hard-coded across 28+ files (AppShell, PublicLayout pre-Phase 3, feature screens)
- Calendar grid + booking flow built for 430px
- Web Orientation Lock API unreliable → use CSS media queries to render mobile layout in landscape

## Phased Plan

### Phase 0 — Audit (post-launch)
- Grep all `maxWidth: 430` callsites
- Catalog screens that need fluid grids vs centered narrow column

### Phase 1 — Foundation (post-launch)
- `useBreakpoint()` hook (mobile <768, tablet 768-1024, desktop ≥1024)
- `LayoutContext` (or shadcn `SidebarProvider`) for global expanded/collapsed state
- `ResponsiveAppShell` wrapper — swaps BottomNav vs Sidebar based on breakpoint
- Shared `NAV_ITEMS` array consumed by both BottomNav and Sidebar (no duplication)

### Phase 2 — Admin/Barber/Client Sidebar (post-launch)
- Integrate shadcn `Sidebar` with `collapsible="icon"`
- Mobile: keep BottomNav, lock to portrait visual layout via media queries
- Persist collapsed state in localStorage

### Phase 3 — Public Site Responsive Nav (DONE pre-launch)
- Hamburger <768px, horizontal nav ≥768px
- Increased horizontal padding + container max-width at lg/xl
- Improved gap between nav links at desktop

### Phase 4 — Kiosk Landscape (post-launch)
- Detect kiosk route, optimize for landscape tablet

### Phase 5 — Screen Migration (post-launch, incremental)
- Per-screen migration off `maxWidth: 430` to fluid grids
- Highest risk: Calendar, Booking flow, Reports — migrate last with full QA

## Risks
- Calendar grid regressions (built for 430px)
- Booking flow step layouts
- Touch target sizing on tablet sidebar collapsed state
