import { useEffect, useState } from "react";

/**
 * ReadingProgress — fixed top progress bar that tracks how far the user has
 * scrolled through the current article. Light mode: black. Dark mode: accent.
 */
export function ReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      const p = total > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / total) * 100)) : 0;
      setPct(p);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ height: 3 }}
    >
      <div
        className="h-full transition-[width] duration-75 ease-out reading-progress-bar"
        style={{ width: `${pct}%` }}
      />
      <style>{`
        .reading-progress-bar { background: #000000; }
        .dark .reading-progress-bar { background: var(--accent-color); }
      `}</style>
    </div>
  );
}
