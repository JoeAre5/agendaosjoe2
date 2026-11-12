// Shared interaction feedback: haptic vibration + soft click sound.
// Used by all toggles, switches, and on/off controls across the app so every
// state change feels tactile and confirms with a subtle native-style click.
//
// - Haptics: uses navigator.vibrate when available (Android, most PWAs).
// - Sound: synthesizes a tiny click via WebAudio (no asset, no network).
// - Respects prefers-reduced-motion and a runtime mute flag.

let audioCtx: AudioContext | null = null;
let muted = false;

const STORAGE_KEY = "ui.feedbackMuted";

if (typeof window !== "undefined") {
  try {
    muted = window.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
}

export function setFeedbackMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage?.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isFeedbackMuted() {
  return muted;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (muted) return null;
  if (audioCtx) return audioCtx;
  const Ctor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function playClick(opts: { frequency?: number; duration?: number; gain?: number } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const { frequency = 880, duration = 0.04, gain = 0.06 } = opts;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch {
    /* ignore */
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** Generic light tap — use for most buttons / chips. */
export function tapFeedback() {
  vibrate(8);
  playClick({ frequency: 760, duration: 0.035, gain: 0.05 });
}

/**
 * Toggle / switch flip. `on` controls the pitch so users hear the direction:
 * higher tone when turning on, lower tone when turning off.
 */
export function toggleFeedback(on: boolean) {
  vibrate(on ? [8, 14, 10] : 12);
  playClick({
    frequency: on ? 980 : 540,
    duration: 0.05,
    gain: 0.07,
  });
}

/** Selection change in a segmented control / picker. */
export function selectFeedback() {
  vibrate(6);
  playClick({ frequency: 700, duration: 0.03, gain: 0.045 });
}
