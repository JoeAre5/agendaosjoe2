// Shared confetti burst for benefit unlock/redeem celebrations.
// Pulls colors live from the active design tokens (primary, secondary, accent,
// and their foregrounds) so any rebrand or theme switch (light/dark) is picked
// up automatically. Falls back to a neutral palette during SSR or if tokens
// can't be resolved.
import confetti from "canvas-confetti";

const FALLBACK_COLORS = [
  "#FFFFFF",
  "#D9D9D9",
  "#6B6B6B",
  "#2A2A2A",
  "#000000",
  "#CEB79E",
];

// Token names we sample. These cover primary/secondary buttons and accent
// surfaces in both light and dark modes (whichever is currently active).
const TOKEN_NAMES = [
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--accent-color",
];

function hslTripletToHex(value: string): string | null {
  // Accept "H S% L%" with optional "/ A" suffix.
  const m = value.trim().match(/^(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function normalizeColor(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("#")) return v;
  if (v.startsWith("rgb") || v.startsWith("hsl")) return v;
  return hslTripletToHex(v);
}

function resolveBrandPalette(): string[] {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK_COLORS;
  }
  try {
    const styles = getComputedStyle(document.documentElement);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of TOKEN_NAMES) {
      const raw = styles.getPropertyValue(name);
      const color = raw ? normalizeColor(raw) : null;
      if (!color) continue;
      const key = color.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(color);
    }
    return out.length >= 2 ? out : FALLBACK_COLORS;
  } catch {
    return FALLBACK_COLORS;
  }
}

export function fireCelebrationConfetti() {
  const colors = resolveBrandPalette();
  confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 }, colors, scalar: 0.95, zIndex: 9999 });
  setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors, zIndex: 9999 }), 150);
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors, zIndex: 9999 }), 300);
}
