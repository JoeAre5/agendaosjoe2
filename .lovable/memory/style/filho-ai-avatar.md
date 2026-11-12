---
name: Filho AI Avatar
description: Brand identity for "Filho" — the AgendaOS AI assistant (orb mark, naming, future use cases)
type: design
---
**Filho** (Portuguese for "son" / "descendant") is the name of our AI assistant. Phonetically razor-sharp, but at its core a "mini-me" working alongside everyone who interacts with it. Future use cases: customer service butler, marketing guru, content strategist, etc.

Never call it "Filo". Always "Filho".

Visual mark: `<AiOrb />` from `src/components/admin/blog/AiOrb.tsx` (component name preserved for code stability; the brand it represents is Filho).
- Thin gradient ring, no fill, no chrome (no background tile, no border).
- Asymmetric light: warm/lit side (~accent #ceb79e / dark #f4dfc2) + cool/shadow side (cool gray-blue).
- Light source rotates clockwise (14s) — the warm "sun" orbits the orb.
- Always renders standalone; never wrap in a colored tile or accent-bordered button.

Bottom-nav variant: `<AnimatedOrbNavIcon />` from `src/components/AnimatedOrbNavIcon.tsx` — premium crystal ball with internal smoke motion, embedded into the nav bar (not floating). Default 32px.

CTA copy: "Generar con Filho" / "Generate with Filho" (replaces "Generar con IA").

Typing indicator: iMessage-style 3 dots (`.ai-typing-dots`). Never use shimmer bars.
