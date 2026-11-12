import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { useScrollReveal, useStaggerStyle } from "@/hooks/useScrollReveal";
import { useBooking } from "@/contexts/BookingContext";

const services = [
  { nameEs: "La Experiencia", nameEn: "The Experience", price: "$90+", duration: "90 min", descEs: "Nuestra experiencia premium incluye corte, facial y tratamiento de barba completo. El servicio signature de Charlie's Barbershop.", descEn: "Our premium experience includes haircut, facial, and full beard treatment. Charlie's Barbershop signature service." },
  { nameEs: "La Experiencia + Cobertura de Canas", nameEn: "The Experience + White Hair Coverage", price: "$150+", duration: "120 min", descEs: "La experiencia completa con cobertura de canas para cabello y barba. Relajación total y un look renovado.", descEn: "The full experience with white hair coverage for hair and beard. Total relaxation and a refreshed look." },
];

export default function ServiciosExperiencias() {
  const { language } = useTranslation();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  const { openBooking } = useBooking();

  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <SEOHead title="Experiencias Premium — Charlie's Barbershop" description="Experiencias premium desde $90. Corte, facial y barba." path="/servicios/experiencias" />
      <AnimatedSection>
        <h1 className="font-black uppercase text-[32px] mb-2" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "Experiencias" : "Experiences"}
        </h1>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Experiencias premium en Charlie's Barbershop, Camuy, PR."
            : "Premium experiences at Charlie's Barbershop, Camuy, PR."}
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
