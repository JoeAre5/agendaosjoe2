// /citas/confirmado — permalink for an already-committed booking draft.
// Uses the public `get-booking-details` edge function action so we bypass RLS
// (anon role cannot read booking_drafts/appointments). Renders the same
// ConfirmationPopup directly in the "committed" state, plus an inline
// "Create your account" card for guest bookings that don't yet have an
// auth account.
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import ConfirmationPopup from "@/components/site/booking/ConfirmationPopup";
import { useReviewPrompt } from "@/hooks/useReviewPrompt";

interface CommittedData {
  firstName: string;
  serviceName: string;
  barberName: string;
  whenLabel: string;
  priceCents: number;
  startsAtIso: string;
  endsAtIso: string;
  appointmentId: string;
  email: string | null;
  canClaimAccount: boolean;
  isReturningGuest: boolean;
}

export default function BookingConfirmed() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useTranslation();
  const isEs = language === "es";

  const draftId = searchParams.get("draftId");
  const [data, setData] = useState<CommittedData | null>(null);

  useEffect(() => {
    if (!draftId) { navigate("/", { replace: true }); return; }
    (async () => {
      const { data: res, error } = await supabase.functions.invoke("pay-then-book", {
        body: { action: "get-booking-details", draftId },
      });
      if (error || !res?.success || res.status !== "committed" || !res.appointment) {
        navigate("/", { replace: true });
        return;
      }
      const a = res.appointment as {
        id: string; starts_at: string; ends_at: string;
        service_name: string; price_cents: number; barber_name: string;
      };
      const startDate = new Date(a.starts_at);
      const whenLabel = format(
        startDate,
        isEs ? "EEEE d 'de' MMMM - h:mm a" : "EEEE, MMMM d - h:mm a",
        { locale: isEs ? esLocale : undefined }
      );
      setData({
        firstName: res.first_name || "",
        serviceName: a.service_name,
        barberName: a.barber_name,
        whenLabel: whenLabel.charAt(0).toUpperCase() + whenLabel.slice(1),
        priceCents: a.price_cents,
        startsAtIso: a.starts_at,
        endsAtIso: a.ends_at,
        appointmentId: a.id,
        email: res.email || null,
        canClaimAccount: !!res.can_claim_account,
        isReturningGuest: !!res.is_returning_guest,
      });
      try {
        const { recordReferralConversion } = await import("@/lib/referral");
        await recordReferralConversion("first_booking", res.client_id ?? null, a.id);
      } catch { /* ignore */ }
    })();
  }, [draftId, navigate, isEs]);

  const review = useReviewPrompt(data?.appointmentId ?? null, draftId, !!data, isEs);

  const leave = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      navigate("/app/cliente", { replace: true });
      return;
    }
    const email = data?.email ? `?email=${encodeURIComponent(data.email)}` : "";
    navigate(`/citas/instala${email}`);
  };

  const downloadIcs = () => {
    if (!data) return;
    const dt = (iso: string) =>
      iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace(/Z?$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Charlie's Barbershop//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${data.appointmentId}@charliesbarbershop.com`,
      `DTSTAMP:${dt(new Date().toISOString())}`,
      `DTSTART:${dt(new Date(data.startsAtIso).toISOString())}`,
      `DTEND:${dt(new Date(data.endsAtIso).toISOString())}`,
      `SUMMARY:${data.serviceName} — Charlie's Barbershop`,
      `DESCRIPTION:${isEs ? "Cita con" : "Appointment with"} ${data.barberName}`,
      "LOCATION:PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cita-${data.appointmentId.slice(0, 8)}.ics`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <ConfirmationPopup
        state="polling"
        isEs={isEs}
        onPrimaryAction={() => {}}
        onSecondaryAction={() => {}}
      />
    );
  }

  if (review.open) return <>{review.overlay}</>;

  return (
    <>
      <ConfirmationPopup
        state="committed"
        isEs={isEs}
        firstName={data.firstName}
        appointment={{
          serviceName: data.serviceName,
          barberName: data.barberName,
          whenLabel: data.whenLabel,
          priceCents: data.priceCents,
        }}
        onPrimaryAction={downloadIcs}
        committedSecondaryLabel={isEs ? "Ver citas" : "View bookings"}
        // Logged-in/PWA users go straight back to the portal. Guests still
        // enter the install/account bridge.
        onSecondaryAction={() => review.runAfter(() => { void leave(); })}
        onBackdropDismiss={() => review.runAfter(() => { void leave(); })}
      />

    </>
  );
}
