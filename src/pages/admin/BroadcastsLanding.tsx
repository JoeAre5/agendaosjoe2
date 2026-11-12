/**
 * Admin → Broadcasts landing page (mirrors the Headlines/Beehiiv pattern).
 *
 * Cards:
 *   1. Compose new broadcast → /admin/broadcasts/compose
 *   2. Manage broadcasts     → /admin/broadcasts/manage
 *   3. Outreach (templates)  → /admin/outreach
 *
 * Plus a hero CTA to generate a draft from a recent FilhoChat conversation.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Megaphone, BarChart3, FileText, ArrowRight, Smartphone } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import { BroadcastFromChatPicker } from "@/components/notifications/BroadcastFromChatPicker";

export default function BroadcastsLanding() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [counts, setCounts] = useState({ drafts: 0, sent: 0, subscribers: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: drafts }, { count: sent }, subsRes] = await Promise.all([
        supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.rpc("get_push_subscribers" as any),
      ]);
      const subRows = (subsRes.data ?? []) as Array<{ client_id: string }>;
      const uniqueClients = new Set(subRows.map((r) => r.client_id)).size;
      if (!cancelled) setCounts({ drafts: drafts ?? 0, sent: sent ?? 0, subscribers: uniqueClients });
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
      title: es ? "Componer broadcast" : "Compose broadcast",
      subtitle: es
        ? "Editor con vista previa en vivo, imagen y CTA."
        : "Live preview editor with image and CTA.",
      onClick: () => navigate("/admin/broadcasts/compose"),
    },
    {
      icon: FileText,
      title: es ? "Borradores" : "Drafts",
      subtitle: es
        ? "Continúa donde lo dejaste antes de enviar."
        : "Pick up unfinished broadcasts before sending.",
      onClick: () => navigate("/admin/broadcasts/manage?filter=draft"),
      badge: counts.drafts > 0 ? `${counts.drafts}` : undefined,
    },
    {
      icon: Megaphone,
      title: es ? "Enviados" : "Sent",
      subtitle: es
        ? "Historial de broadcasts publicados y assets."
        : "Sent history and asset reuse.",
      onClick: () => navigate("/admin/broadcasts/manage?filter=sent"),
      badge: counts.sent > 0 ? `${counts.sent}` : undefined,
    },
    {
      icon: BarChart3,
      title: es ? "Analítica" : "Analytics",
      subtitle: es
        ? "Entrega, apertura y errores por broadcast."
        : "Delivery, open rate and errors per broadcast.",
      onClick: () => navigate("/admin/broadcasts/analytics"),
      badge: counts.sent > 0 ? `${counts.sent} ${es ? "enviados" : "sent"}` : undefined,
    },
    {
      icon: Smartphone,
      title: es ? "Suscriptores Push" : "Push Subscribers",
      subtitle: es
        ? "Clientes con la PWA instalada y notificaciones activas."
        : "Clients with the PWA installed and notifications enabled.",
      onClick: () => navigate("/admin/broadcasts/subscribers"),
      badge: counts.subscribers > 0 ? `${counts.subscribers}` : undefined,
    },
  ];

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Broadcast" : "Broadcast"}
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
            onClick={() => setPickerOpen(true)}
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
              ? "Convierte una conversación con Filho en borrador"
              : "Turn a Filho conversation into a draft"}
          </p>
        </div>
      </div>

      {pickerOpen && (
        <BroadcastFromChatPicker
          es={es}
          onClose={() => setPickerOpen(false)}
          onDraftCreated={(id) => {
            setPickerOpen(false);
            navigate(`/admin/broadcasts/compose?id=${id}`);
          }}
        />
      )}
    </div>
  );
}
