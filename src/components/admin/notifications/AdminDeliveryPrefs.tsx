// AdminDeliveryPrefs — quiet hours, sound, grouping. Single-row preferences.
import { useEffect, useState } from "react";
import { Loader2, Moon, Volume2, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StandardToggle } from "@/components/ui/StandardToggle";

interface Prefs {
  quiet_hours_enabled: boolean;
  quiet_start: string; // "HH:mm" or "HH:mm:ss"
  quiet_end: string;
  sound_enabled: boolean;
  group_similar: boolean;
  group_window_minutes: number;
}

const DEFAULTS: Prefs = {
  quiet_hours_enabled: false,
  quiet_start: "22:00",
  quiet_end: "07:00",
  sound_enabled: true,
  group_similar: true,
  group_window_minutes: 5,
};

function trimSeconds(t: string) { return t?.length >= 5 ? t.slice(0, 5) : t; }

export function AdminDeliveryPrefs({ language }: { language: "es" | "en" }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("admin_notification_prefs")
      .select("quiet_hours_enabled, quiet_start, quiet_end, sound_enabled, group_similar, group_window_minutes")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      setPrefs({
        ...DEFAULTS,
        ...data,
        quiet_start: trimSeconds(data.quiet_start as string),
        quiet_end: trimSeconds(data.quiet_end as string),
      });
    }
    setLoading(false);
  }

  async function patch(p: Partial<Prefs>) {
    const next = { ...prefs, ...p };
    setPrefs(next);
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-notification-prefs-update", {
      body: { patch: p },
    });
    setSaving(false);
    const errMsg = error?.message ?? (data as { error?: string })?.error;
    if (errMsg) {
      toast.error(errMsg);
      void load();
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <section className="mb-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--text-tertiary)" }}>
        {language === "es" ? "Entrega" : "Delivery"}
      </h2>
      <div className="rounded-xl overflow-hidden card-elevated">
        {/* Quiet hours */}
        <div className="px-4 py-3.5">
          <div className="flex items-stretch">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Moon size={14} style={{ color: prefs.quiet_hours_enabled ? "var(--accent-color)" : "var(--text-tertiary)" }} />
                <span className="text-sm font-bold">
                  {language === "es" ? "Horas de silencio" : "Quiet hours"}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "No recibir alertas en este horario (PR)." : "No alerts during this window (PR)."}
              </p>
            </div>
            <div className="flex items-center pl-3">
              <StandardToggle
                checked={prefs.quiet_hours_enabled}
                onChange={(v) => void patch({ quiet_hours_enabled: v })}
              />
            </div>
          </div>
          {prefs.quiet_hours_enabled && (
            <div className="flex items-center gap-2 mt-3">
              <TimeInput value={prefs.quiet_start} onChange={(v) => void patch({ quiet_start: v })} />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>→</span>
              <TimeInput value={prefs.quiet_end} onChange={(v) => void patch({ quiet_end: v })} />
            </div>
          )}
        </div>
        <div className="h-px mx-4" style={{ background: "var(--divider)" }} />

        {/* Sound */}
        <div className="flex items-stretch px-4 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Volume2 size={14} style={{ color: prefs.sound_enabled ? "var(--accent-color)" : "var(--text-tertiary)" }} />
              <span className="text-sm font-bold">{language === "es" ? "Sonido" : "Sound"}</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? "Reproducir sonido al llegar la notificación." : "Play sound when notifications arrive."}
            </p>
          </div>
          <div className="flex items-center pl-3">
            <StandardToggle checked={prefs.sound_enabled} onChange={(v) => void patch({ sound_enabled: v })} />
          </div>
        </div>
        <div className="h-px mx-4" style={{ background: "var(--divider)" }} />

        {/* Grouping */}
        <div className="flex items-stretch px-4 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Layers size={14} style={{ color: prefs.group_similar ? "var(--accent-color)" : "var(--text-tertiary)" }} />
              <span className="text-sm font-bold">{language === "es" ? "Agrupar similares" : "Group similar"}</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? "Combinar varias alertas del mismo tipo." : "Collapse repeats of the same alert."}
            </p>
          </div>
          <div className="flex items-center pl-3">
            <StandardToggle checked={prefs.group_similar} onChange={(v) => void patch({ group_similar: v })} />
          </div>
        </div>
      </div>
      {saving && (
        <p className="text-[10px] mt-2 px-1" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Guardando…" : "Saving…"}
        </p>
      )}
    </section>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg px-3 py-2 text-sm outline-none"
      style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
    />
  );
}
