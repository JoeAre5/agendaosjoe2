/**
 * Admin → Outreach → Templates → Category list.
 * Lists templates inside one category. Tap a template card to open the editor.
 * Inline toggle to quickly enable/pause.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bell, BellOff, Clock, Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import type { NotificationTemplate } from "@/pages/AdminNotifications";
import { StandardToggle } from "@/components/ui/StandardToggle";

const CATEGORY_LABEL: Record<string, { es: string; en: string }> = {
  appointments: { es: "Confirmaciones", en: "Confirmations" },
  reminders: { es: "Recordatorios", en: "Reminders" },
  payments: { es: "Pagos", en: "Payments" },
  marketing: { es: "Promociones", en: "Promotions" },
};

function formatOffset(minutes: number | null, lang: "es" | "en"): string | null {
  if (minutes == null) return null;
  const abs = Math.abs(minutes);
  const before = minutes < 0;
  if (abs === 0) return lang === "es" ? "Al momento" : "Immediately";
  if (abs % 1440 === 0) {
    const days = abs / 1440;
    return lang === "es" ? `${days} día${days > 1 ? "s" : ""} ${before ? "antes" : "después"}`
                         : `${days} day${days > 1 ? "s" : ""} ${before ? "before" : "after"}`;
  }
  if (abs % 60 === 0) {
    const hours = abs / 60;
    return lang === "es" ? `${hours} h ${before ? "antes" : "después"}` : `${hours} h ${before ? "before" : "after"}`;
  }
  return lang === "es" ? `${abs} min ${before ? "antes" : "después"}` : `${abs} min ${before ? "before" : "after"}`;
}

export default function OutreachTemplatesCategory() {
  const navigate = useNavigate();
  const { category = "appointments" } = useParams<{ category: string }>();
  const { language } = usePreferences();
  const es = language === "es";
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const label = useMemo(
    () => CATEGORY_LABEL[category]?.[language] ?? category,
    [category, language],
  );

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notification_templates")
      .select("id,name,category,title_es,title_en,body_es,body_en,is_enabled,offset_minutes,url_path,updated_at")
      .eq("category", category)
      .order("name");
    if (error) {
      toast.error(es ? "Error al cargar plantillas" : "Failed to load templates");
      setLoading(false); return;
    }
    setTemplates((data as NotificationTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [category]);

  async function quickToggle(t: NotificationTemplate) {
    const next = !t.is_enabled;
    setTemplates((prev) => prev.map((row) => (row.id === t.id ? { ...row, is_enabled: next } : row)));
    const { data, error } = await supabase.functions.invoke("notification-template-update", {
      body: { id: t.id, expected_updated_at: t.updated_at, patch: { is_enabled: next } },
    });
    if (error || (data as { error?: string })?.error) {
      setTemplates((prev) => prev.map((row) => (row.id === t.id ? { ...row, is_enabled: t.is_enabled } : row)));
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Error");
      return;
    }
    const updatedAt = (data as { template?: { updated_at?: string } })?.template?.updated_at;
    if (updatedAt) {
      setTemplates((prev) => prev.map((row) => (row.id === t.id ? { ...row, updated_at: updatedAt } : row)));
    }
  }

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={label}
        subtitle={es ? "Toca un mensaje para editarlo." : "Tap a message to edit it."}
        onBack={() => navigate("/admin/outreach/templates")}
      />

      <div className="px-4 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-sm card-elevated"
            style={{ color: "var(--text-tertiary)" }}>
            {es ? "Sin plantillas en esta categoría." : "No templates in this category."}
          </div>
        ) : (
          <div className="space-y-2.5">
            {templates.map((t) => {
              const offset = formatOffset(t.offset_minutes, language);
              return (
                <div key={t.id} className="rounded-2xl p-4 card-elevated">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => navigate(`/admin/outreach/templates/edit/${t.id}`)}
                      className="flex-1 text-left min-w-0 active:opacity-70"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {t.is_enabled
                          ? <Bell size={14} style={{ color: "var(--accent-color)" }} className="icon-bold" />
                          : <BellOff size={14} style={{ color: "var(--text-tertiary)" }} className="icon-bold" />}
                        <span className="text-sm font-bold truncate"
                          style={{ color: t.is_enabled ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                          {es ? t.title_es : t.title_en}
                        </span>
                      </div>
                      <p className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}>
                        {es ? t.body_es : t.body_en}
                      </p>
                      {offset && (
                        <div className="flex items-center gap-1 mt-2 text-[10px]"
                          style={{ color: "var(--text-tertiary)" }}>
                          <Clock size={10} className="icon-bold" /><span>{offset}</span>
                        </div>
                      )}
                    </button>
                    <div className="mt-0.5">
                      <StandardToggle
                        checked={t.is_enabled}
                        onChange={() => void quickToggle(t)}
                        ariaLabel={t.is_enabled ? "pause" : "enable"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
