import { useTranslation } from "@/hooks/useTranslation";
import { useBooking } from "@/contexts/BookingContext";

export function StickyBookingBar() {
  const { language } = useTranslation();
  const { openBooking } = useBooking();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderTop: "1px solid var(--divider)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "¿Listo para tu cita?" : "Ready to book?"}
        </span>
        <button
          onClick={() => openBooking()}
          className="px-5 py-3 rounded-full text-xs font-bold uppercase tracking-wider"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
        >
          {language === "es" ? "Reservar" : "Book Now"}
        </button>
      </div>
    </div>
  );
}
