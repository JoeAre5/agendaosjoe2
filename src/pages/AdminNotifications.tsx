// Admin: Notifications template management.
// Owner-only. Lists notification_templates grouped by category, opens an editor
// drawer for each template (bilingual title/body, enable toggle, offset, test send).
// Updates flow through the notification-template-update edge function with
// optimistic concurrency (expected_updated_at) so concurrent edits surface a
// stale_version error rather than silently overwriting another owner's change.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, BellOff, Clock, History, Loader2, Megaphone, ShieldAlert } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { TemplateEditorDrawer } from "@/components/notifications/TemplateEditorDrawer";
import { BroadcastComposer } from "@/components/notifications/BroadcastComposer";
import { BroadcastHistory } from "@/components/notifications/BroadcastHistory";
import { selectFeedback, toggleFeedback } from "@/lib/feedback";
import { AdminDevicePushCard } from "@/components/admin/AdminDevicePushCard";
import { AdminEventsList } from "@/components/admin/notifications/AdminEventsList";
import { AdminDeliveryPrefs } from "@/components/admin/notifications/AdminDeliveryPrefs";

export interface NotificationTemplate {
  id: string;
  name: string;
  category: string;
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  is_enabled: boolean;
  offset_minutes: number | null;
  url_path: string | null;
  updated_at: string;
}

const CATEGORY_LABELS: Record<string, { es: string; en: string }> = {
  appointments: { es: "Citas", en: "Appointments" },
  reminders: { es: "Recordatorios", en: "Reminders" },
  payments: { es: "Pagos", en: "Payments" },
  marketing: { es: "Marketing", en: "Marketing" },
};

function categoryLabel(cat: string, lang: "es" | "en") {
  return CATEGORY_LABELS[cat]?.[lang] ?? cat;
}

function formatOffset(minutes: number | null, lang: "es" | "en"): string | null {
  if (minutes == null) return null;
  const abs = Math.abs(minutes);
  const before = minutes < 0;
  if (abs % 1440 === 0) {
    const days = abs / 1440;
    return lang === "es"
      ? `${days} día${days > 1 ? "s" : ""} ${before ? "antes" : "después"}`
      : `${days} day${days > 1 ? "s" : ""} ${before ? "before" : "after"}`;
  }
  if (abs % 60 === 0) {
    const hours = abs / 60;
    return lang === "es"
      ? `${hours} h ${before ? "antes" : "después"}`
      : `${hours} h ${before ? "before" : "after"}`;
  }
  return lang === "es"
    ? `${abs} min ${before ? "antes" : "después"}`
    : `${abs} min ${before ? "before" : "after"}`;
}

export default function AdminNotifications() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  // Persist active tab in URL (?ntab=templates|broadcast) so refresh, back nav,
  // and Safari app-switch restore the same view. Matches the calendar pattern.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("ntab");
  const activeTab: "templates" | "broadcast" | "admin" =
    urlTab === "broadcast" ? "broadcast" : urlTab === "admin" ? "admin" : "templates";
  const setActiveTab = useCallback(
    (tab: "templates" | "broadcast" | "admin") => {
      const next = new URLSearchParams(searchParams);
      next.set("ntab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const [historyKey, setHistoryKey] = useState(0);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notification_templates")
      .select(
        "id,name,category,title_es,title_en,body_es,body_en,is_enabled,offset_minutes,url_path,updated_at"
      )
      .order("category")
      .order("name");
    if (error) {
      toast.error(language === "es" ? "Error al cargar plantillas" : "Failed to load templates");
      setLoading(false);
      return;
    }
    setTemplates((data as NotificationTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, NotificationTemplate[]>();
    for (const t of templates) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries());
  }, [templates]);

  // Quick toggle is_enabled inline without opening the drawer.
  // Optimistic toggle — flip the switch instantly in local state and fire the
  // request in the background. Only revert + reload if the server rejects.
  // Avoids the full-screen spinner that appears when calling load().
  async function quickToggle(t: NotificationTemplate) {
    const next = !t.is_enabled;
    toggleFeedback(next);
    setTemplates((prev) =>
      prev.map((row) => (row.id === t.id ? { ...row, is_enabled: next } : row))
    );
    const { data, error } = await supabase.functions.invoke("notification-template-update", {
      body: {
        id: t.id,
        expected_updated_at: t.updated_at,
        patch: { is_enabled: next },
      },
    });
    if (error || (data as { error?: string })?.error) {
      // Revert local state
      setTemplates((prev) =>
        prev.map((row) => (row.id === t.id ? { ...row, is_enabled: t.is_enabled } : row))
      );
      const msg = (data as { error?: string })?.error ?? error?.message ?? "Error";
      if (msg === "stale_version") {
        toast.error(
          language === "es"
            ? "Otra persona editó esta plantilla. Recargando…"
            : "Another user edited this template. Reloading…"
        );
        void load();
      } else {
        toast.error(msg);
      }
      return;
    }
    // Quietly refresh updated_at in the background (no spinner) so the next
    // toggle uses a fresh optimistic-concurrency token.
    const updatedAt = (data as { template?: { updated_at?: string } })?.template?.updated_at;
    if (updatedAt) {
      setTemplates((prev) =>
        prev.map((row) => (row.id === t.id ? { ...row, updated_at: updatedAt } : row))
      );
    }
  }

  return (
    <div
      className="relative mx-auto w-full min-h-screen"
      style={{
        maxWidth: 430,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <SubpageHeader
        sticky
        title={language === "es" ? "Notificaciones" : "Notifications"}
        subtitle={language === "es"
          ? "Edita el contenido y los disparadores de cada notificación."
          : "Edit the content and triggers for each notification."}
        onBack={() => navigate("/admin?tab=menu")}
      />

      {/* Device push toggle for admin/owner */}
      <div className="pt-3">
        <AdminDevicePushCard language={language as "es" | "en"} />
      </div>

      {/* Tabs */}
      <div className="px-4 pt-1 pb-3 flex gap-2">
        {([
          { id: "templates", icon: Bell, es: "Plantillas", en: "Templates" },
          { id: "admin", icon: ShieldAlert, es: "Mis alertas", en: "My alerts" },
          { id: "broadcast", icon: Megaphone, es: "Difusión", en: "Broadcast" },
        ] as const).map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { selectFeedback(); setActiveTab(tab.id); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-colors"
              style={{
                background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                color: active ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              <Icon size={13} />
              {language === "es" ? tab.es : tab.en}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-12">
        {activeTab === "admin" ? (
          <div className="space-y-2">
            <AdminDeliveryPrefs language={language as "es" | "en"} />
            <AdminEventsList language={language as "es" | "en"} />
          </div>
        ) : activeTab === "broadcast" ? (
          <div className="space-y-6">
            <BroadcastComposer onSent={() => setHistoryKey((k) => k + 1)} />
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1"
                style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "Historial reciente" : "Recent history"}
              </h3>
              <BroadcastHistory refreshKey={historyKey} />
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
          </div>
        ) : (
          <>
            {grouped.map(([category, items]) => (
              <section key={category} className="mb-5">
                <h2
                  className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {categoryLabel(category, language)}
                </h2>
                <div className="rounded-xl overflow-hidden card-elevated">
                  {items.map((t, i) => {
                    const offset = formatOffset(t.offset_minutes, language);
                    return (
                      <div key={t.id}>
                        {i > 0 && (
                          <div className="h-px mx-4" style={{ background: "var(--divider)" }} />
                        )}
                        <div className="flex items-stretch">
                          <button
                            onClick={() => setEditing(t)}
                            className="flex-1 text-left px-4 py-3.5 min-w-0"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {t.is_enabled ? (
                                <Bell size={14} style={{ color: "var(--accent-color)" }} />
                              ) : (
                                <BellOff size={14} style={{ color: "var(--text-tertiary)" }} />
                              )}
                              <span
                                className="text-sm font-bold truncate"
                                style={{
                                  color: t.is_enabled ? "var(--text-primary)" : "var(--text-tertiary)",
                                }}
                              >
                                {language === "es" ? t.title_es : t.title_en}
                              </span>
                            </div>
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {language === "es" ? t.body_es : t.body_en}
                            </p>
                            {offset && (
                              <div
                                className="flex items-center gap-1 mt-1 text-[10px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                <Clock size={10} />
                                <span>{offset}</span>
                              </div>
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void quickToggle(t);
                            }}
                            className="px-4 flex items-center"
                            aria-label={t.is_enabled ? "pause" : "enable"}
                          >
                            <span
                              className="relative inline-block w-9 h-5 rounded-full transition-colors"
                              style={{
                                background: t.is_enabled
                                  ? "var(--accent-color)"
                                  : "var(--bg-surface-2)",
                              }}
                            >
                              <span
                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                                style={{ left: t.is_enabled ? "18px" : "2px" }}
                              />
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            <div
              className="rounded-xl p-4 mt-4 flex items-start gap-3"
              style={{ background: "var(--bg-surface-2)" }}
            >
              <History size={16} style={{ color: "var(--text-tertiary)" }} className="mt-0.5" />
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {language === "es"
                  ? "Cada cambio se guarda en el historial. Puedes revertir desde el editor."
                  : "Every change is saved in history. You can revert from the editor."}
              </div>
            </div>
          </>
        )}
      </div>

      {editing && (
        <TemplateEditorDrawer
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
