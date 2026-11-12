// Pure presentational ATH Móvil orange button.
//
// No state, no side-effects, no API calls. Renders the brand-orange
// CTA + optional spinner, helper text, and inline error message.
// Behavior (validation, fetches, navigation) lives in caller wrappers
// such as AthMovilRestButton (public paywall) and the upcoming
// AthMovilPosButton (admin POS — Phase 1B.4).
import React from "react";
import { Loader2, AlertCircle } from "lucide-react";

export interface AthMovilOrangeButtonProps {
  label?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  helperText?: string;
  showHelperText?: boolean;
  errorMessage?: string;
  onClick: () => void | Promise<void>;
  isEs?: boolean;
}

function defaultLabel(isEs: boolean): React.ReactNode {
  return isEs ? (
    <span style={{ fontWeight: 700 }}>
      Paga con <span style={{ fontWeight: 900 }}>ATH</span> Móvil
    </span>
  ) : (
    <span style={{ fontWeight: 700 }}>
      Pay with <span style={{ fontWeight: 900 }}>ATH</span> Móvil
    </span>
  );
}

export function AthMovilOrangeButton({
  label,
  loading = false,
  disabled = false,
  helperText,
  showHelperText = true,
  errorMessage,
  onClick,
  isEs = true,
}: AthMovilOrangeButtonProps) {
  const isDisabled = disabled || loading;
  const resolvedLabel =
    label ?? (loading ? (isEs ? "Iniciando pago…" : "Starting payment…") : defaultLabel(isEs));

  return (
    <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className="w-full flex items-center justify-center gap-2 font-bold text-[15px] transition-opacity active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer select-none"
        style={{
          minHeight: 56,
          padding: "16px 20px",
          background: "#FF6B00",
          color: "#FFFFFF",
          borderRadius: "var(--radius-control)",
          fontFamily: "Montserrat, sans-serif",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          WebkitUserSelect: "none",
          WebkitAppearance: "none",
          appearance: "none",
          border: "none",
          position: "relative",
          zIndex: 2,
          // Force GPU layer so iOS PWA registers taps reliably even when the
          // button sits near the home-indicator gesture zone.
          transform: "translateZ(0)",
        }}
      >
        {loading && <Loader2 size={18} className="animate-spin" />}
        <span>{resolvedLabel}</span>
      </button>

      {showHelperText && helperText && (
        <p
          className="text-[11px] text-center mt-1.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          {helperText}
        </p>
      )}

      {errorMessage && (
        <div
          className="flex items-center justify-center gap-1.5 mt-1.5 text-[13px]"
          style={{ color: "#DC2626" }}
          role="alert"
        >
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
