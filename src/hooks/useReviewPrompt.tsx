// Coordinates the review overlay with the booking confirmation card:
// eligibility is prechecked once the booking is committed; when the customer
// leaves the card, `runAfter(next)` either shows the overlay (then runs next)
// or runs next immediately. Never triggered by inactivity.
// `qaPreview` (QA preview pages only) forces the overlay and records nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import GoogleReviewOverlay from "@/components/site/booking/GoogleReviewOverlay";
import { GOOGLE_REVIEW_URL, checkReviewPromptEligible, recordReviewPromptEvent } from "@/lib/reviewPrompt";

export function useReviewPrompt(
  appointmentId: string | null,
  draftId: string | null,
  enabled: boolean,
  isEs: boolean,
  qaPreview = false,
) {
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const nextRef = useRef<(() => void) | null>(null);
  const usedRef = useRef(false);

  useEffect(() => {
    if (qaPreview) { setEligible(!!GOOGLE_REVIEW_URL); return; }
    if (!enabled || !appointmentId) return;
    let alive = true;
    checkReviewPromptEligible(appointmentId, draftId).then((ok) => { if (alive) setEligible(ok); });
    return () => { alive = false; };
  }, [enabled, appointmentId, draftId, qaPreview]);

  const track = useCallback((t: Parameters<typeof recordReviewPromptEvent>[2]) => {
    if (qaPreview || !appointmentId) return;
    recordReviewPromptEvent(appointmentId, draftId, t);
  }, [qaPreview, appointmentId, draftId]);

  const runAfter = useCallback((next: () => void) => {
    if (!eligible || usedRef.current || !appointmentId) return next();
    usedRef.current = true;
    nextRef.current = next;
    setOpen(true);
    track("review_prompt_shown");
  }, [eligible, appointmentId, track]);

  const finish = () => {
    setOpen(false);
    const n = nextRef.current; nextRef.current = null;
    n?.();
  };

  const overlay = open && appointmentId ? (
    <GoogleReviewOverlay
      isEs={isEs}
      onReview={() => {
        track("review_link_clicked");
        if (GOOGLE_REVIEW_URL) window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer");
        finish();
      }}
      onLater={() => { track("review_prompt_dismissed"); finish(); }}
      onClose={() => { track("review_prompt_dismissed"); finish(); }}
    />
  ) : null;

  return { runAfter, overlay, open };
}
