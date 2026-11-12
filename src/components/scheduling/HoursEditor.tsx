// Native scheduler (Phase B7): weekly opening hours editor.
//
// Edits `shop_hours` (the shop envelope) and `working_hours` (per barber).
// The availability engine offers slots only inside shop hours ∩ working
// hours, so this page is where a native shop's calendar is shaped.
//
// Each weekday holds one or more ranges (split shift): e.g. 09:00–12:00 and
// 13:00–17:00 closes the lunch hour automatically. Everything outside the
// listed ranges is closed.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Lang = "es" | "en";
const t = (language: Lang, es: string, en: string) => (language === "es" ? es : en);

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import { type DayState, type HourRange, type HourRow, canSplitLunch, dayProblem, splitLunch, weekFromRows } from "./hoursModel";

export interface HoursBarber {
  id: string;
  name: string;
  color?: string | null;
}

const timeInputStyle = { background: "transparent", color: "var(--text-primary)", borderColor: "var(--border-color, #444)" } as const;

export function HoursEditor({
  language,
  barbers,
  canEditShop,
  editableBarberIds,
}: {
  language: Lang;
  barbers: HoursBarber[];
  /** Owner: may edit the shop envelope. */
  canEditShop: boolean;
  /** Barber ids the caller may edit ("all" for owners). */
  editableBarberIds: "all" | string[];
}) {
  const days = language === "es" ? DAYS_ES : DAYS_EN;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [shopWeek, setShopWeek] = useState<DayState[]>(() => weekFromRows([]));
  const [barberWeeks, setBarberWeeks] = useState<Record<string, DayState[]>>({});
  const [selectedBarber, setSelectedBarber] = useState<string | "shop">(canEditShop ? "shop" : barbers[0]?.id ?? "shop");

  const barberKey = barbers.map((b) => b.id).join(",");
  const load = useCallback(async () => {
    setLoading(true);
    const [shopRes, whRes] = await Promise.all([
      supabase.from("shop_hours").select("id, day_of_week, start_time, end_time, is_active"),
      supabase.from("working_hours").select("id, barber_id, day_of_week, start_time, end_time, is_active"),
    ]);
    if (shopRes.error || whRes.error) {
      toast.error(t(language, "No se pudo cargar el horario", "Could not load the hours"));
    }
    setShopWeek(weekFromRows((shopRes.data ?? []) as HourRow[]));
    const byBarber: Record<string, DayState[]> = {};
    for (const b of barbers) {
      byBarber[b.id] = weekFromRows(((whRes.data ?? []) as HourRow[]).filter((r) => r.barber_id === b.id));
    }
    setBarberWeeks(byBarber);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- barberKey stands in for `barbers`
  }, [barberKey, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = (target: string | "shop") =>
    target === "shop" ? canEditShop : editableBarberIds === "all" || editableBarberIds.includes(target);

  const week = selectedBarber === "shop" ? shopWeek : (barberWeeks[selectedBarber] ?? weekFromRows([]));
  const setWeek = (next: DayState[]) => {
    if (selectedBarber === "shop") setShopWeek(next);
    else setBarberWeeks((prev) => ({ ...prev, [selectedBarber]: next }));
  };
  const patchDay = (dow: number, patch: Partial<DayState>) =>
    setWeek(week.map((d, i) => (i === dow ? { ...d, ...patch } : d)));
  const patchRange = (dow: number, idx: number, patch: Partial<HourRange>) =>
    patchDay(dow, { ranges: week[dow].ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  const addRange = (dow: number) => {
    const last = week[dow].ranges[week[dow].ranges.length - 1];
    // Next range starts an hour after the previous one ends (clamped to the day).
    const [h, m] = (last?.end ?? "12:00").split(":").map(Number);
    const startH = Math.min(h + 1, 22);
    const start = `${String(startH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const end = `${String(Math.min(startH + 4, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    patchDay(dow, { ranges: [...week[dow].ranges, { id: null, start, end }] });
  };
  const removeRange = (dow: number, idx: number) =>
    patchDay(dow, { ranges: week[dow].ranges.filter((_, i) => i !== idx) });

  /** Copies one day's ranges to every other active day. */
  const copyDayToAll = (dow: number) => {
    const src = week[dow];
    setWeek(week.map((d, i) => (i === dow || !d.active ? d : { ...d, ranges: src.ranges.map((r) => ({ id: null, start: r.start, end: r.end })) })));
    toast.success(t(language, "Copiado a los demás días activos. Falta guardar.", "Copied to the other active days. Remember to save."));
  };

  const save = async () => {
    const target = selectedBarber;
    for (const d of week) {
      const problem = dayProblem(d);
      if (problem === "order") {
        toast.error(t(language, "La hora de cierre debe ser después de la apertura", "Closing time must be after opening time"));
        return;
      }
      if (problem === "overlap") {
        toast.error(t(language, "Los rangos de un mismo día no pueden superponerse", "Ranges on the same day cannot overlap"));
        return;
      }
    }
    const table = target === "shop" ? "shop_hours" : "working_hours";
    setSaving(target);
    try {
      for (let dow = 0; dow < 7; dow++) {
        const d = week[dow];
        const keep = new Set(d.ranges.filter((r) => r.id).map((r) => r.id as string));
        const gone = d.origIds.filter((id) => !keep.has(id));
        if (gone.length > 0) {
          const { error } = await supabase.from(table).delete().in("id", gone);
          if (error) throw error;
        }
        for (const r of d.ranges) {
          const base = { day_of_week: dow, start_time: `${r.start}:00`, end_time: `${r.end}:00`, is_active: d.active };
          const row = target === "shop" ? base : { ...base, barber_id: target };
          if (r.id) {
            const { error } = await supabase.from(table).update(row).eq("id", r.id);
            if (error) throw error;
          } else if (d.active) {
            const { error } = await supabase.from(table).insert(row);
            if (error) throw error;
          }
        }
      }
      toast.success(t(language, "Horario guardado", "Hours saved"));
      await load();
    } catch (e) {
      toast.error(t(language, "No se pudo guardar", "Could not save") + `: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  };

  const copyShopHours = () => {
    if (selectedBarber === "shop") return;
    setWeek(
      week.map((d, i) => ({
        ...d,
        active: shopWeek[i].active,
        ranges: shopWeek[i].ranges.map((r) => ({ id: null, start: r.start, end: r.end })),
      })),
    );
  };

  const tabs = useMemo(
    () => [
      ...(canEditShop ? [{ id: "shop", label: t(language, "Negocio", "Shop"), color: "var(--accent-color)" }] : []),
      ...barbers
        .filter((b) => editableBarberIds === "all" || editableBarberIds.includes(b.id))
        .map((b) => ({ id: b.id, label: b.name.split(" ")[0], color: b.color || "var(--accent-color)" })),
    ],
    [barbers, canEditShop, editableBarberIds, language],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const editable = canEdit(selectedBarber);
  const linkBtn = "text-[11px] font-semibold underline-offset-2 hover:underline";

  return (
    <div className="px-4 pb-4">
      <div className="flex gap-2 overflow-x-auto pb-3">
        {tabs.map((tab) => {
          const active = tab.id === selectedBarber;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedBarber(tab.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
              style={{
                background: active ? tab.color : "var(--bg-elevated, rgba(127,127,127,0.15))",
                color: active ? "#fff" : "var(--text-secondary)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        {selectedBarber === "shop"
          ? t(language, "Horario del negocio. Ningún barbero puede recibir citas fuera de este horario.", "Shop hours. No barber can take bookings outside them.")
          : t(language, "Horario de trabajo del barbero, dentro del horario del negocio.", "The barber's working hours, inside the shop hours.")}{" "}
        {t(language, "Lo que queda fuera de los rangos está cerrado: para el almuerzo, usa dos rangos (por ejemplo 9:00–12:00 y 13:00–17:00).", "Anything outside the ranges is closed: for a lunch break use two ranges (for example 9:00–12:00 and 1:00–5:00 pm).")}
      </p>

      <div className="rounded-xl overflow-hidden card-elevated">
        {week.map((d, dow) => (
          <div
            key={dow}
            className="px-3 py-2"
            style={{ borderBottom: dow < 6 ? "1px solid var(--border-color, rgba(127,127,127,0.2))" : undefined, opacity: d.active ? 1 : 0.6 }}
          >
            {d.ranges.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3 py-0.5">
                <span className="w-9 text-sm font-medium">{idx === 0 ? days[dow] : ""}</span>
                {idx === 0 ? (
                  <Switch checked={d.active} disabled={!editable} onCheckedChange={(v) => patchDay(dow, { active: v })} />
                ) : (
                  <span className="w-[44px]" />
                )}
                <input
                  type="time"
                  value={r.start}
                  disabled={!d.active || !editable}
                  onChange={(e) => patchRange(dow, idx, { start: e.target.value })}
                  className="flex-1 min-w-0 rounded-md border px-2 py-1 text-sm"
                  style={timeInputStyle}
                />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>–</span>
                <input
                  type="time"
                  value={r.end}
                  disabled={!d.active || !editable}
                  onChange={(e) => patchRange(dow, idx, { end: e.target.value })}
                  className="flex-1 min-w-0 rounded-md border px-2 py-1 text-sm"
                  style={timeInputStyle}
                />
                {d.ranges.length > 1 && editable && d.active ? (
                  <button
                    onClick={() => removeRange(dow, idx)}
                    aria-label={t(language, "Quitar rango", "Remove range")}
                    className="p-1 rounded-full active:opacity-60"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span className="w-[22px]" />
                )}
              </div>
            ))}
            {d.active && editable && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pl-[52px] pt-1">
                <button className={linkBtn} style={{ color: "var(--accent-color)" }} onClick={() => addRange(dow)}>
                  <Plus size={11} className="inline -mt-0.5" /> {t(language, "Rango", "Range")}
                </button>
                {canSplitLunch(d) && (
                  <button className={linkBtn} style={{ color: "var(--accent-color)" }} onClick={() => patchDay(dow, splitLunch(d))}>
                    {t(language, "Almuerzo 12–1", "Lunch 12–1")}
                  </button>
                )}
                <button className={linkBtn} style={{ color: "var(--text-secondary)" }} onClick={() => copyDayToAll(dow)}>
                  {t(language, "Copiar a los demás días", "Copy to other days")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="flex gap-2 pt-3">
          {selectedBarber !== "shop" && (
            <Button variant="outline" className="flex-1" onClick={copyShopHours}>
              {t(language, "Copiar horario del negocio", "Copy shop hours")}
            </Button>
          )}
          <Button className="flex-1" onClick={save} disabled={saving !== null}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : t(language, "Guardar horario", "Save hours")}
          </Button>
        </div>
      )}
    </div>
  );
}
