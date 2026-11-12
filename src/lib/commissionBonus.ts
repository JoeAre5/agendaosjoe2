/**
 * Commission bonus tier logic.
 * If a barber's weekly gross production reaches their `bonus_threshold_cents`,
 * their commission rate is bumped by a fixed +5 percentage points for that week.
 */
export const COMMISSION_BONUS_BUMP = 0.05;

export interface BonusResult {
  /** Effective rate to apply to the week (already bumped if eligible). */
  effectiveRate: number;
  /** Original (settings) rate. */
  baseRate: number;
  /** True when the threshold is set and met for the week. */
  bonusActive: boolean;
  /** Threshold in cents (0 = disabled). */
  thresholdCents: number;
}

export function computeCommissionBonus(
  baseRate: number | null | undefined,
  weeklyGrossCents: number,
  thresholdCents: number | null | undefined,
): BonusResult {
  const base = baseRate ?? 0;
  const threshold = thresholdCents ?? 0;
  const active = threshold > 0 && weeklyGrossCents >= threshold;
  return {
    effectiveRate: active ? base + COMMISSION_BONUS_BUMP : base,
    baseRate: base,
    bonusActive: active,
    thresholdCents: threshold,
  };
}
