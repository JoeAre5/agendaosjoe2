/**
 * Admin → Outreach → Templates landing.
 * Category cards (Confirmaciones / Recordatorios / Pagos / Promociones).
 * Each card shows count enabled vs total. Tap a card to open the category list.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, CreditCard, Gift, ArrowRight, Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";

const CATEGORIES = [
  { slug: "appointments", icon: CheckCircle2, label_es: "Confirmaciones", label_en: "Confirmations",
    desc_es: "Citas creadas, actualizadas o canceladas.", desc_en: "Appointment created, updated or canceled." },
  { slug: "reminders", icon: Clock, label_es: "Recordatorios", label_en: "Reminders",
    desc_es: "Avisos antes de la cita.", desc_en: "Notices before the appointment." },
  { slug: "payments", icon: CreditCard, label_es: "Pagos", label_en: "Payments",
    desc_es: "Recibos, balances y propinas.", desc_en: "Receipts, balances and tips." },
  { slug: "marketing", icon: Gift, label_es: "Promociones", label_en: "Promotions",
    desc_es: "Incentivos, ofertas y novedades para clientes.", desc_en: "Incentives, offers and updates for clients." },
] as const;

interface Counts { total: number; enabled: number; }

export default function OutreachTemplates() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, Counts>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("notification_templates")
        .select("category, is_enabled");
      if (cancelled) return;
      const map: Record<string, Counts> = {};
      for (const r of (data ?? []) as { category: string; is_enabled: boolean }[]) {
        const c = map[r.category] ?? { total: 0, enabled: 0 };
        c.total++;
        if (r.is_enabled) c.enabled++;
        map[r.category] = c;
      }
      setCounts(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Plantillas" : "Templates"}
        subtitle={es ? "Elige una categoría para editar mensajes." : "Pick a category to edit messages."}
        onBack={() => navigate("/admin/outreach")}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="px-4 pb-12 space-y-2.5">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const cnt = counts[c.slug] ?? { total: 0, enabled: 0 };
            return (
              <button
                key={c.slug}
                onClick={() => navigate(`/admin/outreach/templates/${c.slug}`)}
                className="w-full text-left rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform card-elevated"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "var(--bg-surface-2)" }}>
                  <Icon size={20} style={{ color: "var(--text-primary)" }} className="icon-bold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                    {es ? c.label_es : c.label_en}
                  </div>
                  <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                    {es ? c.desc_es : c.desc_en}
                  </div>
                </div>
                {cnt.total > 0 ? (
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 tabular-nums"
                    style={{
                      background: cnt.enabled === cnt.total ? "var(--accent-color)" : "var(--bg-surface-2)",
                      color: cnt.enabled === cnt.total ? "var(--cta-fg)" : "var(--text-secondary)",
                    }}
                  >
                    {cnt.enabled}/{cnt.total}
                  </span>
                ) : (
                  <ArrowRight size={16} style={{ color: "var(--text-tertiary)" }} className="icon-bold shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
