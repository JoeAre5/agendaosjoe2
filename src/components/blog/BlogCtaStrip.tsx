import { useTranslation } from "@/hooks/useTranslation";
import { useBooking } from "@/contexts/BookingContext";
import { Link } from "react-router-dom";

export function BlogCtaStrip() {
  const { language } = useTranslation();
  const { openBooking } = useBooking();

  return (
    <div className="my-16">
      <div style={{ borderTop: "1px solid var(--divider)" }} className="mb-10" />
      <div className="text-center max-w-2xl mx-auto">
        <h3
          className="font-black mb-3"
          style={{
            color: "var(--text-primary)",
            fontSize: "clamp(28px, 4vw, 44px)",
            letterSpacing: "-1px",
            lineHeight: 1.05,
          }}
        >
          {language === "es"
            ? "Reserva tu próximo corte en segundos."
            : "Book your next cut in seconds."}
        </h3>
        <p className="text-sm md:text-base mb-8" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Citas reales con barberos reales. Sin llamadas, sin esperas."
            : "Real appointments with real barbers. No calls, no waiting."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => openBooking()}
            className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-transform active:scale-95"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {language === "es" ? "Reservar Ahora" : "Book Now"}
          </button>
          <Link
            to="/servicios/cortes"
            className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-transform active:scale-95 inline-flex items-center justify-center"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1.5px solid var(--divider)" }}
          >
            {language === "es" ? "Ver Servicios" : "View Services"}
          </Link>
        </div>
      </div>
    </div>
  );
}
