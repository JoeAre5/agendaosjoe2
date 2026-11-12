/**
 * BookingProgress — barra de progreso continua + chips acumulativos.
 *
 * Reemplaza el contador "Paso N de M". Diseño neuro-UX:
 *  - Sin números de paso (reduce ansiedad).
 *  - Barra fina animada que crece con cada confirmación (efecto endowment).
 *  - Chips debajo muestran lo que el usuario YA eligió (barbero, servicio,
 *    add-ons, fecha/hora, productos). Tap en un chip = volver a editar ese paso.
 *  - Scroll horizontal silencioso si no caben (mobile-first 430px).
 */
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export interface BookingProgressChip {
  /** Step key — used for navigation when the chip is tapped */
  stepKey: string;
  /** Short visible label, e.g. "Charlie", "Corte $25", "Mar 4pm" */
  label: string;
  /** Optional secondary detail shown after a separator (rarely needed) */
  detail?: string;
}

interface Props {
  /** 0..1 — fraction of the flow completed */
  progress: number;
  /** Chips for steps the user has already confirmed */
  chips: BookingProgressChip[];
  /** Called when a chip is tapped — parent navigates to that step */
  onChipClick?: (stepKey: string) => void;
  accent: string;
}

export function BookingProgress({ progress, chips, onChipClick, accent }: Props) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the chip strip so the most recently added chip is always
  // visible on the right edge. User can still scroll left to see history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Use rAF to wait for the new chip to be in the DOM + measured.
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [chips.length]);


  return (
    <div className="px-5 pt-3 pb-1 space-y-2">
      {/* Progress bar — track surface, fill solid black for unified neutral progress */}
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--bg-surface-2)" }}>
        <div
          
          className="h-full rounded-full"
          style={{ background: "#000" }} />
      </div>

      {/* Chips row — pill theme (nav-pill tokens), accent only on check + label color.
          Auto-scrolls to the right edge so the newest chip is always visible. */}
      {chips.length > 0 && (
        <div
          ref={scrollRef}
          className="booking-progress-chips flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}>
          <style>{`
            .booking-progress-chips::-webkit-scrollbar { display: none; }
          `}</style>
          {chips.map((chip) => (
            <button
              key={chip.stepKey + chip.label}
              type="button"
              onClick={() => onChipClick?.(chip.stepKey)}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-[0.96] backdrop-blur-md"
              style={{
                background: "var(--nav-pill-bg)",
                border: "var(--nav-pill-border)",
                color: "var(--text-primary)",
                boxShadow: "var(--nav-pill-shadow)",
              }}>
              <Check size={10} className="icon-extrabold shrink-0" style={{ color: accent }} />
              <span>{chip.label}</span>
              {chip.detail && (
                <span style={{ color: "var(--text-tertiary)" }}>· {chip.detail}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
