// Public pay page — /pay/:id
// Loads an unpaid appointment by id and renders the unified <AppointmentPaywall>
// (same visual shell as the public booking-flow PaymentStep, same endpoints
// already proven by this page's history).
import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Calendar,
  Clock,
  Scissors,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { AppointmentPaywall } from "@/components/site/booking/AppointmentPaywall";
import { PublicAppointmentAthButton } from "@/components/site/booking/PublicAppointmentAthButton";
import { usePreferences } from "@/hooks/usePreferences";

interface AppointmentInfo {
  id: string;
  service_name: string;
  starts_at: string;
  duration_minutes: number;
  price_cents: number;
  amount_paid_cents: number;
  payment_confirmed: boolean;
  status: string;
  client_name: string;
  client_phone?: string | null;
  barber_name?: string | null;
}

const ACCENT = "var(--accent-color)";

export default function Pay() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = usePreferences();
  const isEs = language === "es";

  const [appt, setAppt] = useState<AppointmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const stripeReturning = !!searchParams.get("stripe_session_id");

  useEffect(() => {
    if (!token) {
      setLoadError(isEs ? "Enlace inválido" : "Invalid link");
      setLoading(false);
      return;
    }
    // Anonymous visitors cannot read appointments directly (RLS), so the pay
    // page reads a minimal public projection through an edge function.
    const fetchAppt = async (): Promise<boolean> => {
      const { data, error } = await supabase.functions.invoke("appointment-pay-info", {
        body: { payCode: token },
      });
      const info = data as {
        id?: string; service_name?: string; starts_at?: string; duration_minutes?: number;
        price_cents?: number; amount_paid_cents?: number; balance_cents?: number;
        fully_paid?: boolean; status?: string; first_name?: string; barber_name?: string | null;
        error?: string;
      } | null;
      if (error || !info?.id) {
        setLoadError(
          isEs
            ? "Este enlace de pago no es válido, expiró o el balance cambió. Pide uno nuevo a la barbería."
            : "This payment link is invalid, expired, or the balance changed. Ask the shop for a new one.",
        );
        return false;
      }
      if (info.status === "cancelled") {
        setLoadError(isEs ? "Esta cita fue cancelada" : "This appointment was cancelled");
        return false;
      }
      setAppt({
        id: info.id,
        service_name: info.service_name || "",
        starts_at: info.starts_at || "",
        duration_minutes: info.duration_minutes || 30,
        price_cents: info.price_cents || 0,
        amount_paid_cents: info.amount_paid_cents || 0,
        payment_confirmed: !!info.fully_paid,
        status: info.status || "scheduled",
        client_name: info.first_name || "",
        barber_name: info.barber_name ?? null,
      });
      if (info.fully_paid) setPaid(true);
      return !!info.fully_paid;
    };

    (async () => {
      try {
        const isPaid = await fetchAppt();
        setLoading(false);
        if (stripeReturning && !isPaid) {
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (await fetchAppt()) break;
          }
        }
      } catch (e) {
        setLoadError((e as Error).message);
        setLoading(false);
      }
    })();
  }, [token, isEs, stripeReturning]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="mx-auto mb-3" style={{ color: "#ef4444" }} />
          <p className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            {loadError}
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 py-2 px-4 rounded-lg text-sm font-semibold"
            style={{ background: ACCENT, color: "#fff" }}
          >
            {isEs ? "Volver al inicio" : "Back to home"}
          </button>
        </div>
      </div>
    );
  }

  if (paid && appt) return <PaidView appt={appt} isEs={isEs} />;
  if (!appt) return null;

  const dateLabel = format(
    parseISO(appt.starts_at),
    isEs ? "EEEE, d 'de' MMMM" : "EEEE, MMMM d",
    { locale: isEs ? esLocale : undefined }
  );
  const timeLabel = format(parseISO(appt.starts_at), "h:mm a");

  return (
    <>
      <Helmet>
        <title>
          {isEs
            ? "Completar pago — Charlie's Barbershop"
            : "Complete payment — Charlie's Barbershop"}
        </title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg-base)" }}>
        <div className="max-w-md mx-auto space-y-5">
          <div className="text-center mb-2">
            <h1
              className="text-2xl font-extrabold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {isEs ? "Completa tu pago" : "Complete your payment"}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {isEs
                ? `¡Hola, ${appt.client_name.split(" ")[0]}!`
                : `Hi, ${appt.client_name.split(" ")[0]}!`}
            </p>
          </div>

          <div
            className="rounded-2xl p-4 space-y-2.5"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <Row icon={<Scissors size={14} />} label={appt.service_name} />
            {appt.barber_name && <Row icon={<Scissors size={14} />} label={appt.barber_name} />}
            <Row icon={<Calendar size={14} />} label={dateLabel} />
            <Row
              icon={<Clock size={14} />}
              label={`${timeLabel} · ${appt.duration_minutes} min`}
            />
          </div>

          {/* Unified paywall — same visual shell as public booking-flow PaymentStep.
              ATH Móvil is the primary action; card/PayPal live in the method sheet. */}
          <AppointmentPaywall
            appointmentId={appt.id}
            payCode={token}
            basePriceCents={Math.max(0, appt.price_cents - appt.amount_paid_cents)}
            serviceName={appt.service_name}
            isEs={isEs}
            accent={ACCENT}
            onPaid={() => setPaid(true)}
            primaryAction={({ tipCents, totalCents }) => (
              <PublicAppointmentAthButton
                payCode={token!}
                tipCents={tipCents}
                totalCents={totalCents}
                isEs={isEs}
                onPaid={() => setPaid(true)}
              />
            )}
          />
        </div>
      </div>
    </>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex items-center gap-2 text-[13px]"
      style={{ color: "var(--text-primary)" }}
    >
      <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function PaidView({ appt, isEs }: { appt: AppointmentInfo; isEs: boolean }) {
  const dateLabel = format(
    parseISO(appt.starts_at),
    isEs ? "EEEE, d 'de' MMMM, h:mm a" : "EEEE, MMMM d, h:mm a",
    { locale: isEs ? esLocale : undefined }
  );
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="text-center max-w-sm">
        <CheckCircle2 size={56} className="mx-auto mb-4" style={{ color: ACCENT }} />
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
          {isEs ? "¡Pago confirmado!" : "Payment confirmed!"}
        </h1>
        <p className="text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>
          {appt.service_name}
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          {dateLabel}
        </p>
        <p className="text-[12px] mt-6" style={{ color: "var(--text-tertiary)" }}>
          {isEs ? "Te enviaremos un recibo por correo." : "We'll send you a receipt by email."}
        </p>
      </div>
    </div>
  );
}
