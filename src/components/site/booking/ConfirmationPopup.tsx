// Single popup card used during the public booking confirmation sequence.
// Mounts once and morphs its inner content between states so the customer
// sees one continuous animated experience (no page swap).
//
// Visual style intentionally matches the admin cancellation popup
// (src/pages/AppointmentDetail.tsx): white card, gold "Confirmación" pill,
// spring entry. Card is white in BOTH light and dark mode.
//
// Backdrop: pre-blurred screenshots of the public homepage (one per theme)
// are used as a fixed full-screen background. Heavy Gaussian blur is baked
// into the asset so no DOM content is visible — zero risk of leaking the
// previous booking step. A thin tint overlay sits above the image to
// guarantee the white card pops against either palette.
import { type ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, AlertTriangle, Clock, RotateCcw, XCircle } from "lucide-react";
import CelebrationCheckmark from "@/components/ui/CelebrationCheckmark";
import { usePreferences } from "@/hooks/usePreferences";
const bgDark = "/assets/payment-bg-dark.webp";
const bgLight = "/assets/payment-bg-light.webp";

export type PopupState = "polling" | "committed" | "failed" | "refunded" | "timeout" | "stripe_cancelled";
export type PaymentMethod = "ath" | "stripe" | "paypal";

interface AppointmentSummary {
  serviceName: string;
  barberName: string;
  whenLabel: string; // pre-formatted, e.g. "Martes 21 de Abril · 1:00 PM"
  priceCents: number;
  /** Raw payment method code from the transactions table (ath_movil, stripe, paypal, cash, …). */
  paymentMethodCode?: string | null;
  /** ATH Móvil reference number — shown in committed state when paid via ATH. */
  athReferenceNumber?: string | null;
}

interface Props {
  state: PopupState;
  isEs: boolean;
  /** Which gateway the customer is paying through. Drives polling copy. */
  paymentMethod?: PaymentMethod;
  /** Customer first name — used in committed subtitle */
  firstName?: string;
  /** Required for committed state */
  appointment?: AppointmentSummary;
  /** Optional reason text shown below the subtitle in failed/refunded states */
  reason?: string | null;
  /** Primary CTA — committed: add to calendar, others: navigate */
  onPrimaryAction: () => void;
  /** Secondary CTA — usually "back to home" / "book another" */
  onSecondaryAction: () => void;
  /** Optional tertiary CTA — committed only: create account / sign in */
  onTertiaryAction?: () => void;
  /** Custom label override for tertiary CTA */
  tertiaryLabel?: string;
  /** Custom label override for the committed-state secondary CTA */
  committedSecondaryLabel?: string;
  /** Optional: when set, clicking the backdrop in committed state triggers this. */
  onBackdropDismiss?: () => void;
  /** True once polling has run long enough that we reassure the customer. */
  slow?: boolean;
}

const PILL_BG = "rgba(201,168,130,0.15)";
const PILL_FG = "rgba(160,128,96,1)";

export default function ConfirmationPopup({
  state,
  isEs,
  paymentMethod = "ath",
  firstName,
  appointment,
  reason,
  onPrimaryAction,
  onSecondaryAction,
  onTertiaryAction,
  tertiaryLabel,
  committedSecondaryLabel,
  onBackdropDismiss,
  slow = false,
}: Props) {
  const { resolvedTheme } = usePreferences();
  const bg = resolvedTheme === "dark" ? bgDark : bgLight;
  const tintColor =
    resolvedTheme === "dark" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.15)";

  // Lock scroll while popup is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const pillLabel =
    state === "failed" || state === "refunded"
      ? (isEs ? "Aviso" : "Notice")
      : (isEs ? "Confirmación" : "Confirmation");

  const pillColors =
    state === "failed"
      ? { bg: "rgba(248,113,113,0.15)", fg: "rgba(220,38,38,1)" }
      : state === "refunded" || state === "timeout"
      ? { bg: "rgba(234,179,8,0.15)", fg: "rgba(161,98,7,1)" }
      : { bg: PILL_BG, fg: PILL_FG };

  return (
    <>
      {/* Backdrop — pre-blurred homepage screenshot (theme-aware), with a
          thin tint overlay to ensure the white card pops. The image is a
          static marketing asset — no customer data is ever rendered here. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={state === "committed" && onBackdropDismiss ? onBackdropDismiss : undefined}
        className="fixed inset-0 z-50"
        style={{
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          cursor: state === "committed" && onBackdropDismiss ? "pointer" : "default",
        }}
      >
        <div
          className="absolute inset-0"
          style={{ background: tintColor }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
      >
        <div
          className="pointer-events-auto w-full max-w-[340px]"
          style={{
            background: "#ffffff",
            borderRadius: 28,
            boxShadow:
              "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
            padding: "28px 24px 24px",
          }}
        >
          {/* Pill */}
          <div className="flex justify-center mb-3">
            <span
              className="text-[11px] font-semibold tracking-wide px-3.5 py-1"
              style={{
                borderRadius: 10,
                background: pillColors.bg,
                color: pillColors.fg,
              }}
            >
              {pillLabel}
            </span>
          </div>

          {/* Cross-fading content area */}
          <AnimatePresence mode="wait">
            {state === "polling" && (
              <PollingContent key="polling" isEs={isEs} method={paymentMethod} slow={slow} />
            )}
            {state === "committed" && appointment && (
              <CommittedContent
                key="committed"
                isEs={isEs}
                firstName={firstName}
                appointment={appointment}
                onPrimary={onPrimaryAction}
                onSecondary={onSecondaryAction}
                onTertiary={onTertiaryAction}
                tertiaryLabel={tertiaryLabel}
                secondaryLabel={committedSecondaryLabel}
              />
            )}
            {state === "failed" && (
              <StatusContent
                key="failed"
                icon={<AlertTriangle size={56} color="#ef4444" strokeWidth={2.2} />}
                title={isEs ? "Pago no completado" : "Payment failed"}
                subtitle={isEs ? "Vuelve a intentar." : "Please try again."}
                reason={reason}
                primaryLabel={isEs ? "Volver al inicio" : "Back to home"}
                secondaryLabel={null}
                onPrimary={onPrimaryAction}
                onSecondary={onSecondaryAction}
              />
            )}
            {state === "refunded" && (
              <StatusContent
                key="refunded"
                icon={<RotateCcw size={48} color="#eab308" strokeWidth={2.4} />}
                title={isEs ? "Pago devuelto" : "Payment refunded"}
                subtitle={
                  isEs
                    ? "El horario ya no estaba disponible. Tu pago será reembolsado en 3-5 días hábiles."
                    : "That time was no longer available. Your payment will be refunded in 3-5 business days."
                }
                reason={reason}
                primaryLabel={isEs ? "Reservar otra hora" : "Book another time"}
                secondaryLabel={null}
                onPrimary={onPrimaryAction}
                onSecondary={onSecondaryAction}
              />
            )}
            {state === "timeout" && (
              <StatusContent
                key="timeout"
                icon={<Clock size={48} color="#eab308" strokeWidth={2.4} />}
                title={isEs ? "Procesando tu pago" : "Processing your payment"}
                subtitle={
                  isEs
                    ? "Te enviaremos un mensaje de texto cuando tu cita sea confirmada."
                    : "We'll send you a text when your appointment is confirmed."
                }
                primaryLabel={isEs ? "Volver al inicio" : "Back to home"}
                secondaryLabel={null}
                onPrimary={onPrimaryAction}
                onSecondary={onSecondaryAction}
              />
            )}
            {state === "stripe_cancelled" && (
              <StatusContent
                key="stripe_cancelled"
                icon={<XCircle size={52} color="rgba(0,0,0,0.45)" strokeWidth={2.2} />}
                title={isEs ? "Pago cancelado" : "Payment cancelled"}
                subtitle={
                  isEs
                    ? "Tu reserva sigue activa por unos minutos más."
                    : "Your booking is still held for a few more minutes."
                }
                primaryLabel={isEs ? "Elegir otro método" : "Choose another method"}
                secondaryLabel={isEs ? "Cancelar reserva" : "Cancel booking"}
                onPrimary={onPrimaryAction}
                onSecondary={onSecondaryAction}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Polling ─────────────────────────────────────────────────────── */
function PollingContent({ isEs, method, slow }: { isEs: boolean; method: PaymentMethod; slow?: boolean }) {
  if (slow) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-2">
        <div className="my-2 flex items-center justify-center" style={{ height: 56 }}>
          <Loader2 size={48} className="animate-spin icon-bold" style={{ color: "rgba(160,128,96,1)" }} />
        </div>
        <p className="text-[20px] font-black text-center" style={{ color: "#111111", letterSpacing: "-0.5px", fontFamily: "Montserrat, system-ui, sans-serif" }}>
          {isEs ? "Estamos confirmando tu cita" : "We're confirming your appointment"}
        </p>
        <p className="text-[13px] text-center px-2" style={{ color: "rgba(0,0,0,0.6)" }}>
          {isEs
            ? "Si ya autorizaste el pago, no tienes que pagar otra vez. Puedes cerrar esta página; te avisaremos cuando tu cita quede confirmada. Si vuelves a reservar, te traeremos aquí."
            : "If you already authorized the payment, you don't need to pay again. You can close this page; we'll let you know once your appointment is confirmed. If you try to book again, we'll bring you back here."}
        </p>
      </motion.div>
    );
  }
  const isAth = method === "ath";
  const title = isAth
    ? (isEs ? "Abre tu app ATH Móvil" : "Open your ATH Móvil app")
    : (isEs ? "Confirmando tu pago…" : "Confirming your payment…");
  const subtitle = isAth
    ? (isEs
        ? "Tu pago aún no se ha completado. Recibiste una notificación push, ábrela o entra a la app ATH Móvil para autorizar."
        : "Your payment is not done yet. You got a push notification — open it or launch ATH Móvil to authorize.")
    : (isEs
        ? "Estamos verificando tu pago. Esto puede tomar unos segundos."
        : "We're verifying your payment. This may take a few seconds.");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-3 py-2"
    >
      <div className="my-2 flex items-center justify-center" style={{ height: 56 }}>
        <Loader2 size={48} className="animate-spin icon-bold" style={{ color: "rgba(160,128,96,1)" }} />
      </div>
      <motion.p
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="text-[20px] font-black text-center"
        style={{ color: "#111111", letterSpacing: "-0.5px", fontFamily: "Montserrat, system-ui, sans-serif" }}
      >
        {title}
      </motion.p>
      <p className="text-[13px] text-center px-2" style={{ color: "rgba(0,0,0,0.6)" }}>
        {subtitle}
      </p>

      {isAth && (
        <div
          className="w-full mt-3 rounded-2xl p-3.5"
          style={{ background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.25)" }}
        >
          <p
            className="text-[11px] uppercase tracking-wide font-bold mb-2 text-center"
            style={{ color: "#FF6B00" }}
          >
            {isEs ? "Pasos para completar el pago" : "Steps to complete payment"}
          </p>
          <ol className="space-y-2 text-[12.5px]" style={{ color: "rgba(0,0,0,0.75)" }}>
            <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>1.</span><span>{isEs ? "Abre la notificación o la app ATH Móvil." : "Open the notification or the ATH Móvil app."}</span></li>
            <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>2.</span><span>{isEs ? "Revisa el monto y autoriza el pago." : "Review the amount and authorize the payment."}</span></li>
            <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>3.</span><span>{isEs ? "Vuelve a esta pantalla — confirmaremos tu cita." : "Come back to this screen — we'll confirm your booking."}</span></li>
          </ol>
        </div>
      )}

      <p className="text-[11px] text-center mt-1" style={{ color: "rgba(0,0,0,0.4)" }}>
        {isEs ? "No cierres esta ventana." : "Don't close this window."}
      </p>
    </motion.div>
  );
}

/* ─── Committed ───────────────────────────────────────────────────── */
function CommittedContent({
  isEs, firstName, appointment, onPrimary, onSecondary, onTertiary, tertiaryLabel, secondaryLabel,
}: {
  isEs: boolean;
  firstName?: string;
  appointment: AppointmentSummary;
  onPrimary: () => void;
  onSecondary: () => void;
  onTertiary?: () => void;
  tertiaryLabel?: string;
  secondaryLabel?: string;
}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { fireCelebrationConfetti } = await import("@/lib/celebrationConfetti");
      if (!cancelled) fireCelebrationConfetti();
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-3 py-2"
    >
      <div className="my-2">
        <CelebrationCheckmark size={64} />
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="text-[22px] font-black text-center uppercase"
        style={{ color: "#111111", letterSpacing: "-1px", fontFamily: "Montserrat, system-ui, sans-serif" }}
      >
        {isEs ? "¡Cita Confirmada!" : "Appointment Confirmed!"}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="text-[13px] text-center"
        style={{ color: "rgba(0,0,0,0.5)" }}
      >
        {firstName
          ? (isEs ? `${firstName}, te esperamos pronto` : `${firstName}, see you soon`)
          : (isEs ? "Te esperamos pronto" : "See you soon")}
      </motion.p>

      {/* Appointment details — slides in after the title morph */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.35 }}
        className="w-full mt-3 rounded-2xl p-4 space-y-2"
        style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <Row label={isEs ? "Servicio" : "Service"} value={appointment.serviceName.toUpperCase()} />
        <Row label={isEs ? "Barbero" : "Barber"} value={appointment.barberName} />
        <Row label={isEs ? "Cuándo" : "When"} value={appointment.whenLabel} />
        {appointment.paymentMethodCode && (
          <Row
            label={isEs ? "Método" : "Method"}
            value={paymentMethodLabel(appointment.paymentMethodCode, isEs)}
          />
        )}
        {appointment.athReferenceNumber && (
          <Row
            label={isEs ? "Referencia" : "Reference"}
            value={shortRef(appointment.athReferenceNumber)}
          />
        )}
        <Row
          label={isEs ? "Total" : "Total"}
          value={`$${(appointment.priceCents / 100).toFixed(2)}`}
          accent
        />
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.3 }}
        className="w-full flex flex-col gap-2 mt-3"
      >
        <button
          onClick={onPrimary}
          className="w-full text-center font-semibold transition-all active:scale-[0.97]"
          style={{
            background: "rgba(160,128,96,1)",
            color: "#ffffff",
            fontSize: 13,
            padding: "11px 0",
            borderRadius: "var(--radius-control)",
          }}
        >
          {isEs ? "Añadir al Calendario" : "Add to Calendar"}
        </button>
        <button
          onClick={onSecondary}
          className="w-full text-center font-semibold transition-all active:scale-[0.97]"
          style={{
            background: "transparent",
            color: "#111111",
            fontSize: 13,
            padding: "11px 0",
            borderRadius: "var(--radius-control)",
            border: "1px solid rgba(0,0,0,0.12)",
          }}
        >
          {secondaryLabel ?? (isEs ? "Volver al inicio" : "Back to home")}
        </button>
        {onTertiary && (
          <button
            onClick={onTertiary}
            className="w-full text-center font-semibold transition-all active:scale-[0.97] hover:opacity-80"
            style={{
              background: "transparent",
              color: "rgba(160,128,96,1)",
              fontSize: 13,
              padding: "8px 0 4px",
              borderRadius: "var(--radius-control)",
            }}
          >
            {tertiaryLabel ?? (isEs ? "Crear cuenta o iniciar sesión" : "Create account or sign in")}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "rgba(0,0,0,0.4)" }}>{label}</span>
      <span
        className="text-[13px] text-right"
        style={{
          color: accent ? "rgba(160,128,96,1)" : "#111111",
          fontWeight: accent ? 800 : 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Maps the raw DB payment_method code to a customer-facing label. */
function paymentMethodLabel(code: string, isEs: boolean): string {
  switch (code) {
    case "ath_movil": return "ATH Móvil";
    case "stripe":
    case "card":     return isEs ? "Tarjeta" : "Card";
    case "apple_pay": return "Apple Pay";
    case "google_pay": return "Google Pay";
    case "link":     return "Link";
    case "paypal":   return "PayPal";
    case "cash":     return isEs ? "Efectivo" : "Cash";
    default:         return code;
  }
}

/** Trims a long ATH reference to the last 8 hex chars for at-a-glance display. */
function shortRef(ref: string): string {
  const tail = ref.slice(-8).toUpperCase();
  return tail.length === ref.length ? tail : `…${tail}`;
}

/* ─── Status (failed / refunded / timeout) ───────────────────────── */
function StatusContent({
  icon, title, subtitle, reason,
  primaryLabel, secondaryLabel,
  onPrimary, onSecondary,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  reason?: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-3 py-2"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="my-2"
      >
        {icon}
      </motion.div>
      <p className="text-[20px] font-black text-center" style={{ color: "#111111", letterSpacing: "-0.5px", fontFamily: "Montserrat, system-ui, sans-serif" }}>
        {title}
      </p>
      <p className="text-[13px] text-center px-2" style={{ color: "rgba(0,0,0,0.5)" }}>{subtitle}</p>
      {reason && (
        <p className="text-[11px] text-center px-2" style={{ color: "rgba(0,0,0,0.35)" }}>{reason}</p>
      )}
      <div className="w-full flex flex-col gap-2 mt-3">
        <button
          onClick={onPrimary}
          className="w-full text-center font-semibold transition-all active:scale-[0.97]"
          style={{ background: "rgba(160,128,96,1)", color: "#ffffff", fontSize: 13, padding: "11px 0", borderRadius: "var(--radius-control)" }}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="w-full text-center font-semibold transition-all active:scale-[0.97]"
            style={{ background: "transparent", color: "#111111", fontSize: 13, padding: "11px 0", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.12)" }}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}
