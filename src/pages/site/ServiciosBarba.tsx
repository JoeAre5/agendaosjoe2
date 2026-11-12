import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { useScrollReveal, useStaggerStyle } from "@/hooks/useScrollReveal";
import { useBooking } from "@/contexts/BookingContext";

const services = [
  { nameEs: "Barba + Toalla Caliente", nameEn: "Beard + Hot Towel", price: "$20+", duration: "30 min", descEs: "Recorte y perfilado de barba con toalla caliente para una experiencia relajante y un acabado impecable.", descEn: "Beard trim and shaping with a hot towel for a relaxing experience and flawless finish." },
  { nameEs: "Barba + Cobertura de Canas", nameEn: "Beard + White Hair Coverage", price: "$50", duration: "45 min", descEs: "Recorte de barba profesional con cobertura de canas para un look uniforme y juvenil.", descEn: "Professional beard trim with white hair coverage for a uniform, youthful look." },
];

export default function ServiciosBarba() {
  const { language } = useTranslation();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  const { openBooking } = useBooking();

  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <SEOHead title="Barba & Hot Towel — Charlie's Barbershop" description="Arreglo y diseño de barba con toalla caliente, aceites y after-shave en Camuy, PR. Servicios profesionales desde $20. Reserva tu cita en línea." path="/servicios/barba" />
      <AnimatedSection>
        <h1 className="font-black uppercase text-[32px] mb-2" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "Barba" : "Beard"}
        </h1>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Servicios de barba profesionales en Charlie's Barbershop, Camuy, PR."
            : "Professional beard services at Charlie's Barbershop, Camuy, PR."}
        </p>
        <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          {language === "es"
            ? "Los precios pueden variar según el barbero y el servicio"
            : "Prices may vary by barber and service"}
        </p>
      </AnimatedSection>

      <div ref={ref} className="space-y-4">
        {services.map((s, i) => (
          <div
            key={s.nameEs}
            className="px-5 py-4 rounded-xl transition-all duration-200 hover:scale-[1.01]"
            style={{
              ...useStaggerStyle(isVisible, i),
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? s.nameEs : s.nameEn}
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{s.duration}</p>
              </div>
              <span className="text-base font-bold" style={{ color: "var(--accent-color)" }}>{s.price}</span>
            </div>
            <p className="text-base leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? s.descEs : s.descEn}
            </p>
          </div>
        ))}
      </div>

      <AnimatedSection delay={0.3}>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => openBooking()}
            className="inline-block px-8 py-4 rounded-full text-sm font-bold uppercase tracking-wider text-center transition-transform duration-200 hover:scale-105 active:scale-95"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {language === "es" ? "Reservar Ahora" : "Book Now"}
          </button>
          <Link
            to="/"
            className="inline-block px-8 py-4 rounded-full text-sm font-bold uppercase tracking-wider text-center transition-transform duration-200 hover:scale-105 active:scale-95"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
          >
            {language === "es" ? "Ver Todos los Servicios" : "View All Services"}
          </Link>
        </div>
      </AnimatedSection>
    </div>
  );
}
