// AdminAppointmentPay — dedicated admin pay screen for an EXISTING appointment.
//
// Layout: Back · summary · tip · ORANGE ATH (primary) · Change payment method.
// The "Change payment method" sheet opens Card (hosted Stripe Checkout with
// Apple Pay / Link / Klarna) or PayPal — same surface as the public /pay/:id.
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { AppointmentPaywall } from "@/components/site/booking/AppointmentPaywall";
import { AdminAthMovilRestButton } from "@/components/admin/AdminAthMovilRestButton";

const ACCENT = "var(--accent-color)";

interface ApptInfo {
  id: string;
  service_name: string;
  starts_at: string;
  duration_minutes: number;
  price_cents: number;
  amount_paid_cents: number;
  payment_confirmed: boolean;
  status: string;
  client_name: string;
  client_phone: string | null;
}

export default function AdminAppointmentPay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = usePreferences();
  const isEs = language === "es";

  const [appt, setAppt] = useState<ApptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waitingForAth, setWaitingForAth] = useState<string | null>(null);
  // ATH reference captured from the completed transaction so we can show it on "done".
  const [paidAthRef, setPaidAthRef] = useState<string | null>(null);
  const [paidMethod, setPaidMethod] = useState<string | null>(null);

  const stripeReturning = !!searchParams.get("stripe_session_id");

  useEffect(() => {
    if (!id) { setLoadError(isEs ? "Cita inválida" : "Invalid appointment"); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, service_name, starts_at, duration_minutes, price_cents, amount_paid_cents, payment_confirmed, status, client_name, client_phone")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return false;
      if (error || !data) { setLoadError(isEs ? "Cita no encontrada" : "Appointment not found"); setLoading(false); return true; }
      if (data.status === "cancelled") { setLoadError(isEs ? "Esta cita fue cancelada" : "Appointment cancelled"); setLoading(false); return true; }
      setAppt(data as ApptInfo);
      // Only treat as done if there's no outstanding balance. After EditAppointment
      // adds a service, price_cents grows but payment_confirmed stays true for the
      // original portion — we must still let the user pay the new balance.
      const balance = Math.max(0, (data.price_cents || 0) - (data.amount_paid_cents || 0));
      const fullyPaid = data.payment_confirmed && balance === 0;
      if (fullyPaid) setDone(true);
      setLoading(false);
      return fullyPaid;
    };

    (async () => {
      const paid = await load();
      if (stripeReturning && !paid) {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const confirmed = await load();
          if (confirmed) break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEs, stripeReturning]);

  useEffect(() => {
    if (!waitingForAth || !appt) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("transactions")
        .select("status, payment_method, ath_reference_number")
        .eq("id", waitingForAth)
        .maybeSingle();
      if (data?.status === "completed") {
        setPaidAthRef(data.ath_reference_number ?? null);
        setPaidMethod(data.payment_method ?? "ath_movil");
        setDone(true);
        setWaitingForAth(null);
      } else if (data?.status === "failed") {
        setWaitingForAth(null);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [waitingForAth, appt]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="mx-auto mb-3" style={{ color: "#ef4444" }} />
          <p className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{loadError}</p>
          <button onClick={() => navigate(-1)} className="mt-4 py-2 px-4 rounded-lg text-sm font-semibold" style={{ background: ACCENT, color: "#fff" }}>
            {isEs ? "Volver" : "Back"}
          </button>
        </div>
      </div>
    );
  }

  if (!appt) return null;

  const balanceCents = Math.max(0, (appt.price_cents || 0) - (appt.amount_paid_cents || 0));

  if (done) {
    const methodLabelMap: Record<string, string> = {
      ath_movil: "ATH Móvil",
      stripe: isEs ? "Tarjeta" : "Card",
      apple_pay: "Apple Pay",
      google_pay: "Google Pay",
      link: "Link",
      paypal: "PayPal",
      cash: isEs ? "Efectivo" : "Cash",
    };
    const methodLabel = paidMethod ? (methodLabelMap[paidMethod] ?? paidMethod) : null;
    const refShort = paidAthRef ? `…${paidAthRef.slice(-8).toUpperCase()}` : null;
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-sm">
          <CheckCircle2 size={56} className="mx-auto mb-4" style={{ color: ACCENT }} />
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
            {isEs ? "¡Pago confirmado!" : "Payment confirmed!"}
          </h1>
          <p className="text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>{appt.service_name}</p>
          {(methodLabel || refShort) && (
            <div className="mt-4 inline-flex flex-col gap-1 text-[12px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {methodLabel && (
                <span>{isEs ? "Pagado con" : "Paid with"} <strong style={{ color: "var(--text-primary)" }}>{methodLabel}</strong></span>
              )}
              {refShort && (
                <span>{isEs ? "Referencia" : "Reference"} <strong style={{ color: "var(--text-primary)" }}>{refShort}</strong></span>
              )}
            </div>
          )}
          <button
            onClick={() => navigate(`/admin/appointment/${appt.id}`)}
            className="mt-6 py-2 px-4 rounded-lg text-sm font-semibold block mx-auto"
            style={{ background: ACCENT, color: "#fff" }}
          >
            {isEs ? "Volver a la cita" : "Back to appointment"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-md mx-auto space-y-5">
        <button onClick={() => navigate(`/admin/appointment/${appt.id}`)} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft size={16} /> {isEs ? "Volver" : "Back"}
        </button>

        {waitingForAth ? (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex flex-col items-center gap-2 text-center">
              <Loader2 size={28} className="animate-spin" style={{ color: "#FF6B00" }} />
              <p className="text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>
                {isEs ? "Esperando autorización del cliente" : "Waiting for client authorization"}
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {isEs
                  ? "Pídele al cliente que complete el pago en su ATH Móvil."
                  : "Ask the client to complete the payment in their ATH Móvil."}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.25)" }}>
              <p className="text-[10.5px] uppercase tracking-wide font-bold mb-2 text-center" style={{ color: "#FF6B00" }}>
                {isEs ? "Pasos del cliente" : "Client's steps"}
              </p>
              <ol className="space-y-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>1.</span><span>{isEs ? "Abrir la notificación o la app ATH Móvil." : "Open the notification or the ATH Móvil app."}</span></li>
                <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>2.</span><span>{isEs ? "Revisar el monto y autorizar el pago." : "Review the amount and authorize the payment."}</span></li>
                <li className="flex gap-2"><span style={{ color: "#FF6B00", fontWeight: 800 }}>3.</span><span>{isEs ? "Esta pantalla confirmará el pago automáticamente." : "This screen will confirm the payment automatically."}</span></li>
              </ol>
            </div>
            <button onClick={() => setWaitingForAth(null)} className="block mx-auto text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              {isEs ? "Cancelar y elegir otro método" : "Cancel and choose another method"}
            </button>
          </div>
        ) : (
          <AppointmentPaywall
            appointmentId={appt.id}
            basePriceCents={balanceCents}
            serviceName={appt.service_name}
            isEs={isEs}
            accent={ACCENT}
            flowSource="admin_pay"
            onPaid={() => setDone(true)}
            primaryAction={({ tipCents, totalCents }) => (
              <AdminAthMovilRestButton
                appointmentId={appt.id}
                phone={appt.client_phone || ""}
                totalCents={totalCents}
                tipCents={tipCents}
                isEs={isEs}
                onSent={(txnId) => setWaitingForAth(txnId)}
                showHelperText={false}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
