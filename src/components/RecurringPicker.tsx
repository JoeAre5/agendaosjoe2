import { useEffect, useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check, Repeat, Minus, Plus, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import {
  describePattern,
  generateRecurrenceDates,
  type RecurrencePattern,
  type RecurrencePatternId,
} from "@/lib/recurrence";
import {
  checkRecurrenceAvailability,
  reasonLabel,
  type OccurrenceAvailability,
} from "@/lib/recurrenceAvailability";

interface AvailabilityCtx {
  appointmentTypeId: number | string;
  calendarId: number | string;
  barberId: string;
  durationMinutes: number;
  acuityProxy: (path: string, method?: string, body?: any) => Promise<any>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  baseDate: Date; // the first date/time selected
  language: "es" | "en";
  accentColor?: string;
  onConfirm: (pattern: RecurrencePattern) => void;
  /** When provided, the picker runs Acuity + local DB availability checks. */
  availability?: AvailabilityCtx;
}

const PATTERNS: RecurrencePatternId[] = [
  "every_week",
  "every_2_weeks",
  "every_3_weeks",
  "every_4_weeks",
  "monthly_day",
  "monthly_weekday",
  "daily",
];

export default function RecurringPicker({
  open,
  onOpenChange,
  baseDate,
  language,
  accentColor = "var(--accent-color)",
  onConfirm,
  availability,
}: Props) {
  const [patternId, setPatternId] = useState<RecurrencePatternId>("every_week");
  const [count, setCount] = useState(4);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<OccurrenceAvailability[] | null>(null);
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  const isEs = language === "es";
  const dfLocale = isEs ? esLocale : enUS;

  const previewDates = useMemo(
    () => generateRecurrenceDates(baseDate, { id: patternId, count }),
    [baseDate, patternId, count]
  );

  // Run availability checks (debounced by pattern/count change).
  useEffect(() => {
    if (!open || !availability || previewDates.length === 0) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const handle = setTimeout(async () => {
      try {
        const r = await checkRecurrenceAvailability({
          dates: previewDates,
          ...availability,
        });
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, previewDates, availability]);

  const adjust = (delta: number) => {
    setCount((c) => Math.max(1, Math.min(52, c + delta)));
  };

  const conflictCount = results?.filter((r) => !r.available).length ?? 0;
  const willCreate = (results?.filter((r) => r.available).length) ?? previewDates.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Repeat size={18} style={{ color: accentColor }} />
            {isEs ? "Repetir cita" : "Repeat appointment"}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 max-h-[80vh] overflow-y-auto">
          {/* Pattern list */}
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            {isEs ? "Frecuencia" : "Frequency"}
          </p>
          <div className="space-y-1 mb-5">
            {PATTERNS.map((id) => {
              const selected = patternId === id;
              return (
                <button
                  key={id}
                  onClick={() => setPatternId(id)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: selected ? `${accentColor}15` : "var(--bg-surface-2)",
                    border: selected ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                  }}
                >
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {describePattern(baseDate, id, language)}
                  </span>
                  {selected && <Check size={16} style={{ color: accentColor }} />}
                </button>
              );
            })}
          </div>

          {/* Times stepper */}
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            {isEs ? "Veces" : "Times"}
          </p>
          <div
            className="flex items-center justify-between rounded-2xl px-4 py-3 mb-5"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <button
              onClick={() => adjust(-1)}
              disabled={count <= 1}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ background: "var(--bg-base)" }}
            >
              <Minus size={16} style={{ color: "var(--text-primary)" }} />
            </button>
            <div className="flex flex-col items-center">
              <span
                className="text-[28px] font-black leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                {count}
              </span>
              <span className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                {isEs ? `cita${count !== 1 ? "s" : ""}` : `appointment${count !== 1 ? "s" : ""}`}
              </span>
            </div>
            <button
              onClick={() => adjust(1)}
              disabled={count >= 52}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ background: "var(--bg-base)" }}
            >
              <Plus size={16} style={{ color: "var(--text-primary)" }} />
            </button>
          </div>

          {/* Preview header with conflict summary */}
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              {isEs ? "Vista previa" : "Preview"}
            </p>
            {availability && (
              <div className="flex items-center gap-1.5">
                {checking ? (
                  <>
                    <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {isEs ? "Verificando…" : "Checking…"}
                    </span>
                  </>
                ) : conflictCount > 0 ? (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "hsl(0 84% 60% / 0.15)", color: "hsl(0 84% 60%)" }}
                  >
                    {isEs
                      ? `${conflictCount} conflicto${conflictCount !== 1 ? "s" : ""}`
                      : `${conflictCount} conflict${conflictCount !== 1 ? "s" : ""}`}
                  </span>
                ) : results ? (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "hsl(142 71% 45% / 0.15)", color: "hsl(142 71% 45%)" }}
                  >
                    {isEs ? "Todo disponible" : "All available"}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div
            className="rounded-2xl p-2 mb-5 max-h-[260px] overflow-y-auto"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="space-y-1">
              {previewDates.map((d, i) => {
                const r = results?.[i];
                const isConflict = r ? !r.available && r.reason !== "check_failed" : false;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[12px] px-2 py-1.5 rounded-lg"
                    style={{
                      background: isConflict ? "hsl(0 84% 60% / 0.08)" : "transparent",
                      color: isConflict ? "hsl(0 84% 60%)" : "var(--text-secondary)",
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
                      style={{
                        background: isConflict ? "hsl(0 84% 60% / 0.2)" : `${accentColor}20`,
                        color: isConflict ? "hsl(0 84% 60%)" : accentColor,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="capitalize flex-1 truncate">
                      {format(d, "EEE, d MMM yyyy · h:mm a", { locale: dfLocale })}
                    </span>
                    {isConflict && (
                      <span className="flex items-center gap-1 shrink-0">
                        <AlertTriangle size={12} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                          {reasonLabel(r!.reason, language)}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin override toggle — only shown when conflicts exist */}
          {availability && results && conflictCount > 0 && (
            <button
              onClick={() => setOverrideConflicts((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl mb-3 text-left transition-all"
              style={{
                background: overrideConflicts ? "hsl(0 84% 60% / 0.12)" : "var(--bg-surface-2)",
                border: overrideConflicts ? "1.5px solid hsl(0 84% 60%)" : "1.5px solid transparent",
              }}
            >
              <div className="flex-1 pr-3">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {isEs ? "Forzar creación (admin)" : "Force create (admin)"}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {isEs
                    ? "Crear todas las citas aunque haya conflictos"
                    : "Create every appointment even on conflicting slots"}
                </p>
              </div>
              <span
                className="w-9 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: overrideConflicts ? "hsl(0 84% 60%)" : "var(--border)" }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: overrideConflicts ? "calc(100% - 18px)" : "2px" }}
                />
              </span>
            </button>
          )}

          {/* Confirm */}
          <button
            onClick={() => {
              onConfirm({ id: patternId, count, overrideConflicts });
              onOpenChange(false);
            }}
            className="w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity active:opacity-80"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {availability && results && conflictCount > 0
              ? overrideConflicts
                ? (isEs
                    ? `Forzar ${count} cita${count !== 1 ? "s" : ""} (${conflictCount} en conflicto)`
                    : `Force ${count} appointment${count !== 1 ? "s" : ""} (${conflictCount} conflicting)`)
                : (isEs
                    ? `Crear ${willCreate} de ${count} (${conflictCount} se omitirán)`
                    : `Create ${willCreate} of ${count} (${conflictCount} will skip)`)
              : (isEs
                  ? `Crear ${count} cita${count !== 1 ? "s" : ""}`
                  : `Create ${count} appointment${count !== 1 ? "s" : ""}`)}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
