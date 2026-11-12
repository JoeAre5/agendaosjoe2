/**
 * usePersistentState — useState backed by localStorage with debounced writes.
 *
 * - All keys are auto-namespaced with `agendaos.` to avoid cross-app collisions.
 * - Reads synchronously on mount; falls back to defaultValue on parse errors.
 * - Writes debounced 500ms to keep the main thread responsive.
 *
 * Used by Calendar (hidden barbers), Clients (filters), and as a backup layer
 * for state that primarily lives in the URL (calendar date).
 */
import { useEffect, useRef, useState } from "react";

const PREFIX = "agendaos.";

export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `${PREFIX}${key}`;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  // Debounced write — collapses rapid updates into a single localStorage write
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Quota exceeded or private mode — silently ignore
      }
    }, 500);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [storageKey, value]);

  return [value, setValue];
}

/** Imperative read — useful for one-shot initial state derivation. */
export function readPersistent<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/** Imperative write — for code paths outside React. */
export function writePersistent<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}
