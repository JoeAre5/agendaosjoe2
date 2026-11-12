import { describe, it, expect } from "vitest";
import { isEligible, guestDraftAuthorized } from "../../supabase/functions/review-prompt/rules";

const now = new Date("2026-11-02T13:00:00-04:00");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const base = { now, events: [], verifiedAt: [], appointmentId: "appt-new" };

describe("review prompt frequency", () => {
  it("eligible with no history", () => expect(isEligible(base)).toBe(true));
  it("never shown twice for the same appointment", () =>
    expect(isEligible({ ...base, events: [{ event_type: "review_prompt_shown", created_at: daysAgo(400), appointment_id: "appt-new" }] })).toBe(false));
  it("dismiss pauses 60 days", () => {
    const ev = (d: number) => [{ event_type: "review_prompt_dismissed" as const, created_at: daysAgo(d), appointment_id: "a1" }];
    expect(isEligible({ ...base, events: ev(59) })).toBe(false);
    expect(isEligible({ ...base, events: ev(61) })).toBe(true);
  });
  it("click pauses 120 days but is not a verified review", () => {
    const ev = (d: number) => [{ event_type: "review_link_clicked" as const, created_at: daysAgo(d), appointment_id: "a1" }];
    expect(isEligible({ ...base, events: ev(119) })).toBe(false);
    expect(isEligible({ ...base, events: ev(121) })).toBe(true);
  });
  it("verified review pauses 365 days", () => {
    expect(isEligible({ ...base, verifiedAt: [daysAgo(364)] })).toBe(false);
    expect(isEligible({ ...base, verifiedAt: [daysAgo(366)] })).toBe(true);
  });
});

describe("guest draft authorization", () => {
  const ok = { status: "committed", appointment_id: "appt-new", committed_at: new Date(now.getTime() - 10 * 60_000).toISOString() };
  it("accepts a recent committed draft for the same appointment", () => expect(guestDraftAuthorized(ok, "appt-new", now)).toBe(true));
  it("rejects another appointment", () => expect(guestDraftAuthorized(ok, "appt-other", now)).toBe(false));
  it("rejects uncommitted drafts", () => expect(guestDraftAuthorized({ ...ok, status: "pending" }, "appt-new", now)).toBe(false));
  it("rejects after 60 minutes", () =>
    expect(guestDraftAuthorized({ ...ok, committed_at: new Date(now.getTime() - 61 * 60_000).toISOString() }, "appt-new", now)).toBe(false));
  it("rejects missing draft", () => expect(guestDraftAuthorized(null, "appt-new", now)).toBe(false));
});
