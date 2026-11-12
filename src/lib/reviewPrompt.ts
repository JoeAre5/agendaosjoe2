// Client side of the post-booking Google review prompt.
// Fail-closed: if the check fails or times out, the prompt is skipped.
// Tracking errors are swallowed so booking, calendar and navigation never block.
import { supabase } from "@/integrations/supabase/client";

/** Charlie's official Google review link. Prompt stays off while this is null. */
export const GOOGLE_REVIEW_URL: string | null = "https://g.page/r/CdDc3FOXB0QCEBM/review";

const LS_KEY = "cb_review_prompt_local";
const LOCAL_PAUSE_MS = 60 * 86_400_000;
const CHECK_TIMEOUT_MS = 2500;

type EventType = "review_prompt_shown" | "review_prompt_dismissed" | "review_link_clicked";

function localPaused(): boolean {
  try {
    const ts = Number(localStorage.getItem(LS_KEY) || 0);
    return ts > 0 && Date.now() - ts < LOCAL_PAUSE_MS;
  } catch { return false; }
}
function markLocal() {
  try { localStorage.setItem(LS_KEY, String(Date.now())); } catch { /* ignore */ }
}

export async function checkReviewPromptEligible(appointmentId: string, draftId: string | null): Promise<boolean> {
  if (!GOOGLE_REVIEW_URL || !appointmentId || localPaused()) return false;
  try {
    const call = supabase.functions.invoke("review-prompt", {
      body: { action: "check", appointmentId, draftId },
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), CHECK_TIMEOUT_MS));
    const res = await Promise.race([call, timeout]);
    if (!res || res.error) return false;
    return (res.data as { eligible?: boolean })?.eligible === true;
  } catch { return false; }
}

export function recordReviewPromptEvent(appointmentId: string, draftId: string | null, eventType: EventType) {
  if (eventType !== "review_prompt_shown") markLocal();
  try {
    void supabase.functions
      .invoke("review-prompt", { body: { action: "record", appointmentId, draftId, eventType } })
      .catch(() => {});
  } catch { /* ignore */ }
}
