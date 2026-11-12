const RECOVERY_KEY = "agendaos.app-load-recovery-at";
const RECOVERY_COOLDOWN_MS = 30_000;

function stringifyError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${error.stack ?? ""}`;
  }
  if (typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    return [
      anyError.name,
      anyError.message,
      anyError.stack,
      anyError.reason,
      anyError.error,
      anyError.payload,
      String(error),
    ]
      .filter(Boolean)
      .map(String)
      .join(" ");
  }
  return String(error);
}

export function isRecoverableAppLoadError(error: unknown): boolean {
  const text = stringifyError(error).toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "chunkloaderror",
    "loading chunk",
    "module script load failed",
    "vite:preloaderror",
    "cannot read properties of undefined (reading 'usestate')",
    "cannot access 'react' before initialization",
  ].some((needle) => text.includes(needle));
}

async function clearBrowserRuntimeCaches() {
  const jobs: Promise<unknown>[] = [];

  if ("caches" in window) {
    jobs.push(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }

  if ("serviceWorker" in navigator) {
    jobs.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.update())))
    );
  }

  await Promise.allSettled(jobs);
}

export function recoverFromAppLoadError(error: unknown, source = "runtime"): boolean {
  if (!isRecoverableAppLoadError(error)) return false;

  try {
    const lastRecoveryAt = Number(sessionStorage.getItem(RECOVERY_KEY) || "0");
    const now = Date.now();
    if (now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return false;
    sessionStorage.setItem(RECOVERY_KEY, String(now));
  } catch {
    // If storage is blocked, still attempt one recovery for this page lifecycle.
  }

  console.warn(`[app-recovery] Recovering from stale app bundle (${source})`, error);
  void clearBrowserRuntimeCaches().finally(() => window.location.reload());
  return true;
}

export function installAppLoadRecovery() {
  window.addEventListener("vite:preloadError", ((event: Event) => {
    event.preventDefault();
    const preloadEvent = event as CustomEvent<{ error?: unknown }>;
    recoverFromAppLoadError({ name: "vite:preloadError", payload: preloadEvent.detail }, "vite-preload");
  }) as EventListener);

  window.addEventListener("unhandledrejection", (event) => {
    if (recoverFromAppLoadError(event.reason, "unhandledrejection")) {
      event.preventDefault();
    }
  });

  window.addEventListener(
    "error",
    (event) => {
      recoverFromAppLoadError(event.error || event.message, "window-error");
    },
    true
  );
}
