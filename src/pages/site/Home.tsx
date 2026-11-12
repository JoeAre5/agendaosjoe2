import { SEOHead } from "@/components/SEOHead";
import { Link, useNavigate } from "react-router-dom";
import { Star, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { ContactForm } from "@/components/site/ContactForm";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { useScrollReveal, useStaggerStyle } from "@/hooks/useScrollReveal";
import { useBooking } from "@/contexts/BookingContext";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { bi } from "@/lib/siteContent";
import { supabase } from "@/integrations/supabase/client";
import { BlogCard, type BlogCardPost } from "@/components/blog/BlogCard";
import InstallHomeScreenSection from "@/components/site/InstallHomeScreenSection";

import heroImg from "@/assets/hero-shop.jpg";
const charlieImg = "/assets/barber-charlie-circle.webp";
const hectorImg = "/assets/barber-hector-circle.webp";
const josephImg = "/assets/barber-joseph-circle.webp";
import ig1 from "@/assets/ig-1.jpg";
const ig2 = "/assets/ig-2.webp";
import ig3 from "@/assets/ig-3.jpg";
import ig4 from "@/assets/ig-4.jpg";

/** Resolve a CTA link: "book" → opens booking flow; otherwise navigate. */
function useCtaHandler() {
  const { openBooking } = useBooking();
  const navigate = useNavigate();
  return (link: string, slug?: string) => {
    if (!link || link === "book") return openBooking(slug);
    if (link.startsWith("http")) { window.location.href = link; return; }
    navigate(link);
  };
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--accent-color)" }}>
        {text}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

/* ── Hero ── */
export function HeroSection() {
  const { language } = useTranslation();
  const onCta = useCtaHandler();
  const c = useSiteContent().hero;
  const [customHero, setCustomHero] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shop_settings_public" as any)
        .select("hero_image_url")
        .limit(1)
        .maybeSingle();
      const url = (data as any)?.hero_image_url;
      if (url) setCustomHero(url);
    })();
  }, []);
  const src = customHero || heroImg;
  return (
    <section className="relative overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-6xl mx-auto px-5 py-10 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1
            className="font-black uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 8vw, 72px)", letterSpacing: "-2px", color: "var(--text-primary)" }}>
            {bi(c.title, language)}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed max-w-md" style={{ color: "var(--text-secondary)" }}>
            {bi(c.subtitle, language)}
          </p>

          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} fill="var(--accent-color)" strokeWidth={0} />
              ))}
              <span className="text-xs font-semibold ml-1" style={{ color: "var(--text-primary)" }}>{c.rating_value}</span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{bi(c.rating_label, language)}</span>
          </div>

          <button
            onClick={() => onCta(c.primary_cta_link)}
            className="inline-flex items-center gap-3 mt-8 pl-8 pr-2 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-transform duration-200 hover:scale-105 active:scale-95"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            <span className="py-2">{bi(c.primary_cta, language)}</span>
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-full shrink-0 bg-white dark:bg-black"
              style={{ color: "var(--cta-bg)" }}
              aria-hidden="true">
              <ChevronRight size={18} strokeWidth={2.5} />
            </span>
          </button>
        </div>

        <div className="aspect-[4/5] rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
          <img src={src} alt="Charlie's Barbershop interior" width={1200} height={1500}
               fetchPriority="high" decoding="async" className="w-full h-full object-cover" />
        </div>
      </div>
    </section>
  );
}

/* ── Team ── */
export function TeamSection() {
  const { language } = useTranslation();
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();
  const { openBooking } = useBooking();
  const c = useSiteContent().team;
  const barbers = [
    { name: "Charlie", slug: "charlie", title: language === "es" ? "Dueño & Barbero" : "Owner & Barber", img: charlieImg },
    { name: "Hector",  slug: "pito",    title: language === "es" ? "Barbero" : "Barber", img: hectorImg },
    { name: "Joseph",  slug: "joseph",  title: language === "es" ? "Barbero" : "Barber", img: josephImg },
  ];
  return (
    <AnimatedSection>
      <section className="max-w-6xl mx-auto px-5 py-8">
        <SectionLabel text={bi(c.eyebrow, language)} />
        <div ref={ref} className="flex justify-center gap-8 sm:gap-14">
          {barbers.map((b, i) => (
            <div key={b.name} className="flex flex-col items-center text-center" style={useStaggerStyle(isVisible, i)}>
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden transition-transform duration-300 hover:scale-110"
                   style={{ background: "var(--bg-surface-2)", border: "2px solid var(--border)" }}>
                <img loading="lazy" decoding="async" src={b.img} alt={b.name} className="w-full h-full object-cover" />
              </div>
              <h3 className="font-bold text-sm mt-3" style={{ color: "var(--text-primary)" }}>{b.name}</h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{b.title}</p>
              <button onClick={() => openBooking(b.slug)} className="mt-2 text-xs font-bold uppercase tracking-wider story-link"
                      style={{ color: "var(--accent-color)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {bi(c.book_label, language)} →
              </button>
            </div>
          ))}
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Services ── */
export function ServicesSection() {
  const { language } = useTranslation();
  const c = useSiteContent().services;
  const [tab, setTab] = useState(0);
  const services = [
    [
      { nameEs: "Corte de Niños", nameEn: "Kids Haircut", price: "$20+", duration: "30 min" },
      { nameEs: "Corte", nameEn: "Haircut", price: "$25+", duration: "30 min" },
      { nameEs: "Corte + Facial", nameEn: "Haircut + Facial", price: "$50+", duration: "60 min" },
      { nameEs: "Corte + Cobertura de Canas", nameEn: "Haircut + White Hair Coverage", price: "$60", duration: "60 min" },
    ],
    [
      { nameEs: "Barba + Toalla Caliente", nameEn: "Beard + Hot Towel", price: "$20+", duration: "30 min" },
      { nameEs: "Barba + Cobertura de Canas", nameEn: "Beard + White Hair Coverage", price: "$50", duration: "45 min" },
    ],
    [
      { nameEs: "La Experiencia", nameEn: "The Experience", price: "$90+", duration: "90 min" },
      { nameEs: "La Experiencia + Cobertura de Canas", nameEn: "The Experience + White Hair Coverage", price: "$150+", duration: "120 min" },
    ],
  ];
  return (
    <AnimatedSection>
      <section className="max-w-6xl mx-auto px-5 py-8">
        <SectionLabel text={bi(c.eyebrow, language)} />
        <p className="text-xs mb-6 -mt-4" style={{ color: "var(--text-tertiary)" }}>{bi(c.disclaimer, language)}</p>
        <div className="flex gap-2 mb-6">
          {c.tabs.map((cat, i) => (
            <button key={i} onClick={() => setTab(i)}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
                    style={{
                      background: tab === i ? "var(--cta-bg)" : "var(--bg-surface-2)",
                      color:      tab === i ? "var(--cta-fg)" : "var(--text-secondary)",
                    }}>
              {bi(cat, language)}
            </button>
          ))}
        </div>
        <div key={tab} className="space-y-3">
          {(services[tab] || []).map((s) => (
            <div key={s.nameEs} className="flex items-start justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.01]"
                 style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? s.nameEs : s.nameEn}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{s.duration}</p>
              </div>
              <span className="text-sm font-bold" style={{ color: "var(--accent-color)" }}>{s.price}</span>
            </div>
          ))}
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Reviews ── */
export function ReviewsSection() {
  const { language } = useTranslation();
  const c = useSiteContent().reviews;
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviews = [
    { name: "John Caban", textEs: "Gran servicio, excelentes empleados y ambiente de trabajo.", textEn: "Great service, excellent employees and work environment.", rating: 5 },
    { name: "Chrissie Roberts", textEs: "¡Esta gente tiene talento! Son amables y simpáticos. Le cortó el pelo a mi esposo bien nítido y rápido. Teníamos a nuestra hija de 3 años y apenas tuvimos que esperar. Limpio y bonito por dentro también. Súper profesionales.", textEn: "These people are talented! They're kind and friendly. He cut my husband's hair so nice and fresh but so fast. We had our 3 year old daughter and we hardly had to wait. Clean and nice inside also. Super professional.", rating: 5 },
    { name: "Keyla Ortega", textEs: "Excelente servicio. A mi hijo le encanta cortarse el pelo con Charlie.", textEn: "Excellent service. My son loves getting his hair cut with Charlie.", rating: 5 },
  ];
  return (
    <AnimatedSection>
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-5"><SectionLabel text={bi(c.eyebrow, language)} /></div>
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-5 pt-6 pb-8"
             style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          <div className="shrink-0 w-0 md:w-[calc((100vw-1152px)/2)]" />
          {reviews.map((r, i) => (
            <div key={i} className="shrink-0 snap-start p-5 rounded-2xl transition-transform duration-200 hover:scale-[1.02]"
                 style={{ width: "min(85vw, 360px)", background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 4px 24px -4px rgba(0,0,0,0.08)" }}>
              <div className="flex gap-1 mb-3">
                {[...Array(r.rating)].map((_, j) => <Star key={j} size={12} fill="var(--accent-color)" strokeWidth={0} />)}
              </div>
              <p className="text-base leading-relaxed mb-3" style={{ color: "var(--text-primary)" }}>"{language === "es" ? r.textEs : r.textEn}"</p>
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{r.name}</span>
            </div>
          ))}
          <div className="shrink-0 w-4" />
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Blog ── */
const BLOG_SELECT =
  "id, slug, slug_en, title, title_en, excerpt, excerpt_en, category, cover_icon, cover_icon_secondary, cover_bg_preset, author, author_avatar_url, read_time_minutes, published_at";

export function BlogPreviewSection() {
  const { language } = useTranslation();
  const c = useSiteContent().blog;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [posts, setPosts] = useState<BlogCardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([
      supabase.from("blog_posts").select(BLOG_SELECT).eq("is_published", true).order("published_at", { ascending: false }).limit(12),
      supabase.from("blog_categories").select("slug, label_es, label_en").eq("is_active", true),
    ]).then(([postsRes, catsRes]) => {
      if (!mounted) return;
      setPosts((postsRes.data as unknown as BlogCardPost[]) || []);
      const map: Record<string, string> = {};
      (catsRes.data || []).forEach((cat: any) => { map[cat.slug] = language === "es" ? cat.label_es : cat.label_en; });
      setCategoryLabels(map);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [language]);

  if (loading || posts.length === 0) return null;

  return (
    <AnimatedSection>
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-5 flex items-end justify-between">
          <SectionLabel text={bi(c.eyebrow, language)} />
        </div>
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-5 pt-2 pb-8"
             style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          <div className="shrink-0 w-0 md:w-[calc((100vw-1152px)/2)]" />
          {posts.map((post) => (
            <div key={post.id} className="shrink-0 snap-start" style={{ width: "min(85vw, 360px)" }}>
              <BlogCard post={post} categoryLabel={categoryLabels[post.category || ""]} />
            </div>
          ))}
          <div className="shrink-0 w-4" />
        </div>
        <div className="text-center mt-2">
          <Link to="/titulares" className="text-xs font-bold uppercase tracking-wider story-link" style={{ color: "var(--accent-color)" }}>
            {bi(c.view_all_label, language)}
          </Link>
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── FAQ ── */
export function FAQSection() {
  const { language } = useTranslation();
  const c = useSiteContent().faq;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <AnimatedSection>
      <section className="max-w-6xl mx-auto px-5 py-8">
        <SectionLabel text={bi(c.eyebrow, language)} />
        <div className="max-w-2xl space-y-2">
          {c.items.map((f, i) => (
            <div key={i} className="rounded-xl overflow-hidden transition-all duration-200" style={{ border: "1px solid var(--border)" }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors duration-200">
                <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{bi(f.q, language)}</span>
                {open === i ? <ChevronUp size={16} style={{ color: "var(--text-tertiary)" }} />
                            : <ChevronDown size={16} style={{ color: "var(--text-tertiary)" }} />}
              </button>
              {open === i && (
                <div className="overflow-hidden">
                  <p className="px-4 pb-4 text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>{bi(f.a, language)}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Contact ── */
function ContactSection() {
  const { language } = useTranslation();
  return (
    <section className="max-w-6xl mx-auto px-5 py-8">
      <SectionLabel text={language === "es" ? "Contacto" : "Contact"} />
      <div className="grid md:grid-cols-2 gap-8">
        <div className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <ContactForm />
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
          <iframe
            src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=Charlie's+Barbershop,+Carr+2+km+93.3,+Membrillo,+00627,+Puerto+Rico&zoom=15"
            className="w-full h-full min-h-[300px]" style={{ border: 0 }}
            allowFullScreen loading="lazy" title="Charlie's Barbershop Location" />
        </div>
      </div>
    </section>
  );
}

/* ── Instagram ── */
export function InstagramSection() {
  const { language } = useTranslation();
  const c = useSiteContent().instagram;
  const igPhotos = [ig1, ig2, ig3, ig4];
  return (
    <AnimatedSection>
      <section className="max-w-6xl mx-auto px-5 py-8">
        <SectionLabel text={bi(c.eyebrow, language)} />
        <p className="text-base mb-6" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "Síguenos en Instagram" : "Follow us on Instagram"}{" "}
          <a href="https://www.instagram.com/charliesbarbershop.co" target="_blank" rel="noopener noreferrer"
             className="font-semibold story-link" style={{ color: "var(--accent-color)" }}>
            @charliesbarbershop.co
          </a>
        </p>
        <div className="grid grid-cols-2 gap-1">
          {igPhotos.map((photo, i) => {
            const radiusMap = ["16px 0 0 0", "0 16px 0 0", "0 0 0 16px", "0 0 16px 0"];
            return (
              <a key={i} href="https://www.instagram.com/charliesbarbershop.co" target="_blank" rel="noopener noreferrer"
                 className="aspect-square overflow-hidden group"
                 style={{ background: "var(--bg-surface-2)", borderRadius: radiusMap[i] }}>
                <img loading="lazy" decoding="async" src={photo} alt={`Instagram post ${i + 1}`}
                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              </a>
            );
          })}
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Bottom CTA ── */
export function HomeCtaStrip() {
  const { language } = useTranslation();
  const c = useSiteContent().cta;
  const onCta = useCtaHandler();
  return (
    <AnimatedSection>
      <section className="max-w-3xl mx-auto px-5 py-12">
        <div className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <h2 className="text-2xl font-black mb-2" style={{ color: "var(--text-primary)" }}>{bi(c.title, language)}</h2>
          <p className="text-base mb-6" style={{ color: "var(--text-secondary)" }}>{bi(c.subtitle, language)}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => onCta(c.primary_link)}
                    className="px-8 py-3 rounded-full text-sm font-bold uppercase tracking-wider"
                    style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
              {bi(c.primary_label, language)}
            </button>
            <button onClick={() => onCta(c.secondary_link)}
                    className="px-8 py-3 rounded-full text-sm font-bold uppercase tracking-wider"
                    style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
              {bi(c.secondary_label, language)}
            </button>
          </div>
        </div>
      </section>
    </AnimatedSection>
  );
}

/* ── Main Home Page ── */
export default function Home() {
  const { language } = useTranslation();
  const navigate = useNavigate();
  const vis = (useSiteContent() as any).visibility || {};
  const show = (key: string) => vis[key] !== false;
  return (
    <div className="pb-20 md:pb-0">
      <SEOHead
        title={language === "es"
          ? "Charlie's Barbershop · La Barbería #1 en Camuy, PR"
          : "Charlie's Barbershop · #1 Rated Barbershop in Camuy, PR"}
        description={language === "es"
          ? "Cortes, barba y experiencias premium en Camuy. Reserva tu cita en línea con Charlie, Pito o Joseph. Mar a Sáb, 9am a 5pm."
          : "Premium cuts, beard care and experiences in Camuy, PR. Book online with Charlie, Pito or Joseph. Tue to Sat, 9am to 5pm."}
        path="/"
        keywords={language === "es"
          ? ["barbería camuy", "barber camuy pr", "corte de pelo camuy", "barbería puerto rico", "charlie's barbershop", "reservar cita barbería"]
          : ["barbershop camuy pr", "haircut camuy", "puerto rico barbershop", "charlie's barbershop", "book barber online"]} />
      {show("hero")            && <HeroSection />}
      {show("reviews")         && <ReviewsSection />}
      {show("services")        && <ServicesSection />}
      {show("barber-profiles") && <TeamSection />}
      {show("install") && (
        <AnimatedSection>
          <section className="py-8">
            <InstallHomeScreenSection onCta={() => navigate("/citas/acceso")} />
          </section>
        </AnimatedSection>
      )}
      {show("blog") && <BlogPreviewSection />}

      <AnimatedSection>
        <div className="max-w-xl mx-auto px-5 py-8">
          <div className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Únete al Newsletter" : "Join the Newsletter"}
            </h2>
            <p className="text-xs mb-5" style={{ color: "var(--text-tertiary)" }}>
              {language === "es"
                ? "Recibe ofertas exclusivas y novedades directo a tu inbox."
                : "Get exclusive offers and news straight to your inbox."}
            </p>
            <NewsletterForm />
          </div>
        </div>
      </AnimatedSection>

      {show("faq")       && <FAQSection />}
      {show("contact")   && <ContactSection />}
      {show("instagram") && <InstagramSection />}
      {show("cta")       && <HomeCtaStrip />}
    </div>
  );
}
