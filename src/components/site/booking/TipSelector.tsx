import { useState } from "react";

interface TipSelectorProps {
  basePriceCents: number;
  selectedPercent: number | "custom" | null;
  customCents: number;
  onChange: (percent: number | "custom" | null, customCents: number) => void;
  isEs: boolean;
  /** Kept for API compat — no longer used for backgrounds. Selection is shown
   *  as a thicker outline using the theme CTA token instead of the barber color. */
  accent: string;
}

const TIP_PERCENTS = [18, 20, 25];

export function TipSelector({
  basePriceCents,
  selectedPercent,
  customCents,
  onChange,
  isEs,
}: TipSelectorProps) {
  const [customInput, setCustomInput] = useState(
    customCents > 0 ? (customCents / 100).toFixed(2) : ""
  );

  // Selection style: NO fill — only a thicker border that respects the theme
  // (black on light, beige on dark via --cta-bg). Cards stay clean.
  const tileStyle = (isSel: boolean): React.CSSProperties => ({
    background: "var(--bg-surface-2)",
    color: "var(--text-primary)",
    border: isSel ? "2.5px solid var(--cta-bg)" : "1.5px solid var(--border)",
    transition: "border-color 0.15s, border-width 0.15s",
  });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
        {isEs ? "Propina (opcional)" : "Tip (optional)"}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {TIP_PERCENTS.map((pct) => {
          const cents = Math.round((basePriceCents * pct) / 100);
          const isSel = selectedPercent === pct;
          return (
            <button
              key={pct}
              onClick={() => onChange(pct, 0)}
              className="py-2.5 rounded-xl text-center transition-all active:scale-95"
              style={tileStyle(isSel)}
            >
              <div className="text-[13px] font-bold leading-none">{pct}%</div>
              <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                ${(cents / 100).toFixed(2)}
              </div>
            </button>
          );
        })}
        <button
          onClick={() => onChange(null, 0)}
          className="py-2.5 rounded-xl text-center transition-all active:scale-95"
          style={tileStyle(selectedPercent === null && customCents === 0)}
        >
          <div className="text-[13px] font-bold leading-none">{isEs ? "No" : "None"}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>$0</div>
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {isEs ? "Otra cantidad:" : "Custom:"}
        </span>
        <div
          className="flex-1 flex items-center px-3 py-2 rounded-lg"
          style={{
            background: "var(--bg-surface-2)",
            border: selectedPercent === "custom"
              ? "2.5px solid var(--cta-bg)"
              : "1.5px solid var(--border)",
            transition: "border-color 0.15s, border-width 0.15s",
          }}
        >
          <span className="text-[13px] mr-1" style={{ color: "var(--text-secondary)" }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.50"
            value={customInput}
            onChange={(e) => {
              setCustomInput(e.target.value);
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) {
                onChange("custom", Math.round(v * 100));
              } else if (e.target.value === "") {
                onChange(null, 0);
              }
            }}
            placeholder="0.00"
            className="flex-1 bg-transparent text-[13px] font-semibold focus:outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </div>
    </div>
  );
}
