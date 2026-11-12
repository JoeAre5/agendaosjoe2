import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useUrlState — primitive for reading/writing a single URL search param as state.
 *
 * - Reads from `useSearchParams` on every render (covers fresh mount + bfcache restore).
 * - Setter writes to URL via `setSearchParams`. Defaults to `replace: true` so
 *   day-to-day toggles do not pollute browser history.
 * - If a `validator` is provided and the URL value fails it, returns `defaultValue`.
 * - Setting to `null` removes the param entirely.
 *
 * Example:
 *   const [clientId, setClientId] = useUrlState<string>("client", { defaultValue: null });
 */
export function useUrlState<T extends string>(
  key: string,
  options: {
    defaultValue: T | null;
    validator?: (value: string) => value is T;
    replace?: boolean;
  },
): [T | null, (value: T | null) => void] {
  const { defaultValue, validator, replace = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);
  let value: T | null = defaultValue;
  if (raw !== null) {
    if (validator) {
      value = validator(raw) ? raw : defaultValue;
    } else {
      value = raw as T;
    }
  }

  const setValue = useCallback(
    (next: T | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === null || next === "") {
            params.delete(key);
          } else {
            params.set(key, next);
          }
          return params;
        },
        { replace },
      );
    },
    [key, replace, setSearchParams],
  );

  return [value, setValue];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): value is string {
  return UUID_RE.test(value);
}

/** Positive integer string, e.g. "12345" — used for Acuity calendar/addon IDs. */
export function isNumericString(value: string): value is string {
  return /^\d+$/.test(value);
}

/** Signed integer string, e.g. "-3" or "12345" — used for Acuity service IDs
 *  where local-only services have synthetic negative ids. */
export function isSignedNumericString(value: string): value is string {
  return /^-?\d+$/.test(value);
}

/** Comma-separated positive integers, e.g. "1,2,3" — used for Acuity addon lists. */
export function isCommaSeparatedNumericList(value: string): value is string {
  return /^\d+(,\d+)*$/.test(value);
}

/** YYYY-MM-DD date, e.g. "2026-04-21". */
export function isIsoDate(value: string): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Acuity ISO datetime with offset, e.g. "2026-04-22T14:30:00-0400".
 *  Only validates shape — actual time-slot existence is validated downstream. */
export function isAcuityDatetime(value: string): value is string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}
