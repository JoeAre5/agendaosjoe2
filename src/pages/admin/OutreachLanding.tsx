/**
 * Admin → Outreach landing (mirrors BroadcastsLanding pattern).
 * Outreach = transactional email + SMS. Broadcast = push notifications.
 *
 * Cards:
 *   1. Compose outreach   → /admin/outreach/compose (coming soon)
 *   2. Manage templates   → /admin/outreach/templates
 *   3. Analytics          → /admin/outreach/analytics
 *
 * Plus a hero CTA to draft an outreach from a recent FilhoChat conversation.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Mail, BarChart3, ArrowRight } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";

export default function OutreachLanding() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [counts, setCounts] = useState({ templates: 0, sent7d: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [{ count: templates }, { count: sent7d }] = await Promise.all([
        supabase.from("notification_templates").select("id", { count: "exact", head: true }),
        supabase
          .from("email_send_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("status", "sent"),
      ]);
      if (!cancelled) setCounts({ templates: templates ?? 0, sent7d: sent7d ?? 0 });
    })();
    return () => { cancelled = true; };
  }, []);

  const cards: Array<{
    icon: typeof Pencil;
    title: string;
    subtitle: string;
    onClick: () => void;
    badge?: string;
  }> = [
    {
      icon: Pencil,
      title: es ? "Componer outreach" : "Compose outreach",
      subtitle: es
        ? "Email o SMS one-off a un segmento."
        : "Send a one-off email or SMS to a segment.",
      onClick: () =>
        toast.info(es ? "Próximamente" : "Coming soon", {
          description: es
            ? "El compositor de email/SMS llega en la próxima fase."
            : "The email/SMS composer ships in the next phase.",
        }),
    },
    {
      icon: Mail,
      title: es ? "Plantillas" : "Templates",
      subtitle: es
        ? "Mensajes transaccionales (citas, recordatorios, pagos)."
        : "Transactional messages (appointments, reminders, payments).",
      onClick: () => navigate("/admin/outreach/templates"),
      badge: counts.templates > 0 ? `${counts.templates}` : undefined,
    },
    {
      icon: BarChart3,
      title: es ? "Analítica" : "Analytics",
      subtitle: es
        ? "Envíos, entregas, errores y tendencias."
        : "Sends, deliveries, errors and trends.",
      onClick: () => navigate("/admin/outreach/analytics"),
      badge: counts.sent7d > 0 ? `${counts.sent7d} ${es ? "7d" : "7d"}` : undefined,
    },
  ];

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title="Outreach"
        subtitle={es ? "¿A dónde quieres ir hoy?" : "Where do you want to go today?"}
        onBack={() => navigate("/admin?tab=menu")}
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
              {c.badge ? (
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
                >
                  {c.badge}
                </span>
              ) : (
                <ArrowRight size={16} style={{ color: "var(--text-tertiary)" }} className="icon-bold shrink-0" />
              )}
            </button>
          );
        })}

        <div className="pt-6 flex flex-col items-center gap-2.5">
          <button
            onClick={() =>
              toast.info(es ? "Próximamente" : "Coming soon", {
                description: es
                  ? "Generar outreach con Filho llega junto al compositor."
                  : "Generating outreach with Filho ships with the composer.",
              })
            }
            className="filo-cta group inline-flex items-center gap-2.5 px-5 h-12 rounded-full active:scale-[0.98] transition-transform"
            aria-label={es ? "Generar con Filho" : "Generate with Filho"}
          >
            <AnimatedOrbNavIcon size={22} />
            <span className="text-[13px] font-semibold tracking-tight">
              {es ? "Generar con Filho" : "Generate with Filho"}
            </span>
          </button>
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {es
              ? "Convierte una conversación con Filho en email o SMS"
              : "Turn a Filho conversation into email or SMS"}
          </p>
        </div>
      </div>
    </div>
  );
}
