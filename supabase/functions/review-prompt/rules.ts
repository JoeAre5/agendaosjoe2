// Pure eligibility rules for the post-booking Google review prompt.
// A click pauses prompts but is never treated as a published review.
export const DISMISS_PAUSE_DAYS = 60;
export const CLICK_PAUSE_DAYS = 120;
export const VERIFIED_PAUSE_DAYS = 365;
export const GUEST_WINDOW_MINUTES = 60;

export type PromptEventType =
  | "review_prompt_shown"
  | "review_prompt_dismissed"
  | "review_link_clicked";

export interface HistoryInput {
  now: Date;
  /** Events for this client (or guest identity), any appointment. */
  events: { event_type: PromptEventType; created_at: string; appointment_id: string }[];
  /** Active verified review links for this client. */
  verifiedAt: string[];
  appointmentId: string;
}

const DAY = 86_400_000;

export function isEligible(h: HistoryInput): boolean {
  const t = h.now.getTime();
  // Already shown for this appointment: never show twice.
  if (h.events.some((e) => e.appointment_id === h.appointmentId)) return false;
  for (const v of h.verifiedAt) {
    if (t - new Date(v).getTime() < VERIFIED_PAUSE_DAYS * DAY) return false;
  }
  for (const e of h.events) {
    const age = t - new Date(e.created_at).getTime();
    if (e.event_type === "review_link_clicked" && age < CLICK_PAUSE_DAYS * DAY) return false;
    if (e.event_type === "review_prompt_dismissed" && age < DISMISS_PAUSE_DAYS * DAY) return false;
  }
  return true;
}

/** Guest access: draft must be committed, tied to this appointment, and recent. */
export function guestDraftAuthorized(
  draft: { status: string; appointment_id: string | null; committed_at: string | null } | null,
  appointmentId: string,
  now: Date,
): boolean {
  if (!draft || draft.status !== "committed") return false;
  if (!draft.appointment_id || draft.appointment_id !== appointmentId) return false;
  if (!draft.committed_at) return false;
  const age = now.getTime() - new Date(draft.committed_at).getTime();
  return age >= 0 && age <= GUEST_WINDOW_MINUTES * 60_000;
}
