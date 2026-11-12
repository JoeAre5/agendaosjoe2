// Celebration variant of the checkmark — green, larger spring, confetti burst,
// and an optional success chime. Used on the waitlist confirmation screen.
import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo } from "react";

interface Props {
  size?: number;
  /** Fires a soft "ding" via Web Audio when the checkmark animates in. */
  playSound?: boolean;
  className?: string;
  /** Override the checkmark color (defaults to success green). */
  checkColor?: string;
  /** Override the confetti palette (defaults to brand primary/secondary/accent). */
  confettiColors?: string[];
}

/** Resolve brand palette from CSS tokens at render time so confetti picks up
 *  the active theme. Uses --primary / --secondary (HSL triplets) plus
 *  --accent-color (hex). Falls back to brand defaults if unavailable (SSR). */
function resolveBrandPalette(): string[] {
  if (typeof window === "undefined") {
    return ["hsl(0 0% 6.7%)", "hsl(0 0% 96%)", "#ceb79e", "#22c55e"];
  }
  const cs = getComputedStyle(document.documentElement);
  const primary = cs.getPropertyValue("--primary").trim();
  const secondary = cs.getPropertyValue("--secondary").trim();
  const accent = cs.getPropertyValue("--accent-color").trim() || "#ceb79e";
  return [
    primary ? `hsl(${primary})` : "#111111",
    secondary ? `hsl(${secondary})` : "#f5f5f5",
    accent,
    "#22c55e",
  ];
}

export default function CelebrationCheckmark({
  size = 88,
  playSound = true,
  className,
  checkColor = "#22c55e",
  confettiColors,
}: Props) {
  const palette = useMemo(() => confettiColors ?? resolveBrandPalette(), [confettiColors]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const distance = 70 + Math.random() * 30;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          rotate: Math.random() * 360,
          color: palette[i % palette.length],
          delay: 0.15 + Math.random() * 0.1,
        };
      }),
    [palette],
  );

  // Play a short, polite success chime (two-note arpeggio) using Web Audio so
  // we don't need to ship an audio file.
  useEffect(() => {
    if (!playSound) return;
    let ctx: AudioContext | null = null;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
      const now = ctx.currentTime;
      const tones = [
        { freq: 660, start: 0.0, dur: 0.18 },
        { freq: 988, start: 0.12, dur: 0.32 },
      ];
      tones.forEach(({ freq, start, dur }) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      });
    } catch {
      // Silent fallback — autoplay may be blocked on some browsers.
    }
    return () => {
      try { ctx?.close(); } catch { /* noop */ }
    };
  }, [playSound]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Confetti burst */}
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.5, 1, 0.6], rotate: p.rotate }}
          transition={{ duration: 1.1, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 7,
            height: 7,
            marginLeft: -3.5,
            marginTop: -3.5,
            background: p.color,
            borderRadius: 2,
            boxShadow: `0 0 8px ${p.color}`,
          }}
        />
      ))}

      {/* Pulsing halo */}
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0, opacity: 0.6 }}
        animate={{ scale: [0, 1.6, 2.2], opacity: [0.6, 0.25, 0] }}
        transition={{ duration: 1.0, ease: "easeOut" }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,197,94,0.45) 0%, rgba(34,197,94,0) 70%)",
        }}
      />

      {/* Checkmark */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: [0, 1.35, 0.95, 1.08, 1], rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 220,
          damping: 12,
          duration: 0.9,
        }}
        style={{
          position: "relative",
          filter: "drop-shadow(0 0 14px rgba(34,197,94,0.55))",
        }}
      >
        <CheckCircle2
          size={size}
          color={checkColor}
          strokeWidth={2.6}
          fill="rgba(34,197,94,0.12)"
        />
      </motion.div>
    </div>
  );
}
