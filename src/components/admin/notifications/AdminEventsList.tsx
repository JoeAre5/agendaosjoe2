// AdminEventsList — owner-only list of admin push event rules.
// Each row: icon + name + on/off toggle. Tap to open editor drawer.
import { useEffect, useState } from "react";
import { Bell, BellOff, Calendar, Inbox, DollarSign, Loader2, X, Send, Loader } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StandardToggle } from "@/components/ui/StandardToggle";
import { toggleFeedback } from "@/lib/feedback";
import { noTestDevicesMessage, prepareCurrentDeviceForPushTest, pushTestSetupMessage } from "@/lib/testNotifications";

export interface AdminRule {
  event_key: string;
  category: string;
  is_enabled: boolean;
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  url_path: string | null;
  description_es: string | null;
  description_en: string | null;
  updated_at: string;
}

const ICONS: Record<string, typeof Bell> = {
  appointments: Calendar,
  inbox: Inbox,
  payments: DollarSign,
  general: Bell,
};

export function AdminEventsList({ language }: { language: "es" | "en" }) {
  const [rules, setRules] = useState<AdminRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminRule | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_notification_rules")
      .select("*")
      .order("category")
      .order("event_key");
    if (error) {
      toast.error(language === "es" ? "Error al cargar reglas" : "Failed to load rules");
    } else {
      setRules((data ?? []) as AdminRule[]);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  async function quickToggle(r: AdminRule) {
    const next = !r.is_enabled;
    toggleFeedback(next);
    setRules((prev) => prev.map((x) => x.event_key === r.event_key ? { ...x, is_enabled: next } : x));
    const { data, error } = await supabase.functions.invoke("admin-notification-rule-update", {
      body: { event_key: r.event_key, expected_updated_at: r.updated_at, patch: { is_enabled: next } },
    });
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      setRules((prev) => prev.map((x) => x.event_key === r.event_key ? { ...x, is_enabled: r.is_enabled } : x));
      toast.error(errMsg);
      return;
    }
    const newUpdated = (data as { rule?: { updated_at?: string } })?.rule?.updated_at;
    if (newUpdated) {
      setRules((prev) => prev.map((x) => x.event_key === r.event_key ? { ...x, updated_at: newUpdated } : x));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  // Group by category
  const grouped = new Map<string, AdminRule[]>();
  for (const r of rules) {
    const a = grouped.get(r.category) ?? [];
    a.push(r);
    grouped.set(r.category, a);
  }

  const catLabel = (c: string) => {
    if (language === "es") {
      return c === "appointments" ? "Citas" : c === "inbox" ? "Bandeja" : c === "payments" ? "Pagos" : "General";
    }
    return c === "appointments" ? "Appointments" : c === "inbox" ? "Inbox" : c === "payments" ? "Payments" : "General";
  };

  return (
    <>
      {Array.from(grouped.entries()).map(([cat, items]) => {
        const Icon = ICONS[cat] ?? Bell;
        return (
          <section key={cat} className="mb-5">
            <h2
              className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {catLabel(cat)}
            </h2>
            <div className="rounded-xl overflow-hidden card-elevated">
              {items.map((r, i) => (
                <div key={r.event_key}>
                  {i > 0 && <div className="h-px mx-4" style={{ background: "var(--divider)" }} />}
                  <div className="flex items-stretch">
                    <button
                      onClick={() => setEditing(r)}
                      className="flex-1 text-left px-4 py-3.5 min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {r.is_enabled
                          ? <Icon size={14} style={{ color: "var(--accent-color)" }} />
                          : <BellOff size={14} style={{ color: "var(--text-tertiary)" }} />}
                        <span
                          className="text-sm font-bold truncate"
                          style={{ color: r.is_enabled ? "var(--text-primary)" : "var(--text-tertiary)" }}
                        >
                          {language === "es" ? r.title_es : r.title_en}
                        </span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? (r.description_es ?? r.body_es) : (r.description_en ?? r.body_en)}
                      </p>
                    </button>
                    <div className="px-4 flex items-center">
                      <StandardToggle
                        checked={r.is_enabled}
                        onChange={() => void quickToggle(r)}
                        ariaLabel={r.event_key}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {editing && (
        <AdminEventEditorDrawer
          rule={editing}
          language={language}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

// ----- Editor drawer (inline) -----
function AdminEventEditorDrawer({
  rule, language, onClose, onSaved,
}: { rule: AdminRule; language: "es" | "en"; onClose: () => void; onSaved: () => void }) {
  const [titleEs, setTitleEs] = useState(rule.title_es);
  const [titleEn, setTitleEn] = useState(rule.title_en);
  const [bodyEs, setBodyEs] = useState(rule.body_es);
  const [bodyEn, setBodyEn] = useState(rule.body_en);
  const [urlPath, setUrlPath] = useState(rule.url_path ?? "");
  const [isEnabled, setIsEnabled] = useState(rule.is_enabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    if (!titleEs.trim() || !titleEn.trim() || !bodyEs.trim() || !bodyEn.trim()) {
      toast.error(language === "es" ? "Todos los campos son requeridos" : "All fields are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-notification-rule-update", {
      body: {
        event_key: rule.event_key,
        expected_updated_at: rule.updated_at,
        patch: {
          is_enabled: isEnabled,
          title_es: titleEs.trim(),
          title_en: titleEn.trim(),
          body_es: bodyEs.trim(),
          body_en: bodyEn.trim(),
          url_path: urlPath.trim() || null,
        },
      },
    });
    setSaving(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) { toast.error(errMsg); return; }
    toast.success(language === "es" ? "Cambios guardados" : "Changes saved");
    onSaved();
  }

  async function handleTest() {
    setTesting(true);
    const prep = await prepareCurrentDeviceForPushTest(language);
    if (!prep.ok) toast.warning(pushTestSetupMessage(prep.reason, language), { duration: 5000 });
    // Build test vars from the body's {{x}} placeholders so preview substitutes nicely.
    const sampleVars: Record<string, string> = {
      client: "Juan Pérez", service: "Corte clásico", barber: "Charlie", date: "vie 14 nov, 3:30 pm",
      appointment_id: "demo", source: "Sitio público", kind_label: "reprogramada", verb: "movió",
      name: "Juan Pérez", preview: "Mensaje de prueba",
      sender: "cliente@example.com", subject: "Asunto de prueba", amount: "$25.00",
    };
    const { data, error } = await supabase.functions.invoke("admin-notification-test-send", {
      body: { event_key: rule.event_key, vars: sampleVars },
    });
    setTesting(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) { toast.error(errMsg); return; }
    const sent = (data as { sent?: number; devices?: number })?.sent ?? 0;
    const devices = (data as { devices?: number })?.devices ?? 0;
    if (sent === 0) {
      toast.warning(noTestDevicesMessage(language));
    } else {
      toast.success(language === "es" ? `Prueba enviada (${sent}/${devices} dispositivo(s))` : `Test sent (${sent}/${devices} device(s))`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog">
      <button aria-label="close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto"
        style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
      >
        <div
          className="app-page-header sticky top-0 z-10 flex items-center justify-between"
          style={{ background: "var(--bg-base)" }}
        >
          <div className="min-w-0 flex-1 pr-3">
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {rule.event_key}
            </div>
            <h1 className="app-page-title truncate">
              {language === "es" ? "Editar alerta admin" : "Edit admin alert"}
            </h1>
          </div>
          <button onClick={onClose} aria-label="close" className="p-1 -mr-1 active:opacity-60">
            <X size={22} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
            <div>
              <div className="text-sm font-bold">{language === "es" ? "Activada" : "Enabled"}</div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Si está pausada no recibirás esta alerta." : "If paused you won't receive this alert."}
              </div>
            </div>
            <StandardToggle checked={isEnabled} onChange={setIsEnabled} />
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {language === "es"
              ? "Variables disponibles: {{client}}, {{service}}, {{barber}}, {{date}}, {{appointment_id}}, {{source}}, {{name}}, {{preview}}, {{sender}}, {{subject}}, {{amount}}."
              : "Available vars: {{client}}, {{service}}, {{barber}}, {{date}}, {{appointment_id}}, {{source}}, {{name}}, {{preview}}, {{sender}}, {{subject}}, {{amount}}."}
          </p>

          {(["es", "en"] as const).map((lang) => (
            <div key={lang}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                {lang === "es" ? "Español" : "English"}
              </div>
              <input
                value={lang === "es" ? titleEs : titleEn}
                onChange={(e) => lang === "es" ? setTitleEs(e.target.value) : setTitleEn(e.target.value)}
                placeholder={lang === "es" ? "Título" : "Title"}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              />
              <textarea
                value={lang === "es" ? bodyEs : bodyEn}
                onChange={(e) => lang === "es" ? setBodyEs(e.target.value) : setBodyEn(e.target.value)}
                rows={3}
                placeholder={lang === "es" ? "Mensaje" : "Body"}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              />
            </div>
          ))}

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? "Ruta al tocar la notificación" : "URL when tapping the notification"}
            </label>
            <input
              value={urlPath}
              onChange={(e) => setUrlPath(e.target.value)}
              placeholder="/admin/appointment/{{appointment_id}}"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            />
          </div>

          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          >
            {testing ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            {language === "es" ? "Enviar prueba" : "Send test"}
          </button>
        </div>

        <div className="sticky bottom-0 px-4 py-3 border-t" style={{ background: "var(--bg-base)", borderColor: "var(--divider)" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {saving
              ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{language === "es" ? "Guardando…" : "Saving…"}</span>
              : (language === "es" ? "Guardar cambios" : "Save changes")}
          </button>
        </div>
      </div>
    </div>
  );
}
