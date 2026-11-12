// Side drawer for editing a single notification template.
// - Bilingual title/body (ES + EN)
// - Enable toggle, offset (for reminders), URL path
// - Save with optimistic concurrency (expected_updated_at)
// - Test send (delivers to the current owner's push subscriptions, ignores is_enabled)
// - History list with revert
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type { NotificationTemplate } from "@/pages/AdminNotifications";
import { noTestDevicesMessage, prepareCurrentDeviceForPushTest, pushTestSetupMessage } from "@/lib/testNotifications";

interface HistoryRow {
  id: string;
  change_kind: string;
  changed_at: string;
  title_es_old: string | null;
  title_es_new: string | null;
  body_es_old: string | null;
  body_es_new: string | null;
}

interface Props {
  template: NotificationTemplate;
  onClose: () => void;
  onSaved: () => void;
}

export function TemplateEditorDrawer({ template, onClose, onSaved }: Props) {
  const { language } = useTranslation();
  const isReminder = template.category === "reminders";

  const [titleEs, setTitleEs] = useState(template.title_es);
  const [titleEn, setTitleEn] = useState(template.title_en);
  const [bodyEs, setBodyEs] = useState(template.body_es);
  const [bodyEn, setBodyEn] = useState(template.body_en);
  const [isEnabled, setIsEnabled] = useState(template.is_enabled);
  const [offsetMinutes, setOffsetMinutes] = useState<number | null>(template.offset_minutes);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  async function loadHistory() {
    const { data, error } = await supabase
      .from("notification_template_history")
      .select(
        "id,change_kind,changed_at,title_es_old,title_es_new,body_es_old,body_es_new"
      )
      .eq("template_id", template.id)
      .order("changed_at", { ascending: false })
      .limit(10);
    if (!error && data) setHistory(data as HistoryRow[]);
  }

  useEffect(() => {
    if (showHistory) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory]);

  async function handleSave() {
    if (!titleEs.trim() || !titleEn.trim() || !bodyEs.trim() || !bodyEn.trim()) {
      toast.error(language === "es" ? "Todos los campos son requeridos" : "All fields are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("notification-template-update", {
      body: {
        id: template.id,
        expected_updated_at: template.updated_at,
        patch: {
          title_es: titleEs.trim(),
          title_en: titleEn.trim(),
          body_es: bodyEs.trim(),
          body_en: bodyEn.trim(),
          is_enabled: isEnabled,
          offset_minutes: isReminder ? offsetMinutes : undefined,
        },
      },
    });
    setSaving(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      if (errMsg === "stale_version") {
        toast.error(
          language === "es"
            ? "Esta plantilla cambió. Refresca y vuelve a intentar."
            : "This template changed. Refresh and try again."
        );
      } else {
        toast.error(errMsg);
      }
      return;
    }
    toast.success(language === "es" ? "Cambios guardados" : "Changes saved");
    onSaved();
  }

  async function handleTestSend() {
    setTesting(true);
    const prep = await prepareCurrentDeviceForPushTest(language);
    if (!prep.ok) toast.warning(pushTestSetupMessage(prep.reason, language), { duration: 5000 });
    const { data, error } = await supabase.functions.invoke("notification-test-send", {
      body: {
        template_id: template.id,
        title_es: titleEs.trim(),
        title_en: titleEn.trim(),
        body_es: bodyEs.trim(),
        body_en: bodyEn.trim(),
      },
    });
    setTesting(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    const sent = (data as { sent?: number; devices?: number })?.sent ?? 0;
    const devices = (data as { devices?: number })?.devices ?? 0;
    if (sent === 0) {
      toast.warning(noTestDevicesMessage(language));
    } else {
      toast.success(
        language === "es"
          ? `Prueba enviada (${sent}/${devices} dispositivo(s))`
          : `Test sent (${sent}/${devices} device(s))`
      );
    }
  }

  async function handleRevert(historyId: string) {
    if (
      !confirm(
        language === "es"
          ? "¿Revertir a esta versión? Se aplicará como un cambio nuevo."
          : "Revert to this version? It will be applied as a new change."
      )
    ) {
      return;
    }
    const { data, error } = await supabase.functions.invoke("notification-template-revert", {
      body: { history_id: historyId },
    });
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    toast.success(language === "es" ? "Revertido" : "Reverted");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog">
      {/* Backdrop */}
      <button
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      {/* Panel */}
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
              {template.name}
            </div>
            <h1 className="app-page-title truncate">
              {language === "es" ? "Editar plantilla" : "Edit template"}
            </h1>
          </div>
          <button onClick={onClose} aria-label="close" className="p-1 -mr-1 active:opacity-60">
            <X size={22} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Enable toggle */}
          <label
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <div>
              <div className="text-sm font-bold">
                {language === "es" ? "Activada" : "Enabled"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {language === "es"
                  ? "Si está pausada no se envía esta notificación."
                  : "If paused this notification is not sent."}
              </div>
            </div>
            <button
              onClick={() => setIsEnabled((v) => !v)}
              aria-label="toggle"
              className="shrink-0"
            >
              <span
                className="relative inline-block w-10 h-6 rounded-full transition-colors"
                style={{
                  background: isEnabled ? "var(--accent-color)" : "var(--divider)",
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: isEnabled ? "20px" : "2px" }}
                />
              </span>
            </button>
          </label>

          {isReminder && (
            <div>
              <label
                className="text-xs font-medium mb-1 block"
                style={{ color: "var(--text-secondary)" }}
              >
                {language === "es"
                  ? "Cuándo enviar (minutos antes de la cita)"
                  : "When to send (minutes before appointment)"}
              </label>
              <input
                type="number"
                value={offsetMinutes ?? ""}
                onChange={(e) =>
                  setOffsetMinutes(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                placeholder="-120"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--bg-surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--divider)",
                }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                {language === "es"
                  ? "Negativo = antes. Ej: -1440 = 1 día antes, -120 = 2 horas antes."
                  : "Negative = before. Ex: -1440 = 1 day before, -120 = 2 hours before."}
              </p>
            </div>
          )}

          {/* Spanish */}
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Español
            </div>
            <input
              value={titleEs}
              onChange={(e) => setTitleEs(e.target.value)}
              placeholder={language === "es" ? "Título" : "Title"}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--divider)",
              }}
            />
            <textarea
              value={bodyEs}
              onChange={(e) => setBodyEs(e.target.value)}
              rows={3}
              placeholder={language === "es" ? "Mensaje" : "Body"}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--divider)",
              }}
            />
          </div>

          {/* English */}
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              English
            </div>
            <input
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Title"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--divider)",
              }}
            />
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={3}
              placeholder="Body"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--divider)",
              }}
            />
          </div>

          {/* Test send */}
          <button
            onClick={handleTestSend}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--bg-surface-2)",
              color: "var(--text-primary)",
              border: "1px solid var(--divider)",
            }}
          >
            {testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {language === "es" ? "Enviar prueba" : "Send test"}
          </button>

          {/* History */}
          <div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-medium underline"
              style={{ color: "var(--text-secondary)" }}
            >
              {showHistory
                ? language === "es" ? "Ocultar historial" : "Hide history"
                : language === "es" ? "Ver historial" : "View history"}
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {history.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Sin cambios previos." : "No prior changes."}
                  </p>
                )}
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg px-3 py-2 flex items-center justify-between"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[10px] font-bold uppercase"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {h.change_kind} · {new Date(h.changed_at).toLocaleString()}
                      </div>
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {h.title_es_old ?? h.body_es_old ?? "—"}
                      </div>
                    </div>
                    {h.change_kind !== "revert" && (
                      <button
                        onClick={() => handleRevert(h.id)}
                        className="ml-2 flex items-center gap-1 text-[11px] font-medium"
                        style={{ color: "var(--accent-color)" }}
                      >
                        <RotateCcw size={11} />
                        {language === "es" ? "Revertir" : "Revert"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer save */}
        <div
          className="sticky bottom-0 px-4 py-3 border-t"
          style={{ background: "var(--bg-base)", borderColor: "var(--divider)" }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {language === "es" ? "Guardando…" : "Saving…"}
              </span>
            ) : language === "es" ? "Guardar cambios" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
