// Cancellation policy helper.
// Policy: clients can cancel up until 11:59:59 PM (PR time, AST -04:00) of the
// day BEFORE the appointment. After that, the chair is held and cancellation
// must be coordinated with the barber (e.g. via WhatsApp).
//
// Puerto Rico has no DST, fixed UTC-04:00, so we can do the math in -04:00.

const PR_OFFSET_MS = 4 * 3600 * 1000; // -04:00

/** Returns the deadline timestamp (ms since epoch) past which clients can no
 *  longer self-cancel: midnight (start of day) of the appointment day, PR time. */
export function getCancelDeadlineMs(startsAtIso: string | Date): number {
  const startMs = (startsAtIso instanceof Date ? startsAtIso : new Date(startsAtIso)).getTime();
  // Shift to PR-local epoch, floor to start of day, shift back.
  const prLocal = startMs - PR_OFFSET_MS; // pretend PR is UTC
  const dayStartPrLocal = Math.floor(prLocal / 86_400_000) * 86_400_000;
  return dayStartPrLocal + PR_OFFSET_MS; // back to real UTC ms
}

/** True when the user can still cancel from the app right now. */
export function canCancelNow(startsAtIso: string | Date, now = Date.now()): boolean {
  return now < getCancelDeadlineMs(startsAtIso);
}

/** Human-readable deadline label for the modal/explanation, in the user's
 *  language (es-PR or en-US). Always rendered in PR time. */
export function formatCancelDeadlineLabel(
  startsAtIso: string | Date,
  language: "es" | "en" = "es",
): string {
  const deadlineMs = getCancelDeadlineMs(startsAtIso);
  // Deadline is 12:00 AM of appointment day = "11:59 PM the day before".
  const dayBefore = new Date(deadlineMs - 60_000); // 11:59 PM previous day, PR
  const fmt = new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-PR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Puerto_Rico",
  });
  const dateLabel = fmt.format(dayBefore);
  return language === "en"
    ? `11:59 PM on ${dateLabel}`
    : `11:59 PM del ${dateLabel}`;
}
