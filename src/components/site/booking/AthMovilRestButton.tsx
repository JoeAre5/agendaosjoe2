// ATH Móvil — REST-based payment button (replaces SDK).
//
// The SDK approach (athmovil_base.js) was incompatible with iOS Safari background
// throttling: when the user left Safari to authorize in the ATH app, Safari killed
// the SDK's Firebase polling, ATH timed out, and the webhook fired CANCEL.
//
// This button instead calls our `athmovil-create-payment` edge function, which
// makes a server-side REST call to ATH. ATH pushes to the customer's phone, the
// customer authorizes in the ATH app, and ATH fires our existing
// `athmovil-webhook` with metadata1=draftId. The webhook commits the draft.
//
// On success here, we navigate immediately to /citas/confirmando, which polls
// booking_drafts until the webhook flips it to committed.
//
// Phase 1B.3: visual shell extracted to <AthMovilOrangeButton>. This file
// remains the public-paywall behavioral wrapper (validation, edge function,
// navigation). Admin POS gets its own wrapper in Phase 1B.4.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone10 } from "@/lib/phone";
import { AthMovilOrangeButton } from "@/components/shared/AthMovilOrangeButton";
import { useBooking } from "@/contexts/BookingContext";

const MAX_AMOUNT_CENTS = 150_000; // $1,500 ATH limit

interface AthMovilRestButtonProps {
  draftId: string;
  phone: string;        // 10 digits expected; we re-normalize defensively
  totalCents: number;
  tipCents: number;     // currently unused server-side (draft is source of truth) but kept for parity
  serviceName: string;  // currently unused (server reads from draft) but kept for future fallback
  isEs: boolean;
  showHelperText?: boolean;
}

type State = "idle" | "loading" | "error";


function mapErrorMessage(errorKey: string | undefined, isEs: boolean, athErrorCode?: string): string {
  // ATH-specific error codes take priority over the generic errorKey.
  // PCUS_0007 = "Invalid Customer Own Phone" — phone isn't registered with ATH Móvil,
  // or matches the merchant's own ATH account (you can't pay yourself).
  if (athErrorCode === "PCUS_0007") {
    return isEs
      ? "Este número no está registrado en ATH Móvil o no puede usarse para esta transacción. Verifica tu número."
      : "This number isn't registered with ATH Móvil or can't be used for this transaction. Please verify your number.";
  }
  switch (errorKey) {
    case "draft_not_found":
    case "draft_expired":
      return isEs ? "Sesión expirada. Vuelve a empezar." : "Session expired. Please start over.";
    case "draft_not_pending":
      return isEs ? "Esta reservación ya fue procesada." : "This booking was already processed.";
    case "invalid_phone":
      return isEs ? "Número de celular inválido." : "Invalid phone number.";
    case "amount_exceeds_ath_limit":
      return isEs ? "Monto excede límite ATH ($1,500)." : "Amount exceeds ATH limit ($1,500).";
    case "ath_api_error":
    case "ath_network_error":
      return isEs ? "ATH Móvil no responde. Intenta de nuevo." : "ATH Móvil unreachable. Try again.";
    default:
      return isEs ? "Error de conexión. Intenta de nuevo." : "Connection error. Try again.";
  }
}

export function AthMovilRestButton({
  draftId,
  phone,
  totalCents,
  tipCents,
  isEs,
  showHelperText = true,
}: AthMovilRestButtonProps) {
  const navigate = useNavigate();
  const { closeBooking } = useBooking();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const phoneNorm = normalizePhone10(phone);
  const phoneValid = phoneNorm.length === 10;
  const overLimit = totalCents > MAX_AMOUNT_CENTS;

  const loading = state === "loading";
  const disabled = loading || !phoneValid || overLimit;

  const helperText = (() => {
    if (!phoneValid) return isEs ? "Falta tu número de celular" : "Your phone number is required";
    if (overLimit) return isEs ? "Monto excede límite ATH ($1,500)" : "Amount exceeds ATH limit ($1,500)";
    return isEs
      ? "Te enviaremos una notificación a tu ATH Móvil. Ábrela y autoriza el pago para confirmar tu cita."
      : "We'll send a push to your ATH Móvil. Open it and authorize the payment to confirm your booking.";
  })();

  const handleClick = async () => {
    if (disabled) return;
    console.log("[AthMovilRestButton] state: idle → loading", { draftId, tipCents });
    setState("loading");
    setErrorMsg(null);

    try {
      // Lock the user's selected tip onto the draft FIRST. Without this the
      // ATH push would charge subtotal-only because athmovil-create-payment
      // reads draft.total_cents as the source of truth.
      const tipRes = await supabase.functions.invoke("pay-then-book", {
        body: { action: "update-draft-tip", draftId, tipCents },
      });
      const tipErrKey = (tipRes.data as { error?: string } | null)?.error;
      if (tipRes.error || tipErrKey) {
        console.warn("[AthMovilRestButton] update-draft-tip failed", tipRes);
        setErrorMsg(mapErrorMessage(tipErrKey, isEs));
        setState("error");
        return;
      }

      const { data, error } = await supabase.functions.invoke("athmovil-create-payment", {
        body: { draftId },
      });

      // supabase-js wraps non-2xx responses in `error` but still gives us `data`
      const errorKey = (data as { error?: string } | null)?.error;
      const athErrorCode = (data as { athErrorCode?: string } | null)?.athErrorCode;
      const success = (data as { success?: boolean } | null)?.success === true;
      const ecommerceId = (data as { ecommerceId?: string } | null)?.ecommerceId;

      if (error && !errorKey) {
        // Pure network/transport failure (no JSON body to parse)
        console.warn("[AthMovilRestButton] state: loading → error (transport)", error);
        setErrorMsg(mapErrorMessage(undefined, isEs));
        setState("error");
        return;
      }

      if (!success || errorKey) {
        console.warn("[AthMovilRestButton] state: loading → error", { errorKey, athErrorCode, data });
        setErrorMsg(mapErrorMessage(errorKey, isEs, athErrorCode));
        setState("error");
        return;
      }

      console.log("[AthMovilRestButton] state: loading → success", { draftId, ecommerceId });
      // Close the booking modal BEFORE navigating, otherwise the overlay stays
      // mounted on top of /citas/confirmando and the user sees "nothing happens".
      closeBooking();
      // Attempt direct hand-off to the ATH Móvil app via custom URL scheme.
      // This MUST run synchronously inside the user-gesture stack so iOS Safari
      // honors the scheme launch. If ATH isn't installed nothing happens and the
      // user still lands on /citas/confirmando which polls for webhook commit.
      if (ecommerceId) {
        try {
          window.location.href = `athm://present?ecommerceId=${encodeURIComponent(ecommerceId)}`;
        } catch (e) {
          console.warn("[AthMovilRestButton] scheme launch threw", e);
        }
      }
      setTimeout(() => {
        navigate(`/citas/confirmando?draftId=${draftId}`, { replace: true });
      }, 250);
    } catch (e) {
      console.warn("[AthMovilRestButton] state: loading → error (exception)", e);
      setErrorMsg(mapErrorMessage(undefined, isEs));
      setState("error");
    }
  };

  return (
    <AthMovilOrangeButton
      loading={loading}
      disabled={disabled}
      helperText={helperText}
      showHelperText={showHelperText}
      errorMessage={errorMsg ?? undefined}
      onClick={handleClick}
      isEs={isEs}
    />
  );
}
