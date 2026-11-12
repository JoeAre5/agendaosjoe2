// Native scheduler (Phase B7): weekly opening hours editor.
//
// Edits `shop_hours` (the shop envelope) and `working_hours` (per barber).
// The availability engine offers slots only inside shop hours ∩ working
// hours, so this page is where a native shop's calendar is shaped.
//
// One interval per weekday is edited here; a day with several rows (split
// shift) keeps its extra rows untouched and shows a note.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Lang = "es" | "en";
const t = (language: Lang, es: string, en: string) => (language === "es" ? es : en);

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface HourRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  barber_id?: string | null;
}

/** Editable week: one entry per weekday. */
interface DayState {
  id: string | null;
  active: boolean;
  start: string;
  end: string;
  extra: number;
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";
const hhmm = (v: string) => String(v).slice(0, 5);

function weekFromRows(rows: HourRow[]): DayState[] {
  const week: DayState[] = Array.from({ length: 7 }, () => ({ id: null, active: false, start: DEFAULT_START, end: DEFAULT_END, extra: 0 }));
  const sorted = [...rows].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  for (const r of sorted) {
    const d = week[r.day_of_week];
    if (!d) continue;
    if (d.id === null) {
      d.id = r.id;
      d.active = r.is_active;
      d.start = hhmm(r.start_time);
      d.end = hhmm(r.end_time);
    } else {
      d.extra++;
    }
  }
  return week;
}

export interface HoursBarber {
  id: string;
  name: string;
  color?: string | null;
}

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

  const save = async () => {
    const target = selectedBarber;
    for (const d of week) {
      if (d.active && d.end <= d.start) {
        toast.error(t(language, "La hora de cierre debe ser después de la apertura", "Closing time must be after opening time"));
        return;
      }
    }
    setSaving(target);
    try {
      for (let dow = 0; dow < 7; dow++) {
        const d = week[dow];
        const row = {
          day_of_week: dow,
          start_time: `${d.start}:00`,
          end_time: `${d.end}:00`,
          is_active: d.active,
        };
        let error: { message: string } | null = null;
        if (target === "shop") {
          ({ error } = d.id
            ? await supabase.from("shop_hours").update(row).eq("id", d.id)
            : d.active
              ? await supabase.from("shop_hours").insert(row)
              : { error: null });
        } else {
          const barberRow = { ...row, barber_id: target };
          ({ error } = d.id
            ? await supabase.from("working_hours").update(barberRow).eq("id", d.id)
            : d.active
              ? await supabase.from("working_hours").insert(barberRow)
              : { error: null });
        }
        if (error) throw error;
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
    setWeek(week.map((d, i) => ({ ...d, active: shopWeek[i].active, start: shopWeek[i].start, end: shopWeek[i].end })));
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
          : t(language, "Horario de trabajo del barbero, dentro del horario del negocio.", "The barber's working hours, inside the shop hours.")}
      </p>

      <div className="rounded-xl overflow-hidden card-elevated">
        {week.map((d, dow) => (
          <div
            key={dow}
            className="flex items-center gap-3 px-3 py-2"
            style={{ borderBottom: dow < 6 ? "1px solid var(--border-color, rgba(127,127,127,0.2))" : undefined, opacity: d.active ? 1 : 0.6 }}
          >
            <span className="w-9 text-sm font-medium">{days[dow]}</span>
            <Switch checked={d.active} disabled={!canEdit(selectedBarber)} onCheckedChange={(v) => patchDay(dow, { active: v })} />
            <input
              type="time"
              value={d.start}
              disabled={!d.active || !canEdit(selectedBarber)}
              onChange={(e) => patchDay(dow, { start: e.target.value })}
              className="flex-1 min-w-0 rounded-md border px-2 py-1 text-sm"
              style={{ background: "transparent", color: "var(--text-primary)", borderColor: "var(--border-color, #444)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>–</span>
            <input
              type="time"
              value={d.end}
              disabled={!d.active || !canEdit(selectedBarber)}
              onChange={(e) => patchDay(dow, { end: e.target.value })}
              className="flex-1 min-w-0 rounded-md border px-2 py-1 text-sm"
              style={{ background: "transparent", color: "var(--text-primary)", borderColor: "var(--border-color, #444)" }}
            />
            {d.extra > 0 && (
              <span className="text-[10px]" style={{ color: "var(--text-secondary)" }} title={t(language, "Turno partido: filas adicionales sin editar", "Split shift: extra rows untouched")}>
                +{d.extra}
              </span>
            )}
          </div>
        ))}
      </div>

      {canEdit(selectedBarber) && (
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
