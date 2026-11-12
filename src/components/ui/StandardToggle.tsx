/**
 * StandardToggle — the project's single, canonical on/off switch.
 *
 * Material-3 inspired morphing handle: the knob grows when checked, presses
 * larger on tap, and morphs between a Check (on) and X (off) icon. A subtle
 * halo blooms on hover/press. Same simple API as before so every call site
 * keeps working unchanged.
 *
 * Use this everywhere. Do NOT inline a custom toggle.
 */
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";

export function StandardToggle({ checked, onChange, ariaLabel, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      className={cn(
        "group relative shrink-0 inline-flex items-center justify-start",
        "w-10 h-6 rounded-full transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
      style={{
        background: checked ? "var(--accent-color)" : "var(--bg-surface-2)",
        border: `1px solid ${checked ? "var(--accent-color)" : "var(--border)"}`,
      }}
    >
      {/* Halo */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full pointer-events-none",
          "transition-all duration-200 opacity-0 group-hover:opacity-10 group-active:opacity-20",
        )}
        style={{
          left: checked ? "10px" : "-6px",
          background: checked ? "var(--accent-color)" : "var(--text-primary)",
        }}
      />

      {/* Morphing handle */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center shadow-sm",
          "transition-all group-active:scale-110",
        )}
        style={{
          transitionTimingFunction: SPRING,
          transitionDuration: "300ms",
          width:  checked ? "18px" : "12px",
          height: checked ? "18px" : "12px",
          left:   checked ? "20px" : "3px",
          background: checked ? "var(--cta-fg)" : "var(--text-primary)",
          color:      checked ? "var(--accent-color)" : "var(--bg-surface-2)",
        }}
      >
        <span className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-300",
              checked ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-45",
            )}
          >
            <Check size={10} strokeWidth={4} />
          </span>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-300",
              !checked ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45",
            )}
          >
            <X size={8} strokeWidth={4} />
          </span>
        </span>
      </span>
    </button>
  );
}
