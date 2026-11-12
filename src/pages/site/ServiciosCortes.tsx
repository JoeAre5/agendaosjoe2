import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { useScrollReveal, useStaggerStyle } from "@/hooks/useScrollReveal";
import { useBooking } from "@/contexts/BookingContext";

const services = [
  { nameEs: "Corte de Niños", nameEn: "Kids Haircut", price: "$20+", duration: "30 min", descEs: "Corte profesional para niños en un ambiente amigable y divertido.", descEn: "Professional haircut for kids in a friendly, fun environment." },
  { nameEs: "Corte", nameEn: "Haircut", price: "$25+", duration: "30 min", descEs: "Corte de pelo profesional con atención al detalle y estilo personalizado.", descEn: "Professional haircut with attention to detail and personalized styling." },
  { nameEs: "Corte + Facial", nameEn: "Haircut + Facial", price: "$50+", duration: "60 min", descEs: "Corte de pelo completo combinado con un facial rejuvenecedor para una experiencia premium.", descEn: "Full haircut combined with a rejuvenating facial for a premium experience." },
  { nameEs: "Corte + Cobertura de Canas", nameEn: "Haircut + White Hair Coverage", price: "$60", duration: "60 min", descEs: "Corte profesional con cobertura de canas para un look fresco y natural.", descEn: "Professional haircut with white hair coverage for a fresh, natural look." },
];

export default function ServiciosCortes() {
  const { language } = useTranslation();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  const { openBooking } = useBooking();

  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <SEOHead title="Cortes de Pelo — Charlie's Barbershop" description="Cortes de pelo profesionales para hombres y niños en Camuy, PR. Estilos clásicos y modernos desde $20. Reserva en línea con barberos certificados." path="/servicios/cortes" />
      <AnimatedSection>
        <h1 className="font-black uppercase text-[32px] mb-2" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "Cortes de Pelo" : "Haircuts"}
        </h1>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Cortes profesionales en Charlie's Barbershop, Camuy, PR."
            : "Professional haircuts at Charlie's Barbershop, Camuy, PR."}
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
