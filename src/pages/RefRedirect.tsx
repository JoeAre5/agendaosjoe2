/**
 * `/r/:code` — landing route for shareable links.
 *
 * Two distinct purposes, never mixed:
 *   - Barber booking links (`/r/charlie`, `/r/hector`, `/r/joseph`, `/r/shop`)
 *     go straight into the public booking flow with the barber preselected.
 *     No referral attribution, no onboarding.
 *   - Any other code is a client referral link: captured (90 days) and
 *     routed to the `/bienvenido` onboarding.
 */
import { useMemo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { persistRefCode } from "@/lib/referral";

// Booking-link code → public barber slug used by /citas/:barberSlug
const BARBER_BOOKING_CODES: Record<string, string> = {
  charlie: "charlie",
  hector: "pito",
  pito: "pito",
  joseph: "joseph",
};

export default function RefRedirect() {
  const { code } = useParams<{ code: string }>();
  const normalized = (code || "").toLowerCase().trim();

  const target = useMemo(() => {
    if (!normalized || normalized === "shop") return "/";
    const barberSlug = BARBER_BOOKING_CODES[normalized];
    if (barberSlug) return `/citas/${barberSlug}?autostart=1`;
    persistRefCode(normalized, `/r/${normalized}`);
    return `/bienvenido?ref=${encodeURIComponent(normalized)}`;
  }, [normalized]);

  return <Navigate to={target} replace />;
}
