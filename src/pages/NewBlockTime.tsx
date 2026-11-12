import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";
import { format, addDays, isBefore, startOfDay, isSameDay } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { getShopTimezone, getShopNextSlot, parseFromTz } from "@/lib/timezone";
import {
  ChevronLeft,
  Clock,
  CalendarDays,
  Users,
  StickyNote,
  Loader2,
  Check,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { schedulingProxy as acuityProxy } from "@/lib/scheduling";

interface BarberRow {
  id: string;
  name: string;
  color: string | null;
  acuity_calendar_id: number | null;
}

export default function NewBlockTime() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = usePreferences();
  const dateFnsLocale = language === "es" ? esLocale : enUS;
  const isEs = language === "es";

  // Edit mode
  const editBlockId = searchParams.get("edit");
  const isEdit = !!editBlockId;

  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [date, setDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addDays(new Date(), 1));
  const [selectedBarbers, setSelectedBarbers] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shopTz, setShopTz] = useState<string>("America/Puerto_Rico");

  // Resolve shop timezone + smart defaults (next 15-min slot, end = +1h).
  // Skipped in edit mode (existing values are loaded from DB).
  useEffect(() => {
    let mounted = true;
    getShopTimezone().then((tz) => {
      if (!mounted) return;
      setShopTz(tz);
    });
    if (!editBlockId) {
      getShopNextSlot(15).then((slot) => {
        if (!mounted) return;
        const pad = (n: number) => String(n).padStart(2, "0");
        setStartTime(`${pad(slot.getHours())}:${pad(slot.getMinutes())}`);
        const endSlot = new Date(slot.getTime() + 60 * 60 * 1000);
        setEndTime(`${pad(endSlot.getHours())}:${pad(endSlot.getMinutes())}`);
      });
    }
    return () => { mounted = false; };
  }, [editBlockId]);

  // Fetch barbers
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("barbers_public")
        .select("id, name, color, acuity_calendar_id")
        .eq("is_active", true)
        .order("name");
      if (data) setBarbers(data);
      setLoading(false);
    })();
  }, []);

  // Load edit data
  useEffect(() => {
    if (!editBlockId) return;
    (async () => {
      const { data } = await supabase
        .from("block_times")
        .select("*")
        .eq("id", editBlockId)
        .single();
      if (data) {
        const s = new Date(data.starts_at);
        const e = new Date(data.ends_at);
        setDate(s);
        setStartTime(format(s, "HH:mm"));
        setEndTime(format(e, "HH:mm"));
        setNotes(data.notes || "");
        setSelectedBarbers(new Set([data.barber_id]));
        if (data.is_all_day || data.is_multi_day) {
          setMultiDay(true);
          setEndDate(e);
        }
      }
    })();
  }, [editBlockId]);

  const canSubmit = selectedBarbers.size > 0;

  const toggleBarber = (id: string) => {
    setSelectedBarbers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // (Phase 1B.TIMEZONE) Hardcoded TZ_OFFSET removed — uses parseFromTz(shopTz) instead.

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    let acuityFailed = false;
    try {
      const barberIds = Array.from(selectedBarbers);

      for (const barberId of barberIds) {
        const barber = barbers.find((b) => b.id === barberId);

        if (multiDay) {
          const startStr = format(date, "yyyy-MM-dd");
          const endStr = format(endDate, "yyyy-MM-dd");
          const isSingle = isSameDay(date, endDate);

          let acuityBlockId: number | null = null;
          if (!barber?.acuity_calendar_id) acuityFailed = true;
          if (barber?.acuity_calendar_id) {
            try {
              const resp = await acuityProxy("/blocks", "POST", {
                calendarID: barber.acuity_calendar_id,
                start: `${startStr}T00:00`,
                end: isSingle ? `${startStr}T23:59` : `${endStr}T23:59`,
                notes: notes || undefined,
              });
              if (resp?.id) acuityBlockId = Number(resp.id);
            } catch {
              acuityFailed = true;
            }
            if (acuityBlockId === null) acuityFailed = true;
          }

          // Interpret wall-clock day boundaries in shop timezone, store as UTC.
          const record: { barber_id: string; starts_at: string; ends_at: string; is_all_day: boolean; is_multi_day?: boolean; notes: string | null; acuity_block_id?: number } = {
            barber_id: barberId,
            starts_at: parseFromTz(`${startStr}T00:00:00`, shopTz),
            ends_at: parseFromTz(
              `${isSingle ? startStr : endStr}T23:59:00`,
              shopTz,
            ),
            is_all_day: isSingle,
            is_multi_day: !isSingle,
            notes: notes || null,
          };
          if (acuityBlockId !== null) record.acuity_block_id = acuityBlockId;

          if (isEdit && editBlockId) {
            await supabase.from("block_times").update(record).eq("id", editBlockId);
          } else {
            await supabase.from("block_times").insert(record);
          }
        } else {
          const dateStr = format(date, "yyyy-MM-dd");
          const startStr = `${dateStr}T${startTime}`;

          // Handle wrapping past midnight
          let endDateStr = dateStr;
          if (endTime <= startTime) {
            endDateStr = format(addDays(date, 1), "yyyy-MM-dd");
          }
          const endStr = `${endDateStr}T${endTime}`;

          let acuityBlockId: number | null = null;
          if (!barber?.acuity_calendar_id) acuityFailed = true;
          if (barber?.acuity_calendar_id) {
            try {
              if (isEdit) {
                // Look up the existing acuity_block_id (we may not have it locally)
                const { data: existingBlock } = await supabase
                  .from("block_times")
                  .select("acuity_block_id")
                  .eq("id", editBlockId)
                  .maybeSingle();
                const existingAcuityId = existingBlock?.acuity_block_id;
                if (existingAcuityId) {
                  await acuityProxy(`/blocks/${existingAcuityId}`, "PUT", {
                    start: startStr,
                    end: endStr,
                    notes: notes || undefined,
                  });
                  acuityBlockId = Number(existingAcuityId);
                } else {
                  // No Acuity counterpart yet — create one now
                  const resp = await acuityProxy("/blocks", "POST", {
                    calendarID: barber.acuity_calendar_id,
                    start: startStr,
                    end: endStr,
                    notes: notes || undefined,
                  });
                  if (resp?.id) acuityBlockId = Number(resp.id);
                }
              } else {
                const resp = await acuityProxy("/blocks", "POST", {
                  calendarID: barber.acuity_calendar_id,
                  start: startStr,
                  end: endStr,
                  notes: notes || undefined,
                });
                if (resp?.id) acuityBlockId = Number(resp.id);
              }
            } catch {
              acuityFailed = true;
            }
            if (acuityBlockId === null) acuityFailed = true;
          }

          // Interpret wall-clock start/end in shop timezone, store as UTC.
          const record: { barber_id: string; starts_at: string; ends_at: string; is_all_day: boolean; is_multi_day?: boolean; notes: string | null; acuity_block_id?: number } = {
            barber_id: barberId,
            starts_at: parseFromTz(`${startStr}:00`, shopTz),
            ends_at: parseFromTz(`${endStr}:00`, shopTz),
            is_all_day: false,
            notes: notes || null,
          };
          if (acuityBlockId !== null) record.acuity_block_id = acuityBlockId;

          if (isEdit && editBlockId) {
            await supabase.from("block_times").update(record).eq("id", editBlockId);
          } else {
            await supabase.from("block_times").insert(record);
          }
        }
      }

      if (acuityFailed) {
        toast.warning(
          isEs
            ? "Bloqueo guardado en la app, pero NO se pudo bloquear en Acuity. Los clientes aun pueden reservar esa hora. Verifica en Acuity."
            : "Block saved in the app, but it could NOT be blocked in Acuity. Clients can still book that time. Check Acuity.",
          { duration: 10000 }
        );
      } else {
        toast.success(isEdit
          ? (isEs ? "Bloqueo actualizado" : "Block updated")
          : (isEs ? "Bloqueo agregado" : "Block added")
        );
      }
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // Time picker options
  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return opts;
  }, []);

  const formatTime12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen mx-auto w-full"
      style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          background: "var(--bg-base)",
          borderBottom: "1px solid var(--divider)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
        }}
      >
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} style={{ color: "var(--text-primary)" }} />
        </button>
        <h1 className="text-lg font-bold">
          {isEdit
            ? isEs ? "Editar Bloqueo" : "Edit Block"
            : isEs ? "Bloquear Tiempo" : "Block Time"}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Multi-day toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={multiDay}
            onCheckedChange={(v) => setMultiDay(!!v)}
          />
          <span className="text-sm font-medium">
            {isEs ? "Bloquear Múltiples Días" : "Block Multiple Days"}
          </span>
        </label>

        {!multiDay ? (
          <>
            {/* TIME */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Hora" : "Time"}
              </p>
              <div className="flex items-center gap-3">
                {/* Start time */}
                <Drawer open={startTimeOpen} onOpenChange={setStartTimeOpen}>
                  <button
                    onClick={() => setStartTimeOpen(true)}
                    className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <Clock size={14} style={{ color: "var(--accent-color)" }} />
                    <span className="text-sm font-medium">{formatTime12(startTime)}</span>
                  </button>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>{isEs ? "Hora de inicio" : "Start Time"}</DrawerTitle>
                    </DrawerHeader>
                    <div className="max-h-[50vh] overflow-y-auto px-4 pb-6">
                      {timeOptions.map((t) => (
                        <button
                          key={t}
                          onClick={() => { setStartTime(t); setStartTimeOpen(false); }}
                          className="w-full py-2.5 text-left px-3 rounded-lg text-sm"
                          style={{
                            background: t === startTime ? "var(--accent-dim)" : "transparent",
                            color: "var(--text-primary)",
                            fontWeight: t === startTime ? 600 : 400,
                          }}
                        >
                          {formatTime12(t)}
                          {t === startTime && <Check size={14} className="inline ml-2" style={{ color: "var(--accent-color)" }} />}
                        </button>
                      ))}
                    </div>
                  </DrawerContent>
                </Drawer>

                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>→</span>

                {/* End time */}
                <Drawer open={endTimeOpen} onOpenChange={setEndTimeOpen}>
                  <button
                    onClick={() => setEndTimeOpen(true)}
                    className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <Clock size={14} style={{ color: "var(--accent-color)" }} />
                    <span className="text-sm font-medium">{formatTime12(endTime)}</span>
                  </button>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>{isEs ? "Hora de fin" : "End Time"}</DrawerTitle>
                    </DrawerHeader>
                    <div className="max-h-[50vh] overflow-y-auto px-4 pb-6">
                      {timeOptions.map((t) => (
                        <button
                          key={t}
                          onClick={() => { setEndTime(t); setEndTimeOpen(false); }}
                          className="w-full py-2.5 text-left px-3 rounded-lg text-sm"
                          style={{
                            background: t === endTime ? "var(--accent-dim)" : "transparent",
                            color: "var(--text-primary)",
                            fontWeight: t === endTime ? 600 : 400,
                          }}
                        >
                          {formatTime12(t)}
                          {t === endTime && <Check size={14} className="inline ml-2" style={{ color: "var(--accent-color)" }} />}
                        </button>
                      ))}
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </div>

            {/* DATE */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Fecha" : "Date"}
              </p>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <CalendarDays size={14} style={{ color: "var(--accent-color)" }} />
                    <span className="text-sm font-medium">
                      {format(date, "EEEE, d MMM yyyy", { locale: dateFnsLocale })}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { if (d) { setDate(d); setDatePickerOpen(false); } }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </>
        ) : (
          <>
            {/* STARTING DATE */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Fecha de inicio" : "Starting Date"}
              </p>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <CalendarDays size={14} style={{ color: "var(--accent-color)" }} />
                    <span className="text-sm font-medium">
                      {format(date, "EEEE, d MMM yyyy", { locale: dateFnsLocale })}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      if (d) {
                        setDate(d);
                        if (isBefore(endDate, d)) setEndDate(d);
                        setDatePickerOpen(false);
                      }
                    }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* ENDING DATE */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Fecha de fin" : "Ending Date"}
              </p>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <CalendarDays size={14} style={{ color: "var(--accent-color)" }} />
                    <span className="text-sm font-medium">
                      {format(endDate, "EEEE, d MMM yyyy", { locale: dateFnsLocale })}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => { if (d) { setEndDate(d); setEndDateOpen(false); } }}
                    disabled={(d) => isBefore(d, startOfDay(date))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}

        {/* BARBERS */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            <Users size={12} className="inline mr-1" />
            {isEs ? "Barberos" : "Barbers"}
          </p>
          <div className="flex flex-wrap gap-2">
            {barbers.map((b) => {
              const selected = selectedBarbers.has(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBarber(b.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all text-sm font-medium"
                  style={{
                    background: selected ? `${b.color || "var(--accent-color)"}25` : "var(--bg-surface-2)",
                    border: selected
                      ? `2px solid ${b.color || "var(--accent-color)"}`
                      : "2px solid transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: b.color || "var(--accent-color)" }}
                  />
                  {b.name.split(" ")[0]}
                  {selected && <Check size={12} style={{ color: b.color || "var(--accent-color)" }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* NOTES */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            <StickyNote size={12} className="inline mr-1" />
            {isEs ? "Notas" : "Notes"}
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isEs ? "Opcional..." : "Optional..."}
            className="min-h-[80px] rounded-xl"
            style={{
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-8 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity disabled:opacity-40"
          style={{
            background: "var(--cta-bg)",
            color: "var(--cta-fg)",
          }}
        >
          {submitting ? (
            <Loader2 size={18} className="animate-spin mx-auto" />
          ) : isEdit
            ? isEs ? "Guardar Cambios" : "Save Changes"
            : isEs ? "Agregar Bloqueo" : "Add Block"}
        </button>
      </div>
    </div>
  );
}
