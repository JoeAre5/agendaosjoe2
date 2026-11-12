import { useAnimatedValue } from "@/hooks/useAnimatedValue";

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Animates a dollar amount from 0 to target (in cents). */
export function AnimatedCurrency({
  cents,
  delay = 0,
  className = "",
  style,
}: {
  cents: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const animated = useAnimatedValue(cents, 900, delay);
  return <span className={className} style={style}>{currencyFmt.format(animated / 100)}</span>;
}

/** Animates a plain integer from 0 to target. */
export function AnimatedNumber({
  value,
  delay = 0,
  suffix = "",
  prefix = "",
  className = "",
  style,
}: {
  value: number;
  delay?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const animated = useAnimatedValue(value, 900, delay);
  return <span className={className} style={style}>{prefix}{animated}{suffix}</span>;
}

/** Animated progress bar that grows from 0% width. */
export function AnimatedBar({
  ratio,
  color,
  delay = 0,
  height = "h-2",
}: {
  ratio: number;
  color: string;
  delay?: number;
  height?: string;
}) {
  const animatedRatio = useAnimatedValue(Math.round(ratio * 10), 1000, delay) / 10;
  return (
    <div className={`${height} rounded-full overflow-hidden`} style={{ background: "var(--bg-surface-2)" }}>
      <div
        className={`h-full rounded-full`}
        style={{
          width: `${animatedRatio}%`,
          background: color,
          minWidth: ratio > 0 ? 4 : 0,
          transition: "none",
        }}
      />
    </div>
  );
}
