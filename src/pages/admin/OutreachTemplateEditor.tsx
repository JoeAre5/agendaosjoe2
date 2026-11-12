/**
 * Admin → Outreach → Template editor (full page).
 * Replaces the old side drawer. Cleaner layout: enable card, time chips for
 * reminders, ES + EN inputs grouped, test send and history at the bottom.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import type { NotificationTemplate } from "@/pages/AdminNotifications";
import { StandardToggle } from "@/components/ui/StandardToggle";
import { noTestDevicesMessage, prepareCurrentDeviceForPushTest, pushTestSetupMessage } from "@/lib/testNotifications";

interface HistoryRow {
  id: string;
  change_kind: string;
  changed_at: string;
  title_es_old: string | null;
  body_es_old: string | null;
}

// Hour-based presets. Stored as negative minutes (before appointment).
const TIME_PRESETS_HOURS = [1, 2, 4, 8, 24, 48, 72];

export default function OutreachTemplateEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { language } = usePreferences();
  const es = language === "es";

  const [template, setTemplate] = useState<NotificationTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [titleEs, setTitleEs] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyEs, setBodyEs] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [offsetMinutes, setOffsetMinutes] = useState<number | null>(null);
  const [customHours, setCustomHours] = useState<string>("");

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const isReminder = template?.category === "reminders";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("notification_templates")
        .select("id,name,category,title_es,title_en,body_es,body_en,is_enabled,offset_minutes,url_path,updated_at")
        .eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error(es ? "No se pudo cargar la plantilla" : "Failed to load template");
        navigate(-1); return;
      }
      const t = data as NotificationTemplate;
      setTemplate(t);
      setTitleEs(t.title_es); setTitleEn(t.title_en);
      setBodyEs(t.body_es); setBodyEn(t.body_en);
      setIsEnabled(t.is_enabled);
      setOffsetMinutes(t.offset_minutes);
      if (t.offset_minutes != null) {
        const abs = Math.abs(t.offset_minutes);
        const hours = abs / 60;
        if (!TIME_PRESETS_HOURS.includes(hours)) setCustomHours(String(hours));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, es, navigate]);

  const selectedHours = useMemo(() => {
    if (offsetMinutes == null) return null;
    return Math.abs(offsetMinutes) / 60;
  }, [offsetMinutes]);

  function pickHours(h: number) {
    setOffsetMinutes(-h * 60);
    setCustomHours("");
  }

  async function loadHistory() {
    if (!template) return;
    const { data } = await supabase
      .from("notification_template_history")
      .select("id,change_kind,changed_at,title_es_old,body_es_old")
      .eq("template_id", template.id)
      .order("changed_at", { ascending: false }).limit(10);
    setHistory((data as HistoryRow[]) ?? []);
  }

  useEffect(() => { if (showHistory) void loadHistory(); /* eslint-disable-next-line */ }, [showHistory]);

  async function handleSave() {
    if (!template) return;
    if (!titleEs.trim() || !titleEn.trim() || !bodyEs.trim() || !bodyEn.trim()) {
      toast.error(es ? "Todos los campos son requeridos" : "All fields are required");
      return;
    }
    setSaving(true);
    const finalOffset = isReminder
      ? (customHours ? -Math.round(parseFloat(customHours) * 60) : offsetMinutes)
      : undefined;
    const { data, error } = await supabase.functions.invoke("notification-template-update", {
      body: {
        id: template.id,
        expected_updated_at: template.updated_at,
        patch: {
          title_es: titleEs.trim(), title_en: titleEn.trim(),
          body_es: bodyEs.trim(), body_en: bodyEn.trim(),
          is_enabled: isEnabled,
          offset_minutes: finalOffset,
        },
      },
    });
    setSaving(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      toast.error(errMsg === "stale_version"
        ? (es ? "Esta plantilla cambió. Refresca y reintenta." : "Template changed. Refresh and retry.")
        : errMsg);
      return;
    }
    toast.success(es ? "Cambios guardados" : "Changes saved");
    const updatedAt = (data as { template?: { updated_at?: string } })?.template?.updated_at;
    if (updatedAt) setTemplate({ ...template, updated_at: updatedAt });
  }

  async function handleTestSend() {
    if (!template) return;
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
    if (errMsg) { toast.error(errMsg); return; }
    const sent = (data as { sent?: number; devices?: number })?.sent ?? 0;
    const devices = (data as { devices?: number })?.devices ?? 0;
    if (sent === 0) {
      toast.warning(noTestDevicesMessage(language));
    } else {
      toast.success(es ? `Prueba enviada (${sent}/${devices} dispositivo(s))` : `Test sent (${sent}/${devices} device(s))`);
    }
  }

  async function handleRevert(historyId: string) {
    if (!confirm(es ? "¿Revertir a esta versión?" : "Revert to this version?")) return;
    const { data, error } = await supabase.functions.invoke("notification-template-revert", {
      body: { history_id: historyId },
    });
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) { toast.error(errMsg); return; }
    toast.success(es ? "Revertido" : "Reverted");
    // Reload
    if (template) {
      const { data: fresh } = await supabase
        .from("notification_templates")
        .select("id,name,category,title_es,title_en,body_es,body_en,is_enabled,offset_minutes,url_path,updated_at")
        .eq("id", template.id).maybeSingle();
      if (fresh) {
        const t = fresh as NotificationTemplate;
        setTemplate(t);
        setTitleEs(t.title_es); setTitleEn(t.title_en);
        setBodyEs(t.body_es); setBodyEn(t.body_en);
        setOffsetMinutes(t.offset_minutes);
      }
    }
    void loadHistory();
  }

  if (loading || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen mx-auto w-full pb-28" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Editar plantilla" : "Edit template"}
        subtitle={template.name}
        onBack={() => navigate(`/admin/outreach/templates/${template.category}`)}
      />

      <div className="px-4 space-y-4">
        {/* Enable card */}
        <div className="rounded-2xl p-4 flex items-center justify-between card-elevated">
          <div className="min-w-0 pr-3">
            <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {es ? "Activada" : "Enabled"}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {es ? "Si está pausada no se envía esta notificación."
                  : "If paused this notification is not sent."}
            </div>
          </div>
          <StandardToggle checked={isEnabled} onChange={setIsEnabled} ariaLabel="enable" />
        </div>

        {/* Time chips (reminders) */}
        {isReminder && (
          <div className="rounded-2xl p-4 card-elevated">
            <div className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {es ? "¿Cuándo enviar?" : "When to send?"}
            </div>
            <div className="text-[11px] mb-3" style={{ color: "var(--text-secondary)" }}>
              {es ? "Tiempo antes de la cita." : "Time before the appointment."}
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_PRESETS_HOURS.map((h) => {
                const active = !customHours && selectedHours === h;
                return (
                  <button
                    key={h}
                    onClick={() => pickHours(h)}
                    className="px-3 h-9 rounded-full text-[12px] font-bold tabular-nums transition-colors"
                    style={{
                      background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                      color: active ? "var(--cta-fg)" : "var(--text-primary)",
                      border: active ? "none" : "1px solid var(--divider)",
                    }}
                  >
                    {h < 24
                      ? `${h} ${es ? "h" : "h"}`
                      : `${h / 24} ${es ? (h === 24 ? "día" : "días") : (h === 24 ? "day" : "days")}`}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number" min="0" step="0.5" inputMode="decimal"
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                placeholder={es ? "Personalizado" : "Custom"}
                className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--bg-surface-2)", color: "var(--text-primary)",
                  border: "1px solid var(--divider)",
                }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {es ? "horas" : "hours"}
              </span>
            </div>
          </div>
        )}

        {/* Spanish */}
        <div className="rounded-2xl p-4 card-elevated">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}>Español</div>
          <input
            value={titleEs} onChange={(e) => setTitleEs(e.target.value)}
            placeholder={es ? "Título" : "Title"}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          />
          <textarea
            value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} rows={3}
            placeholder={es ? "Mensaje" : "Body"}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          />
        </div>

        {/* English */}
        <div className="rounded-2xl p-4 card-elevated">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}>English</div>
          <input
            value={titleEn} onChange={(e) => setTitleEn(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          />
          <textarea
            value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={3}
            placeholder="Body"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          />
        </div>

        {/* Test send */}
        <button
          onClick={handleTestSend} disabled={testing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 card-elevated"
          style={{ color: "var(--text-primary)" }}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="icon-bold" />}
          {es ? "Enviar prueba" : "Send test"}
        </button>

        {/* History */}
        <div>
          <button onClick={() => setShowHistory((v) => !v)}
            className="text-xs font-medium underline" style={{ color: "var(--text-secondary)" }}>
            {showHistory ? (es ? "Ocultar historial" : "Hide history")
                         : (es ? "Ver historial" : "View history")}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.length === 0 && (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {es ? "Sin cambios previos." : "No prior changes."}
                </p>
              )}
              {history.map((h) => (
                <div key={h.id} className="rounded-lg px-3 py-2 flex items-center justify-between"
                  style={{ background: "var(--bg-surface-2)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase"
                      style={{ color: "var(--text-tertiary)" }}>
                      {h.change_kind} · {new Date(h.changed_at).toLocaleString()}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                      {h.title_es_old ?? h.body_es_old ?? "—"}
                    </div>
                  </div>
                  {h.change_kind !== "revert" && (
                    <button onClick={() => handleRevert(h.id)}
                      className="ml-2 flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: "var(--accent-color)" }}>
                      <RotateCcw size={11} />{es ? "Revertir" : "Revert"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky save */}
      <div className="fixed bottom-0 left-0 right-0 mx-auto px-4 py-3 border-t"
        style={{ maxWidth: 430, background: "var(--bg-base)", borderColor: "var(--divider)" }}>
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-50"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />{es ? "Guardando…" : "Saving…"}
            </span>
          ) : es ? "Guardar cambios" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
