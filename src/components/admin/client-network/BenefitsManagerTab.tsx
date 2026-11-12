// Benefits Manager tab — CRUD over rewards_benefits.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Edit3, Copy, Power, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import BenefitEditorModal from "./BenefitEditorModal";

type Benefit = {
  id: string;
  title_es: string;
  title_en: string;
  description_es: string | null;
  description_en: string | null;
  required_points: number;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  internal_notes: string | null;
  updated_at: string;
};

export default function BenefitsManagerTab({ isEs }: { isEs: boolean }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Benefit[]>([]);
  const [editing, setEditing] = useState<Benefit | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rewards_benefits")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) console.warn(error);
    setItems((data as Benefit[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const active = items.filter((b) => b.is_active);
    const inactive = items.filter((b) => !b.is_active);
    const sortedActive = [...active].sort((a, b) => a.required_points - b.required_points);
    return {
      activeCount: active.length,
      inactiveCount: inactive.length,
      lowest: sortedActive[0]?.required_points ?? 0,
      highest: sortedActive[sortedActive.length - 1]?.required_points ?? 0,
    };
  }, [items]);

  const toggleActive = async (b: Benefit) => {
    const { error } = await supabase.from("rewards_benefits").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) { toast.error(isEs ? "Error al actualizar." : "Unable to update."); return; }
    toast.success(isEs ? "Beneficio actualizado." : "Benefit updated.");
    load();
  };

  const duplicate = async (b: Benefit) => {
    const { error } = await supabase.from("rewards_benefits").insert({
      title_es: b.title_es + (isEs ? " (copia)" : " (copy)"),
      title_en: b.title_en + " (copy)",
      description_es: b.description_es,
      description_en: b.description_en,
      required_points: b.required_points,
      icon: b.icon,
      is_active: false,
      sort_order: b.sort_order + 1,
      internal_notes: b.internal_notes,
    });
    if (error) { toast.error(isEs ? "Error al duplicar." : "Unable to duplicate."); return; }
    toast.success(isEs ? "Duplicado." : "Duplicated.");
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>;
  }

  return (
    <div className="pt-4">
      <div className="px-4 sm:px-6 flex gap-2 mb-3">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
          style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}
        >
          <Plus size={13} /> {isEs ? "Crear beneficio" : "Create Benefit"}
        </button>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-4 gap-2">
        <MiniKpi label={isEs ? "Activos" : "Active"} value={stats.activeCount} />
        <MiniKpi label={isEs ? "Inactivos" : "Inactive"} value={stats.inactiveCount} />
        <MiniKpi label={isEs ? "Menor" : "Lowest"} value={stats.lowest + " pts"} />
        <MiniKpi label={isEs ? "Mayor" : "Highest"} value={stats.highest + " pts"} />
      </div>

      <div className="px-4 sm:px-6 mt-4 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl p-6 card-elevated text-center">
            <Gift size={20} className="mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
            <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Sin beneficios" : "No benefits created yet."}</div>
            <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {isEs ? "Crea tu primer beneficio para que los clientes puedan empezar a acumular." : "Create your first benefit so clients can track progress."}
            </div>
            <button
              onClick={() => setCreating(true)}
              className="mt-3 px-4 py-2 rounded-lg text-[12px] font-bold"
              style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}
            >
              {isEs ? "Crear beneficio" : "Create Benefit"}
            </button>
          </div>
        ) : (
          items.map((b) => (
            <div key={b.id} className="rounded-xl p-3 card-elevated" style={{ opacity: b.is_active ? 1 : 0.6 }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-dim)" }}>
                  <Gift size={16} style={{ color: "var(--accent-color)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {isEs ? b.title_es : b.title_en}
                    </div>
                    <div className="text-[12px] font-bold tabular-nums" style={{ color: "var(--accent-color)" }}>
                      {b.required_points} pts
                    </div>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {(isEs ? b.description_es : b.description_en) || ""}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Pill label={b.is_active ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")} active={b.is_active} />
                    <Pill label={`#${b.sort_order}`} active={false} />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <SmallBtn icon={Edit3} label={isEs ? "Editar" : "Edit"} onClick={() => setEditing(b)} />
                <SmallBtn icon={Copy} label={isEs ? "Duplicar" : "Duplicate"} onClick={() => duplicate(b)} />
                <SmallBtn icon={Power} label={b.is_active ? (isEs ? "Desactivar" : "Deactivate") : (isEs ? "Activar" : "Activate")} onClick={() => toggleActive(b)} />
              </div>
            </div>
          ))
        )}
      </div>

      <BenefitEditorModal
        open={creating || !!editing}
        benefit={editing}
        isEs={isEs}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); load(); }}
      />
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl p-2.5 card-elevated">
      <div className="text-[9px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="text-[14px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function Pill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: active ? "rgba(34,197,94,0.15)" : "var(--bg-elevated)", color: active ? "#22c55e" : "var(--text-tertiary)" }}>
      {label}
    </span>
  );
}

function SmallBtn({ icon: Icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold"
      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
      <Icon size={11} /> {label}
    </button>
  );
}
