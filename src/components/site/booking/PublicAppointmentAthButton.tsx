// PublicAppointmentAthButton — ATH Móvil charge for an EXISTING appointment
// from the public pay page (/pay/:id, usually reached by scanning the QR).
//
// The client types their ATH Móvil phone once; the server computes the amount
// from the appointment itself and pushes the request to the ATH app. Because
// the transaction carries the appointment id, the webhook applies the payment
// directly to that appointment (no name/phone matching).
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone10 } from "@/lib/phone";
import { AthMovilOrangeButton } from "@/components/shared/AthMovilOrangeButton";

interface Props {
  payCode: string;
  tipCents: number;
  totalCents: number;
  defaultPhone?: string | null;
  isEs: boolean;
  onPaid: () => void;
}

function mapError(key: string | undefined, isEs: boolean, athErrorCode?: string): string {
  if (athErrorCode === "PCUS_0007") {
    return isEs
      ? "Este número no está registrado en ATH Móvil o no puede usarse para este pago."
      : "This number isn't registered with ATH Móvil or can't be used for this payment.";
  }
  switch (key) {
    case "appointment_not_found": return isEs ? "Cita no encontrada." : "Appointment not found.";
    case "appointment_cancelled": return isEs ? "Esta cita fue cancelada." : "Appointment was cancelled.";
    case "already_paid": return isEs ? "Esta cita ya está pagada." : "This appointment is already paid.";
    case "invalid_phone": return isEs ? "Número de celular inválido." : "Invalid phone number.";
    case "invalid_link": return isEs ? "Este enlace no es válido o expiró. Pide uno nuevo." : "This link is invalid or expired. Ask for a new one.";
    case "link_outdated": return isEs ? "El balance cambió. Pide un enlace nuevo." : "The balance changed. Ask for a new link.";
    case "rate_limited": return isEs ? "Demasiados intentos. Espera unos minutos." : "Too many attempts. Please wait a few minutes.";
    case "amount_exceeds_ath_limit": return isEs ? "Monto excede límite ATH ($1,500)." : "Amount exceeds ATH limit ($1,500).";
    case "ath_api_error":
    case "ath_network_error": return isEs ? "ATH Móvil no responde. Intenta de nuevo." : "ATH Móvil unreachable. Try again.";
    default: return isEs ? "Error de conexión. Intenta de nuevo." : "Connection error. Try again.";
  }
}

export function PublicAppointmentAthButton({ payCode, tipCents, totalCents, defaultPhone, isEs, onPaid }: Props) {
  const [phone, setPhone] = useState(normalizePhone10(defaultPhone || ""));
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const phoneValid = normalizePhone10(phone).length === 10;
  const overLimit = totalCents > 150_000;
  const disabled = loading || waiting || !phoneValid || overLimit;

  // Anonymous visitors can't read `transactions` (RLS), so we poll the public
  // appointment projection until the webhook marks the balance as settled.
  const pollTransaction = (_txnId: string) => {
    setWaiting(true);
    const started = Date.now();
    const interval = setInterval(async () => {
      const { data } = await supabase.functions.invoke("appointment-pay-info", {
        body: { payCode },
      });
      const info = data as { fully_paid?: boolean } | null;
      if (info?.fully_paid) {
        clearInterval(interval);
        setWaiting(false);
        onPaid();
      } else if (Date.now() - started > 10 * 60 * 1000) {
        clearInterval(interval);
        setWaiting(false);
        setLoading(false);
        setErrorMsg(isEs ? "No se completó el pago. Intenta de nuevo." : "Payment wasn't completed. Try again.");
      }
    }, 2500);
  };

  const handleClick = async () => {
    if (disabled) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("appointment-ath-pay-public", {
        body: { payCode, tipCents, phone: normalizePhone10(phone) },
      });
      const payload = data as { success?: boolean; error?: string; athErrorCode?: string; transactionId?: string; ecommerceId?: string } | null;
      if ((error && !payload?.error) || !payload?.success || !payload.transactionId) {
        setErrorMsg(mapError(payload?.error, isEs, payload?.athErrorCode));
        setLoading(false);
        return;
      }
      if (payload.ecommerceId) {
        try {
          window.location.href = `athm://present?ecommerceId=${encodeURIComponent(payload.ecommerceId)}`;
        } catch { /* ATH app not installed — the push notification still works */ }
      }
      pollTransaction(payload.transactionId);
    } catch {
      setErrorMsg(mapError(undefined, isEs));
      setLoading(false);
    }
  };

  if (waiting) {
    return (
      <div className="rounded-2xl p-4 text-center space-y-2" style={{ background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.25)" }}>
        <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "#FF6B00" }} />
        <p className="text-[14px] font-extrabold" style={{ color: "var(--text-primary)" }}>
          {isEs ? "Autoriza el pago en tu ATH Móvil" : "Authorize the payment in your ATH Móvil"}
        </p>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {isEs
            ? "Abre la notificación de ATH Móvil y aprueba. Esta pantalla se actualiza sola."
            : "Open the ATH Móvil notification and approve. This screen updates on its own."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl p-3.5 space-y-2.5" style={{ background: "rgba(255,107,0,0.06)", border: "1px solid rgba(255,107,0,0.25)" }}>
      <label htmlFor="ath-phone" className="block text-[11px] font-bold uppercase tracking-wider px-1" style={{ color: "var(--text-secondary)" }}>
        {isEs ? "Celular de ATH Móvil" : "ATH Móvil phone number"}
      </label>
      <input
        id="ath-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="787 555 1234"
        className="w-full h-12 rounded-xl px-4 text-[16px] font-medium outline-none transition-shadow focus:ring-2 focus:ring-[#FF6B00]/40"
        style={{ background: "var(--bg-card, var(--bg-surface))", border: "1.5px solid rgba(255,107,0,0.45)", color: "var(--text-primary)" }}
      />

      <AthMovilOrangeButton
        loading={loading}
        disabled={disabled}
        showHelperText
        helperText={
          overLimit
            ? (isEs ? "Monto excede límite ATH ($1,500)" : "Amount exceeds ATH limit ($1,500)")
            : (isEs
                ? "Recibirás un aviso en tu ATH Móvil para aprobar el pago."
                : "You'll get a push in your ATH Móvil to approve the payment.")
        }
        errorMessage={errorMsg ?? undefined}
        onClick={handleClick}
        isEs={isEs}
      />
    </div>
  );
}
