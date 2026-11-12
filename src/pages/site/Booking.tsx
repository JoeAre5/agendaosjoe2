import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Navigate, Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { useBooking } from "@/contexts/BookingContext";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { useScrollReveal, useStaggerStyle } from "@/hooks/useScrollReveal";
import { supabase } from "@/integrations/supabase/client";

import charlieImg from "@/assets/barber-charlie.jpg";
import hectorImg from "@/assets/barber-hector.jpg";
import josephImg from "@/assets/barber-joseph.jpg";

const BARBER_FALLBACK_IMAGES: Record<string, string> = {
  charlie: charlieImg,
  pito: hectorImg,
  joseph: josephImg,
};

interface BarberPublic {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
}

const publicBarberSlug = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("charlie")) return "charlie";
  if (n.includes("hector") || n.includes("pito")) return "pito";
  if (n.includes("joseph")) return "joseph";
  return n.split(" ")[0] || "";
};

const STATIC_TITLES: Record<string, { es: string; en: string }> = {
  charlie: { es: "Dueño & Barbero", en: "Owner & Barber" },
  pito: { es: "Barbero", en: "Barber" },
  joseph: { es: "Barbero", en: "Barber" },
};

function BookBarberButton({ slug, language, name, large }: { slug: string; language: string; name: string; large?: boolean }) {
  const { openBooking } = useBooking();
  return (
    <button
      onClick={() => openBooking(slug)}
      className={
        large
          ? "px-8 py-4 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:opacity-90 shrink-0"
          : "px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 hover:opacity-90 shrink-0"
      }
      style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
    >
      {language === "es" ? `Reservar` : `Book`}
    </button>
  );
}

export default function Booking() {
  const { language } = useTranslation();
  const { barberSlug } = useParams<{ barberSlug?: string }>();
  const [searchParams] = useSearchParams();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  const { openBooking } = useBooking();
  const autostartedRef = useRef(false);

  const [resolvedBarber, setResolvedBarber] = useState<BarberPublic | null>(null);
  const [allBarbers, setAllBarbers] = useState<BarberPublic[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("barbers_public")
      .select("id, name, description, avatar_url")
      .eq("is_active", true)
      .then(({ data }) => {
        const list = (data || []) as BarberPublic[];
        setAllBarbers(list);
        if (barberSlug) {
          const slug = barberSlug.toLowerCase();
          const match = list.find((b) => publicBarberSlug(b.name) === slug);
          if (match) setResolvedBarber(match);
          else setNotFound(true);
        }
        setLoading(false);
      });
  }, [barberSlug]);

  // Auto-open the booking flow when arriving via referral link (?autostart=1)
  useEffect(() => {
    if (autostartedRef.current) return;
    if (!resolvedBarber) return;
    if (searchParams.get("autostart") !== "1") return;
    autostartedRef.current = true;
    openBooking(publicBarberSlug(resolvedBarber.name));
  }, [resolvedBarber, searchParams, openBooking]);


  if (notFound) return <Navigate to={"/citas"} replace />;
  if (loading) return null;

  // Single barber view
  if (resolvedBarber) {
    const slug = publicBarberSlug(resolvedBarber.name);
    const img = resolvedBarber.avatar_url || BARBER_FALLBACK_IMAGES[slug] || charlieImg;
    const title = STATIC_TITLES[slug] || { es: "Barbero", en: "Barber" };

    return (
      <div className="max-w-md mx-auto px-5 py-16 pb-28 md:pb-16">
        <SEOHead
          title={`Reserva con ${resolvedBarber.name} — Charlie's Barbershop`}
          description={`Reserva tu cita con ${resolvedBarber.name} en Charlie's Barbershop, Camuy PR.`}
          path={`/citas/${slug}`}
        />
        <AnimatedSection>
          <div className="flex flex-col items-center text-center">
            <h1
              className="font-black uppercase leading-[0.95] mb-1"
              style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
            >
              {resolvedBarber.name}
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              {title[language]}
            </p>
            <div
              className="w-56 h-72 rounded-2xl overflow-hidden mb-5"
              style={{ background: "var(--bg-surface-2)" }}
            >
              <img
                src={img}
                alt={resolvedBarber.name}
                className="w-full h-full object-cover"
              />
            </div>
            <BookBarberButton slug={slug} language={language} name={resolvedBarber.name} large />
          </div>
        </AnimatedSection>
      </div>
    );
  }


  // Default: all barbers (filter Yvette/non-bookable, order Charlie, Hector, Joseph)
  const ORDER = ["charlie", "pito", "joseph"];
  const BARBERS = ORDER
    .map((slug) => {
      const b = allBarbers.find((x) => publicBarberSlug(x.name) === slug);
      if (!b) return null;
      return {
        slug,
        label: b.name,
        title: STATIC_TITLES[slug] || { es: "Barbero", en: "Barber" },
        img: b.avatar_url || BARBER_FALLBACK_IMAGES[slug] || charlieImg,
      };
    })
    .filter(Boolean) as { slug: string; label: string; title: { es: string; en: string }; img: string }[];

  return (
    <div className="max-w-4xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <SEOHead title="Reserva Tu Cita — Charlie's Barbershop" description="Reserva tu cita con tu barbero favorito en Charlie's Barbershop, Camuy PR." path="/citas" />
      <AnimatedSection>
        <h1
          className="font-black uppercase leading-[0.95] mb-3"
          style={{ fontSize: "clamp(32px, 6vw, 56px)", letterSpacing: "-1.5px", color: "var(--text-primary)" }}
        >
          {language === "es" ? "Reserva Tu Cita" : "Book Your Appointment"}
        </h1>
        <p className="text-base mb-10" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Selecciona tu barbero y reserva en línea."
            : "Select your barber and book online."}
        </p>
      </AnimatedSection>

      <div className="flex flex-col">
        {BARBERS.map((b, i) => (
          <div
            key={b.slug}
            className="flex items-center gap-4 py-4"
            style={{
              borderTop: i === 0 ? undefined : "1px solid var(--divider)",
            }}
          >
            <img loading="lazy" decoding="async"
              src={b.img}
              alt={b.label}
              className="w-12 h-12 rounded-full object-cover shrink-0"
              style={{ background: "var(--bg-surface-2)" }}
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                {b.label}
              </h3>
              <p className="text-xs mt-1 truncate" style={{ color: "var(--text-secondary)" }}>
                {b.title[language]}
              </p>
            </div>
            <BookBarberButton slug={b.slug} language={language} name={b.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
