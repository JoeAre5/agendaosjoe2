/**
 * SplashScreen
 * Minimalist full-screen splash shown during auth bootstrap and lazy-route
 * loading. Wordmark types itself out character-by-character. Tuned to
 * complete in ~700ms so it always finishes "CHARLIE'S BARBERSHOP" before
 * the splash unmounts, even on fast loads.
 */
import { useEffect, useState } from "react";

const FULL_TEXT = "CHARLIE'S BARBERSHOP";
const SPLIT_AT = "CHARLIE'S".length; // index where the second (light) word begins
const TYPE_INTERVAL_MS = 35; // 20 chars × 35ms ≈ 700ms per typing pass
const HOLD_AFTER_MS = 900;   // pause when fully typed before restarting


export function SplashScreen() {
  const [count, setCount] = useState(0);

  // Loop the typing animation continuously so users always see motion while
  // the app is bootstrapping (auth, lazy chunks, recovery reloads).
  useEffect(() => {
    if (count < FULL_TEXT.length) {
      const t = setTimeout(() => setCount((c) => c + 1), TYPE_INTERVAL_MS);
      return () => clearTimeout(t);
    }
    const hold = setTimeout(() => {
      // Restart: clear then re-type
      setCount(0);
    }, HOLD_AFTER_MS);
    return () => clearTimeout(hold);
  }, [count]);

  const shown = FULL_TEXT.slice(0, count);
  const boldPart = shown.slice(0, Math.min(count, SPLIT_AT));
  const lightPart = count > SPLIT_AT ? shown.slice(SPLIT_AT) : "";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: "var(--bg-base)",
        zIndex: 9999,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="flex items-baseline"
        style={{ minHeight: "1.5rem" }}
        aria-label="Charlie's Barbershop"
      >
        <span
          className="text-lg font-black tracking-tight whitespace-pre"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.5px" }}
        >
          {boldPart}
        </span>
        <span
          className="text-lg font-light whitespace-pre"
          style={{ color: "var(--text-secondary)" }}
        >
          {lightPart}
        </span>
        <span
          aria-hidden
          className="inline-block ml-0.5"
          style={{
            width: "2px",
            height: "1em",
            background: "var(--text-primary)",
            opacity: count >= FULL_TEXT.length ? 0 : 1,
            animation: "splash-caret-blink 0.8s steps(2, start) infinite",
            transform: "translateY(2px)",
          }}
        />
      </div>
      <style>{`
        @keyframes splash-caret-blink {
          to { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
