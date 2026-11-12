---
name: Commission Bonus Tier
description: Per-barber weekly production threshold that bumps commission rate by +5 percentage points for the qualifying week
type: feature
---

When a commission barber's **weekly gross production** (cash + digital, pre-fee — same number shown as "Producción bruta") reaches their `barbers.bonus_threshold_cents`, their commission rate is bumped by a **fixed +5 percentage points** for that entire week's payout (applied to net production).

- Per-week, independent: each week is evaluated on its own.
- Threshold = 0 means disabled (default).
- Only affects commission %; retention rate and tips are unchanged.
- Configured per-barber in Settings → Barbers → "Umbral de Bonificación (+5%)".
- UI: when active, the "Comisión XX%" row renders in green with a sparkle ✨ and a sub-line shows only "Tasa subió de Y% a Z% esta semana." Applies in admin Nómina (`NominaContent.tsx`) and barber Talonarios (`BarberPaystubs.tsx`) for every visible week.
- Shared logic: `src/lib/commissionBonus.ts` exports `computeCommissionBonus()` and `COMMISSION_BONUS_BUMP = 0.05`.
- Generated paystub PDFs use the bumped rate automatically (the math feeds `professionalFees`).
- Accountant WhatsApp summary (`Contable.tsx`) also applies the bumped rate silently — payouts reflect the bonus but the message itself never mentions thresholds, bumps, or "+5%". The CPA only sees the final `Comisión` and `Total a pagar` numbers.
