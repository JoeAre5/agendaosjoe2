/**
 * Admin → Headlines landing page (Beehiiv-style welcome).
 *
 * Three primary actions:
 *   1. Set up admin panel  → /admin/titulares/perfil
 *   2. Start writing       → /admin/titulares/nuevo (skips wizard)
 *   3. Manage posts        → /admin/titulares/posts (list view)
 *
 * Plus a smaller secondary row: AI wizard, Subscribers.
 */
import { useNavigate } from "react-router-dom";
import { ListChecks, Pencil, FileText, Users, ArrowRight, CheckCircle2, BarChart3 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { usePreferences } from "@/hooks/usePreferences";
import { usePublicationSettings } from "@/hooks/usePublicationSettings";
import { useState } from "react";
import { AiStudioModal } from "@/components/admin/blog/AiStudioModal";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function TitularesLanding() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const { data: settings } = usePublicationSettings();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [categories, setCategories] = useState<{ slug: string; label_es: string; label_en: string }[]>([]);

  useEffect(() => {
    supabase.from("blog_categories").select("slug, label_es, label_en").eq("is_active", true).order("sort_order")
      .then(({ data }) => { if (data) setCategories(data as any); });
  }, []);

  const profileComplete = !!(settings?.author_avatar_url && settings?.author_bio_es);

  const cards: Array<{
    icon: typeof Pencil;
    title: string;
    subtitle: string;
    onClick: () => void;
    done?: boolean;
  }> = [
    {
      icon: ListChecks,
      title: es ? "Configura tu panel" : "Set up admin panel",
      subtitle: es
        ? "Foto, bio, rol, redes sociales y opciones de compartir."
        : "Avatar, bio, role, social links and share options.",
      onClick: () => navigate("/admin/titulares/perfil"),
      done: profileComplete,
    },
    {
      icon: Pencil,
      title: es ? "Empezar a escribir" : "Start writing",
      subtitle: es ? "Abre el editor en blanco." : "Opens the empty editor.",
      onClick: () => navigate("/admin/titulares/nuevo"),
    },
    {
      icon: FileText,
      title: es ? "Gestionar artículos" : "Manage posts",
      subtitle: es ? "Lista, filtros, borradores y publicados." : "List, filters, drafts and published.",
      onClick: () => navigate("/admin/titulares/posts"),
    },
    {
      icon: BarChart3,
      title: es ? "Analíticas" : "Analytics",
      subtitle: es
        ? "Vistas, fuentes, embudo, top posts y crecimiento de suscriptores."
        : "Views, sources, funnel, top posts and subscriber growth.",
      onClick: () => navigate("/admin/titulares/analytics"),
    },
  ];

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Titulares" : "Headlines"}
        subtitle={es ? "¿A dónde quieres ir hoy?" : "Where do you want to go today?"}
        onBack={() => navigate("/admin?tab=menu")}
        actions={
          <button
            onClick={() => navigate("/admin/titulares/suscriptores")}
            aria-label={es ? "Suscriptores" : "Subscribers"}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            style={{
              background: "var(--bg-surface-2)",
              border: "1px solid var(--divider)",
              color: "var(--text-primary)",
            }}
          >
            <Users size={16} className="icon-bold" />
          </button>
        }
      />

      <div className="px-4 pb-8 space-y-2.5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.title}
              onClick={c.onClick}
              className="w-full text-left rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform card-elevated"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--bg-surface-2)" }}
              >
                <Icon size={20} style={{ color: "var(--text-primary)" }} className="icon-bold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {c.title}
                </div>
                <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                  {c.subtitle}
                </div>
              </div>
              {c.done ? (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(34,197,94,0.15)" }}
                >
                  <CheckCircle2 size={16} style={{ color: "#22c55e" }} className="icon-bold" />
                </div>
              ) : (
                <ArrowRight size={16} style={{ color: "var(--text-tertiary)" }} className="icon-bold shrink-0" />
              )}
            </button>
          );
        })}

        {/* Hero CTA — Generate with Filho (ElevenLabs-inspired pill) */}
        <div className="pt-6 flex flex-col items-center gap-2.5">
          <button
            onClick={() => setWizardOpen(true)}
            className="filo-cta group inline-flex items-center gap-2.5 px-5 h-12 rounded-full active:scale-[0.98] transition-transform"
            aria-label={es ? "Generar con Filho" : "Generate with Filho"}
          >
            <AnimatedOrbNavIcon size={22} />
            <span className="text-[13px] font-semibold tracking-tight">
              {es ? "Generar con Filho" : "Generate with Filho"}
            </span>
          </button>
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Tu estratega de contenido con IA" : "Your AI content strategist"}
          </p>
        </div>
      </div>

      <AiStudioModal open={wizardOpen} onClose={() => setWizardOpen(false)} categories={categories} es={es} />
    </div>
  );
}
