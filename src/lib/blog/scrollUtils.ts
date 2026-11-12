/**
 * Shared rAF-based scroll tween for the blog reader.
 * Native `window.scrollTo({ behavior: "smooth" })` is too fast and inconsistent
 * across browsers (especially for tall articles), so we drive the scroll
 * manually with easeOutCubic for a controlled, cinematic motion.
 */

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function tweenScrollToY(targetY: number, durationMs = 800) {
  if (typeof window === "undefined") return;
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) return;
  const start = performance.now();

  const step = (now: number) => {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / durationMs);
    const y = startY + delta * easeOutCubic(t);
    window.scrollTo(0, y);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function tweenScrollToTop(durationMs = 800) {
  tweenScrollToY(0, durationMs);
}
