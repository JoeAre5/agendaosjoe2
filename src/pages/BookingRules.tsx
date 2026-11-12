import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Plus, Trash2, Save, Globe, User, Scissors, Crown } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";

interface BookingRule {
  id: string;
  scope: string;
  barber_id: string | null;
  service_id: string | null;
  min_advance_minutes: number;
  max_advance_days: number;
  padding_before_minutes: number;
  padding_after_minutes: number;
  slot_interval_minutes: number;
  max_per_day: number | null;
  cancel_window_hours: number;
  cancel_deadline_type: "hours_before" | "midnight_day_before";
  is_active: boolean;
}

interface Barber { id: string; name: string; }
interface Service { id: string; name: string; }

const SCOPE_ICONS: Record<string, any> = { global: Globe, barber: User, service: Scissors };
const SCOPE_LABELS: Record<string, Record<string, string>> = {
  es: { global: "Global", barber: "Por Barbero", service: "Por Servicio" },
  en: { global: "Global", barber: "Per Barber", service: "Per Service" },
};

function Field({ label, value, onChange, type = "number", suffix }: { label: string; value: number | string; onChange: (v: string) => void; type?: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 text-right text-sm font-semibold rounded-lg px-2 py-1.5"
          style={{ background: "var(--card-surface)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        />
        {suffix && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function BookingRules() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const labels = SCOPE_LABELS[language] || SCOPE_LABELS.es;

  const [rules, setRules] = useState<BookingRule[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("booking_rules").select("*").eq("is_active", true).order("scope"),
      supabase.from("barbers_public").select("id,name").eq("is_active", true),
      supabase.from("services").select("id,name").eq("is_active", true),
    ]).then(([rRes, bRes, sRes]) => {
      setRules((rRes.data as BookingRule[]) || []);
      setBarbers((bRes.data as Barber[]) || []);
      setServices((sRes.data as Service[]) || []);
      setLoading(false);
    });
  }, []);

  const updateRule = (id: string, field: keyof BookingRule, value: any) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRule = (scope: string) => {
    const newRule: BookingRule = {
      id: crypto.randomUUID(),
      scope,
      barber_id: scope === "barber" ? barbers[0]?.id || null : null,
      service_id: scope === "service" ? services[0]?.id || null : null,
      min_advance_minutes: 60,
      max_advance_days: 90,
      padding_before_minutes: 0,
      padding_after_minutes: 0,
      slot_interval_minutes: 30,
      max_per_day: null,
      cancel_window_hours: 24,
      cancel_deadline_type: "midnight_day_before",
      is_active: true,
    };
    setRules(prev => [...prev, newRule]);
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing active rules and re-insert
      const { error: delError } = await supabase.from("booking_rules").delete().eq("is_active", true);
      if (delError) throw delError;
      if (rules.length > 0) {
        const now = new Date().toISOString();
        const toInsert = rules.map(({ id, ...rest }) => ({
          ...rest,
          created_at: now,
          updated_at: now,
        }));
        const { error } = await supabase.from("booking_rules").insert(toInsert);
        if (error) throw error;
      }
      toast.success(language === "es" ? "Reglas guardadas" : "Rules saved");
      // Reload to get new IDs
      const { data } = await supabase.from("booking_rules").select("*").eq("is_active", true).order("scope");
      setRules((data as BookingRule[]) || []);
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const getEntityName = (rule: BookingRule) => {
    if (rule.scope === "barber") return barbers.find(b => b.id === rule.barber_id)?.name || "—";
    if (rule.scope === "service") return services.find(s => s.id === rule.service_id)?.name || "—";
    return "";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const grouped = {
    global: rules.filter(r => r.scope === "global"),
    barber: rules.filter(r => r.scope === "barber"),
    service: rules.filter(r => r.scope === "service"),
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <SubpageHeader
        sticky
        title={language === "es" ? "Reglas de Reserva" : "Booking Rules"}
        onBack={() => navigate("/admin?tab=menu")}
      />

      <div className="px-4 pb-32 space-y-6">
        {(["global", "barber", "service"] as const).map(scope => {
          const Icon = SCOPE_ICONS[scope];
          const scopeRules = grouped[scope];

          return (
            <div key={scope}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: "var(--accent-color)" }} />
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    {labels[scope]}
                  </span>
                </div>
                {/* Only allow one global rule */}
                {(scope !== "global" || scopeRules.length === 0) && (
                  <button onClick={() => addRule(scope)} className="p-1.5 rounded-lg" style={{ background: "var(--accent-dim)" }}>
                    <Plus size={16} style={{ color: "var(--accent-color)" }} />
                  </button>
                )}
              </div>

              {scopeRules.length === 0 && (
                <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Sin reglas configuradas" : "No rules configured"}
                </p>
              )}

              {scopeRules.map(rule => (
                <div key={rule.id} className="rounded-xl p-4 card-elevated mb-3">
                  {/* Entity selector for barber/service scopes */}
                  {rule.scope === "barber" && (
                    <div className="mb-3">
                      <select
                        value={rule.barber_id || ""}
                        onChange={(e) => updateRule(rule.id, "barber_id", e.target.value)}
                        className="w-full text-sm font-semibold rounded-lg px-3 py-2"
                        style={{ background: "var(--card-surface)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                      >
                        {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  {rule.scope === "service" && (
                    <div className="mb-3">
                      {(() => {
                        const svc = services.find(s => s.id === rule.service_id);
                        const isVip = svc?.name?.toUpperCase().includes("VIP");
                        return (
                          <>
                            {isVip && (
                              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg w-fit" style={{ background: "rgba(245,158,11,0.15)" }}>
                                <Crown size={12} style={{ color: "#f59e0b" }} />
                                <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>VIP</span>
                              </div>
                            )}
                            <select
                              value={rule.service_id || ""}
                              onChange={(e) => updateRule(rule.id, "service_id", e.target.value)}
                              className="w-full text-sm font-semibold rounded-lg px-3 py-2 truncate"
                              style={{ background: "var(--card-surface)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                            >
                              {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.name.toUpperCase().includes("VIP") ? " 👑" : ""}</option>)}
                            </select>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <Field
                    label={language === "es" ? "Anticipación mínima" : "Min advance"}
                    value={rule.min_advance_minutes}
                    onChange={(v) => updateRule(rule.id, "min_advance_minutes", parseInt(v) || 0)}
                    suffix="min"
                  />
                  <Field
                    label={language === "es" ? "Anticipación máxima" : "Max advance"}
                    value={rule.max_advance_days}
                    onChange={(v) => updateRule(rule.id, "max_advance_days", parseInt(v) || 0)}
                    suffix={language === "es" ? "días" : "days"}
                  />
                  <Field
                    label={language === "es" ? "Buffer antes" : "Padding before"}
                    value={rule.padding_before_minutes}
                    onChange={(v) => updateRule(rule.id, "padding_before_minutes", parseInt(v) || 0)}
                    suffix="min"
                  />
                  <Field
                    label={language === "es" ? "Buffer después" : "Padding after"}
                    value={rule.padding_after_minutes}
                    onChange={(v) => updateRule(rule.id, "padding_after_minutes", parseInt(v) || 0)}
                    suffix="min"
                  />
                  <Field
                    label={language === "es" ? "Intervalo de slots" : "Slot interval"}
                    value={rule.slot_interval_minutes}
                    onChange={(v) => updateRule(rule.id, "slot_interval_minutes", parseInt(v) || 30)}
                    suffix="min"
                  />
                  <Field
                    label={language === "es" ? "Máx. por día" : "Max per day"}
                    value={rule.max_per_day ?? ""}
                    onChange={(v) => updateRule(rule.id, "max_per_day", v ? parseInt(v) : null)}
                  />
                  {rule.scope === "global" && (
                    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? "Política de cancelación" : "Cancellation policy"}
                      </span>
                      <select
                        value={rule.cancel_deadline_type}
                        onChange={(e) => updateRule(rule.id, "cancel_deadline_type", e.target.value)}
                        className="text-sm font-semibold rounded-lg px-2 py-1.5"
                        style={{ background: "var(--card-surface)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                      >
                        <option value="midnight_day_before">{language === "es" ? "11:59 PM del día antes" : "11:59 PM the day before"}</option>
                        <option value="hours_before">{language === "es" ? "Horas antes (legacy)" : "Hours before (legacy)"}</option>
                      </select>
                    </div>
                  )}
                  {rule.scope === "global" && rule.cancel_deadline_type === "hours_before" && (
                    <Field
                      label={language === "es" ? "Horas antes" : "Hours before"}
                      value={rule.cancel_window_hours}
                      onChange={(v) => updateRule(rule.id, "cancel_window_hours", parseInt(v) || 24)}
                      suffix={language === "es" ? "hrs" : "hrs"}
                    />
                  )}

                  <button onClick={() => deleteRule(rule.id)} className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: "var(--red)" }}>
                    <Trash2 size={14} /> {language === "es" ? "Eliminar regla" : "Delete rule"}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="fixed bottom-6 left-0 right-0 px-4" style={{ maxWidth: 430, margin: "0 auto" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {language === "es" ? "Guardar Cambios" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
