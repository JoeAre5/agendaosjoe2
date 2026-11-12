// usePayPalRedirect — extracted PayPal full-page-redirect handler.
//
// Originally inlined inside PayPalRedirectButton.tsx, lifted into a hook in
// Phase 2 so the new "Cambiar método de pago" bottom sheet (PaymentMethodSheet)
// can trigger a PayPal redirect without rendering the legacy yellow button.
//
// Backend contract is unchanged:
//   1. POST pay-then-book action="prepare-paypal-redirect" with draftId +
//      returnOrigin (window.location.origin)
//   2. Server creates a PayPal Orders v2 order, persists paypal_order_id on
//      the draft, returns { success, approveUrl }
//   3. We window.location.href = approveUrl (full-page, NO popup — iOS
//      Safari/1Password will kill any popup window during Face-ID prompts)
//   4. PayPal returns the customer to /citas/confirmando?draftId=…&paypal_return=1
//      (or &paypal_cancel=1) and BookingConfirming polls check-paypal-status.
//
// This hook does NOT render anything; it just exposes { redirect, isLoading,
// error }. Consumers decide what UI to render.
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";


export type PayPalRedirectErrorKey =
  | "draft_not_found"
  | "draft_not_pending"
  | "paypal_auth_failed"
  | "paypal_order_failed"
  | "paypal_unreachable"
  | "no_approve_link"
  | "invalid_return_origin"
  | "missing_return_origin"
  | "unknown";

function mapError(errorKey: string | undefined, isEs: boolean): string {
  switch (errorKey) {
    case "draft_not_found":
    case "draft_not_pending":
      return isEs ? "Sesión expirada. Vuelve a empezar." : "Session expired. Please start over.";
    case "paypal_auth_failed":
    case "paypal_order_failed":
    case "paypal_unreachable":
    case "no_approve_link":
      return isEs ? "PayPal no responde. Intenta de nuevo." : "PayPal is unreachable. Please try again.";
    case "invalid_return_origin":
    case "missing_return_origin":
      return isEs ? "Configuración inválida." : "Invalid configuration.";
    default:
      return isEs ? "Error de conexión. Intenta de nuevo." : "Connection error. Please try again.";
  }
}

export interface UsePayPalRedirectOptions {
  draftId: string;
  isEs: boolean;
  /** Called with the friendly translated message before/instead of throwing. */
  onError?: (msg: string) => void;
}

export function usePayPalRedirect({ draftId, isEs, onError }: UsePayPalRedirectOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("pay-then-book", {
        body: {
          action: "prepare-paypal-redirect",
          draftId,
          returnOrigin: window.location.origin,
        },
      });

      const errorKey = (data as { error?: string } | null)?.error;
      const success = (data as { success?: boolean } | null)?.success === true;
      const approveUrl = (data as { approveUrl?: string } | null)?.approveUrl;

      if (invokeErr && !errorKey) {
        const msg = mapError(undefined, isEs);
        setError(msg);
        onError?.(msg);
        setIsLoading(false);
        return;
      }
      if (!success || errorKey || !approveUrl) {
        const msg = mapError(errorKey, isEs);
        setError(msg);
        onError?.(msg);
        setIsLoading(false);
        return;
      }

      // Full-page redirect — keep isLoading true so any UI button stays
      // disabled until the navigation actually happens.
      window.location.href = approveUrl;
    } catch (e) {
      console.warn("[usePayPalRedirect] exception", e);
      const msg = mapError(undefined, isEs);
      setError(msg);
      onError?.(msg);
      setIsLoading(false);
    }
  }, [draftId, isEs, isLoading, onError]);

  return { redirect, isLoading, error };
}
