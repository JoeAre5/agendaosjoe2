// AdminAthMovilRestButton — admin wrapper around AthMovilOrangeButton.
//
// REST-based. Charges an EXISTING appointment via `admin-appointment-ath-pay`,
// which inserts a pending transaction and asks ATH to push the customer's
// phone. The existing `athmovil-webhook` (admin-appointment branch) commits
// the transaction + appointment when the customer authorizes.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone10 } from "@/lib/phone";
import { AthMovilOrangeButton } from "@/components/shared/AthMovilOrangeButton";

const MAX_AMOUNT_CENTS = 150_000;

interface Props {
  appointmentId: string;
  phone: string;
  totalCents: number;
  tipCents: number;
  isEs: boolean;
  onSent: (transactionId: string) => void;
  showHelperText?: boolean;
}

function mapError(key: string | undefined, isEs: boolean, athErrorCode?: string): string {
  if (athErrorCode === "PCUS_0007") {
    return isEs
      ? "Este número no está registrado en ATH Móvil o no puede usarse para esta transacción."
      : "This number isn't registered with ATH Móvil or can't be used for this transaction.";
  }
  switch (key) {
    case "appointment_not_found": return isEs ? "Cita no encontrada." : "Appointment not found.";
    case "appointment_cancelled": return isEs ? "Esta cita fue cancelada." : "Appointment was cancelled.";
    case "already_paid": return isEs ? "Esta cita ya está pagada." : "This appointment is already paid.";
    case "invalid_phone": return isEs ? "Número de celular inválido." : "Invalid phone number.";
    case "phone_not_on_file": return isEs ? "Ese número no está en el perfil del cliente." : "That number is not on the client's profile.";
    case "amount_exceeds_ath_limit": return isEs ? "Monto excede límite ATH ($1,500)." : "Amount exceeds ATH limit ($1,500).";
    case "ath_api_error":
    case "ath_network_error": return isEs ? "ATH Móvil no responde. Intenta de nuevo." : "ATH Móvil unreachable. Try again.";
    default: return isEs ? "Error de conexión. Intenta de nuevo." : "Connection error. Try again.";
  }
}

export function AdminAthMovilRestButton({ appointmentId, phone, totalCents, tipCents, isEs, onSent, showHelperText = true }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const phoneNorm = normalizePhone10(phone);
  const phoneValid = phoneNorm.length === 10;
  const overLimit = totalCents > MAX_AMOUNT_CENTS;
  const disabled = loading || !phoneValid || overLimit;

  const helperText = !phoneValid
    ? (isEs ? "Falta número de celular del cliente" : "Client phone number is required")
    : overLimit
      ? (isEs ? "Monto excede límite ATH ($1,500)" : "Amount exceeds ATH limit ($1,500)")
      : (isEs
          ? "El cliente recibirá una notificación en su ATH Móvil. Debe abrirla y autorizar el pago."
          : "The client will get a push in their ATH Móvil. They need to open it and authorize the payment.");

  const handleClick = async () => {
    if (disabled) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-appointment-ath-pay", {
        body: { appointmentId, tipCents, phone: phoneNorm },
      });
      const errorKey = (data as { error?: string } | null)?.error;
      const athErrorCode = (data as { athErrorCode?: string } | null)?.athErrorCode;
      const success = (data as { success?: boolean } | null)?.success === true;
      const txnId = (data as { transactionId?: string } | null)?.transactionId;
      if (error && !errorKey) {
        setErrorMsg(mapError(undefined, isEs));
        setLoading(false);
        return;
      }
      if (!success || errorKey || !txnId) {
        setErrorMsg(mapError(errorKey, isEs, athErrorCode));
        setLoading(false);
        return;
      }
      // Attempt direct hand-off to the ATH Móvil app via custom URL scheme.
      // Must run synchronously inside the user-gesture stack so iOS Safari
      // honors the scheme launch. If ATH isn't installed nothing happens and
      // the existing webhook + polling still confirms the transaction.
      const ecommerceId = (data as { ecommerceId?: string } | null)?.ecommerceId;
      if (ecommerceId) {
        try {
          window.location.href = `athm://present?ecommerceId=${encodeURIComponent(ecommerceId)}`;
        } catch (e) {
          console.warn("[AdminAthMovilRestButton] scheme launch threw", e);
        }
      }
      setTimeout(() => onSent(txnId), 250);
    } catch (e) {
      console.warn("[AdminAthMovilRestButton] error", e);
      setErrorMsg(mapError(undefined, isEs));
      setLoading(false);
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
