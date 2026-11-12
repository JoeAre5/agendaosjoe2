/**
 * PasswordStrengthMeter
 * Live, bilingual benchmark list + animated progress bar for password creation.
 * Reuses validatePassword() rules. Surfaces 5 checks: length, lower+upper,
 * number, symbol, no email/name leak. Returns isStrong via `onChange` so the
 * parent can disable the submit button.
 */
import { useEffect, useMemo } from "react";
import { Check, X } from "lucide-react";

type Locale = "es" | "en";

interface Props {
  password: string;
  locale: Locale;
  email?: string | null;
  firstName?: string | null;
  onChange?: (strong: boolean, score: number) => void;
  compact?: boolean;
}

interface Rule {
  id: string;
  labelEs: string;
  labelEn: string;
  test: (pw: string, email?: string | null, name?: string | null) => boolean;
}

const RULES: Rule[] = [
  {
    id: "length",
    labelEs: "Mínimo 8 caracteres",
    labelEn: "At least 8 characters",
    test: (pw) => pw.length >= 8,
  },
  {
    id: "case",
    labelEs: "Una mayúscula y una minúscula",
    labelEn: "One uppercase and one lowercase",
    test: (pw) => /[a-zà-ÿ]/.test(pw) && /[A-ZÀ-Þ]/.test(pw),
  },
  {
    id: "number",
    labelEs: "Un número",
    labelEn: "A number",
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: "symbol",
    labelEs: "Un símbolo (!, @, #, $...)",
    labelEn: "A symbol (!, @, #, $...)",
    test: (pw) => /[^A-Za-zÀ-ÿ0-9]/.test(pw),
  },
  {
    id: "no-personal",
    labelEs: "No incluye tu nombre ni tu email",
    labelEn: "Does not contain your name or email",
    test: (pw, email, name) => {
      if (!pw) return false;
      const low = pw.toLowerCase();
      const local = (email || "").split("@")[0]?.toLowerCase() || "";
      if (local.length >= 4 && low.includes(local)) return false;
      const first = (name || "").trim().toLowerCase();
      if (first.length >= 3 && low.includes(first)) return false;
      return true;
    },
  },
];

function colorForScore(score: number): string {
  if (score <= 1) return "#dc2626"; // red
  if (score === 2) return "#f97316"; // orange
  if (score === 3) return "#eab308"; // yellow
  if (score === 4) return "#84cc16"; // lime
  return "#16a34a"; // green
}

export default function PasswordStrengthMeter({
  password,
  locale,
  email,
  firstName,
  onChange,
  compact = false,
}: Props) {
  const es = locale === "es";

  const results = useMemo(
    () => RULES.map((r) => ({ ...r, ok: r.test(password, email, firstName) })),
    [password, email, firstName],
  );

  const score = results.filter((r) => r.ok).length;
  const strong = score === RULES.length;
  const pct = (score / RULES.length) * 100;
  const color = colorForScore(score);
  const visibleRules = results;

  useEffect(() => {
    onChange?.(strong, score);
  }, [strong, score, onChange]);

  const label = !password
    ? es ? "Crea tu contraseña" : "Create your password"
    : score <= 1
      ? es ? "Muy débil" : "Very weak"
      : score === 2
        ? es ? "Débil" : "Weak"
        : score === 3
          ? es ? "Aceptable" : "Fair"
          : score === 4
            ? es ? "Fuerte" : "Strong"
            : es ? "Excelente" : "Excellent";

  return (
    <div className={compact ? "w-full mt-2" : "w-full mt-3"}>
      {/* Bar */}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          {score}/{RULES.length}
        </span>
      </div>

      {/* Rules list */}
      {visibleRules.length > 0 && <ul className={compact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}>
        {visibleRules.map((r) => (
          <li key={r.id} className={compact ? "flex items-center gap-1.5 text-[11px] leading-tight" : "flex items-center gap-2 text-[12px]"}>
            <span
              className="inline-flex items-center justify-center rounded-full transition-colors"
              style={{
                width: compact ? 14 : 16,
                height: compact ? 14 : 16,
                background: r.ok ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.06)",
                color: r.ok ? "#22c55e" : "rgba(255,255,255,0.45)",
              }}
              aria-hidden
            >
              {r.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={2.5} />}
            </span>
            <span
              style={{
                color: r.ok ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
              }}
            >

              {es ? r.labelEs : r.labelEn}
            </span>
          </li>
        ))}
      </ul>}
    </div>
  );
}

export function isPasswordStrong(
  pw: string,
  email?: string | null,
  firstName?: string | null,
): boolean {
  return RULES.every((r) => r.test(pw, email, firstName));
}
