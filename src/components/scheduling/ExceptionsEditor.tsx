// Native scheduler: date-specific exceptions to the weekly hours.
//
// Close a single day (holiday, day off) or give it different hours, for everyone or for one barber,
// without touching the weekly schedule. An exception REPLACES the weekly hours of that date for its
// scope; appointments that already exist that day are NOT cancelled, the day just stops being offered.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { toAcuityDatetimeInTz } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { dayProblem } from "./hoursModel";
import type { HoursBarber } from "./HoursEditor";

type Lang = "es" | "en";
const t = (language: Lang, es: string, en: string) => (language === "es" ? es : en);

import { ALL, type ExceptionRow, type Group, groupExceptions } from "./exceptionsModel";

export function ExceptionsEditor({
  language,
  barbers,
  canEditShop,
  editableBarberIds,
  timezone,
}: {
  language: Lang;
  barbers: HoursBarber[];
  /** Owner: may create exceptions for every barber at once. */
  canEditShop: boolean;
  editableBarberIds: "all" | string[];
  timezone: string;
}) {
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => formatInTimeZone(new Date(), timezone || "America/Puerto_Rico", "yyyy-MM-dd"), [timezone]);
  const editableBarbers = useMemo(
    () => barbers.filter((b) => editableBarberIds === "all" || editableBarberIds.includes(b.id)),
    [barbers, editableBarberIds],
  );
  const scopes = useMemo(
    () => [
      ...(canEditShop ? [{ id: ALL, label: t(language, "Todos", "Everyone") }] : []),
      ...editableBarbers.map((b) => ({ id: b.id, label: b.name })),
    ],
    [canEditShop, editableBarbers, language],
  );

  const [date, setDate] = useState(today);
  const [scope, setScope] = useState<string>(scopes[0]?.id ?? ALL);
  const [closed, setClosed] = useState(true);
  const [ranges, setRanges] = useState([{ start: "09:00", end: "17:00" }]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!scopes.some((s) => s.id === scope)) setScope(scopes[0]?.id ?? ALL);
  }, [scopes, scope]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("schedule_exceptions")
      .select("id, barber_id, exception_date, is_closed, start_time, end_time, note")
      .gte("exception_date", today)
      .order("exception_date", { ascending: true });
    if (error) toast.error(t(language, "No se pudieron cargar las excepciones", "Could not load the exceptions"));
    setRows((data ?? []) as ExceptionRow[]);
    setLoading(false);
  }, [today, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupExceptions(rows), [rows]);
  const barberName = (id: string | null) => (id ? barbers.find((b) => b.id === id)?.name ?? t(language, "Barbero", "Barber") : t(language, "Todos", "Everyone"));
  const dayLabel = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(language === "es" ? "es-PR" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const canTouch = (barberId: string | null) => (barberId === null ? canEditShop : editableBarberIds === "all" || editableBarberIds.includes(barberId));

  const remove = async (g: Group) => {
    const { error } = await supabase.from("schedule_exceptions").delete().in("id", g.ids);
    if (error) {
      toast.error(t(language, "No se pudo quitar", "Could not remove") + `: ${error.message}`);
      return;
    }
    toast.success(t(language, "Excepción quitada", "Exception removed"));
    await load();
  };

  const save = async () => {
    if (!date || date < today) {
      toast.error(t(language, "Elige una fecha de hoy en adelante", "Pick today or a later date"));
      return;
    }
    if (!closed) {
      const problem = dayProblem({ active: true, origIds: [], ranges: ranges.map((r) => ({ id: null, ...r })) });
      if (problem === "order") return void toast.error(t(language, "La hora de cierre debe ser después de la apertura", "Closing time must be after opening time"));
      if (problem === "overlap") return void toast.error(t(language, "Los rangos no pueden superponerse", "Ranges cannot overlap"));
    }
    setSaving(true);
    try {
      // Existing appointments are not cancelled: warn so the owner can move them by hand.
      const [y, m, d] = date.split("-").map(Number);
      const from = toAcuityDatetimeInTz(y, m, d, 0, 0, timezone);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      const to = toAcuityDatetimeInTz(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timezone);
      let q = supabase.from("appointments").select("id", { count: "exact", head: true }).gte("starts_at", from).lt("starts_at", to).not("status", "in", "(cancelled,no_show)");
      if (scope !== ALL) q = q.eq("barber_id", scope);
      const { count } = await q;
      if ((count ?? 0) > 0) {
        const ok = window.confirm(
          t(
            language,
            `Ese día ya hay ${count} cita(s). No se cancelan: solo deja de ofrecerse el día. ¿Continuar?`,
            `There are already ${count} appointment(s) that day. They are not cancelled; the day just stops being offered. Continue?`,
          ),
        );
        if (!ok) return;
      }

      // One exception per scope and date: replace what was there.
      let del = supabase.from("schedule_exceptions").delete().eq("exception_date", date);
      del = scope === ALL ? del.is("barber_id", null) : del.eq("barber_id", scope);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      const base = { exception_date: date, barber_id: scope === ALL ? null : scope, note: note.trim() || null };
      const inserts = closed
        ? [{ ...base, is_closed: true, start_time: null, end_time: null }]
        : ranges.map((r) => ({ ...base, is_closed: false, start_time: `${r.start}:00`, end_time: `${r.end}:00` }));
      const { error } = await supabase.from("schedule_exceptions").insert(inserts);
      if (error) throw error;

      toast.success(t(language, "Excepción guardada", "Exception saved"));
      setOpen(false);
      setNote("");
      setClosed(true);
      setRanges([{ start: "09:00", end: "17:00" }]);
      await load();
    } catch (e) {
      toast.error(t(language, "No se pudo guardar", "Could not save") + `: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (scopes.length === 0) return null;
  const input = "rounded-lg border px-3 h-11 text-sm box-border";
  const inputStyle = { background: "transparent", color: "var(--text-primary)", borderColor: "var(--border-color, #444)" } as const;
  // Safari de iPhone ignora el ancho de los campos de fecha/hora (texto centrado y borde que se sale de su columna)
  // salvo que se les quite el estilo nativo; el selector de fecha del sistema se abre igual al tocarlos.
  const pickerStyle = { ...inputStyle, WebkitAppearance: "none", appearance: "none", display: "block", minWidth: 0, maxWidth: "100%", textAlign: "left" } as const;
  const pickerClass = "[&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0";
  // Fecha y "Aplica a": Safari de iPhone no centra verticalmente el texto de estos campos nativos. Se dibuja una caja
  // propia (texto centrado con flex) y encima va el campo nativo transparente, que abre el selector del sistema al tocar.
  const fieldBox = `${input} flex w-full items-center justify-between gap-2`;
  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(language === "es" ? "es-PR" : "en-US", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const scopeLabel = scopes.find((s) => s.id === scope)?.label ?? "";

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
          {t(language, "Excepciones por fecha", "Date exceptions")}
        </p>
        {!open && (
          <button className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-color)" }} onClick={() => setOpen(true)}>
            <Plus size={14} /> {t(language, "Nueva", "New")}
          </button>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
        {t(
          language,
          "Cierra un día concreto (feriado, día libre) o cámbiale el horario solo a esa fecha. No afecta el horario semanal ni cancela citas que ya existen.",
          "Close a single day (holiday, day off) or change its hours for that date only. It does not change the weekly schedule or cancel existing appointments.",
        )}
      </p>

      {open && (
        <div className="rounded-xl card-elevated p-4 mb-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{t(language, "Fecha", "Date")}</span>
              <div className="relative mt-1.5">
                <div className={fieldBox} style={inputStyle}>
                  <span className="truncate">{dateLabel}</span>
                  <CalendarDays size={16} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                </div>
                <input
                  type="date"
                  aria-label={t(language, "Fecha", "Date")}
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {
                      /* el navegador no permite abrirlo desde aqui: el toque nativo lo abre */
                    }
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
            </label>
            <label className="block min-w-0 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{t(language, "Aplica a", "Applies to")}</span>
              <div className="relative mt-1.5">
                <div className={fieldBox} style={inputStyle}>
                  <span className="truncate">{scopeLabel}</span>
                  <ChevronDown size={16} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                </div>
                <select
                  aria-label={t(language, "Aplica a", "Applies to")}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id} style={{ color: "#000" }}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {[true, false].map((isClosed) => (
              <button
                key={String(isClosed)}
                onClick={() => setClosed(isClosed)}
                className="rounded-lg px-3 h-11 font-semibold"
                style={{
                  background: closed === isClosed ? "var(--accent-color)" : "var(--bg-elevated, rgba(127,127,127,0.15))",
                  color: closed === isClosed ? "#fff" : "var(--text-secondary)",
                }}
              >
                {isClosed ? t(language, "Cerrado todo el día", "Closed all day") : t(language, "Horario especial", "Special hours")}
              </button>
            ))}
          </div>

          {!closed && (
            <div className="space-y-2">
              {ranges.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="time" value={r.start} onChange={(e) => setRanges(ranges.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x)))} className={`${input} ${pickerClass} flex-1 min-w-0`} style={pickerStyle} />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>–</span>
                  <input type="time" value={r.end} onChange={(e) => setRanges(ranges.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x)))} className={`${input} ${pickerClass} flex-1 min-w-0`} style={pickerStyle} />
                  {ranges.length > 1 && (
                    <button onClick={() => setRanges(ranges.filter((_, i) => i !== idx))} aria-label={t(language, "Quitar rango", "Remove range")} style={{ color: "var(--text-secondary)" }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button className="text-[11px] font-semibold" style={{ color: "var(--accent-color)" }} onClick={() => setRanges([...ranges, { start: "13:00", end: "17:00" }])}>
                <Plus size={11} className="inline -mt-0.5" /> {t(language, "Rango (para almuerzo u otro corte)", "Range (for lunch or another break)")}
              </button>
            </div>
          )}

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(language, "Nota (opcional): feriado, cita médica…", "Note (optional): holiday, appointment…")}
            className={`${input} w-full`}
            style={inputStyle}
            maxLength={120}
          />

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)} disabled={saving}>
              {t(language, "Cancelar", "Cancel")}
            </Button>
            <Button className="h-11" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : t(language, "Guardar excepción", "Save exception")}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {t(language, "No hay excepciones próximas.", "No upcoming exceptions.")}
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden card-elevated">
          {groups.map((g, i) => (
            <div key={g.key} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: i < groups.length - 1 ? "1px solid var(--border-color, rgba(127,127,127,0.2))" : undefined }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{dayLabel(g.date)}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {barberName(g.barberId)} · {g.closed ? t(language, "Cerrado", "Closed") : g.ranges.map((r) => `${r.start}–${r.end}`).join(" y ")}
                  {g.note ? ` · ${g.note}` : ""}
                </p>
              </div>
              {canTouch(g.barberId) && (
                <button onClick={() => remove(g)} aria-label={t(language, "Quitar excepción", "Remove exception")} className="p-1.5 rounded-full active:opacity-60" style={{ color: "var(--text-secondary)" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
