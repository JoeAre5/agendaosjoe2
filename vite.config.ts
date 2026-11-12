import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function appBootGuard() {
  return {
    name: "agendaos-app-boot-guard",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          injectTo: "head-prepend" as const,
          children: `
(function () {
  var KEY = "agendaos.boot-recovery-at";
  var COOLDOWN = 30000;
  function text(error) {
    if (!error) return "";
    if (typeof error === "string") return error;
    return [error.name, error.message, error.stack, error.reason, error.error].filter(Boolean).join(" ");
  }
  function recoverable(error) {
    var value = text(error).toLowerCase();
    return ["failed to fetch dynamically imported module", "error loading dynamically imported module", "importing a module script failed", "chunkloaderror", "loading chunk", "module script load failed", "vite:preloaderror", "cannot read properties of undefined (reading 'usestate')", "cannot access 'react' before initialization"].some(function (needle) { return value.indexOf(needle) !== -1; });
  }
  function recover(error, source) {
    if (!recoverable(error)) return false;
    try {
      var now = Date.now();
      var last = Number(sessionStorage.getItem(KEY) || "0");
      if (now - last < COOLDOWN) return false;
      sessionStorage.setItem(KEY, String(now));
    } catch (_) {}
    console.warn("[boot-recovery] Reloading after startup failure (" + source + ")", error);
    var jobs = [];
    if ("caches" in window) jobs.push(caches.keys().then(function (keys) { return Promise.all(keys.map(function (key) { return caches.delete(key); })); }));
    if ("serviceWorker" in navigator) jobs.push(navigator.serviceWorker.getRegistrations().then(function (registrations) { return Promise.all(registrations.map(function (registration) { return registration.update(); })); }));
    Promise.allSettled(jobs).finally(function () { window.location.reload(); });
    return true;
  }
  window.addEventListener("error", function (event) { recover(event.error || event.message, "window-error"); }, true);
  window.addEventListener("unhandledrejection", function (event) { if (recover(event.reason, "unhandledrejection")) event.preventDefault(); });
  window.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      var root = document.getElementById("root");
      if (!window.__AGENDAOS_APP_BOOTED && root && root.childElementCount === 0) {
        recover({ name: "EmptyRoot", message: "React app did not mount" }, "empty-root");
      }
    }, 8000);
  });
})();`,
        },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [appBootGuard(), react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.includes("commonjsHelpers")) return "vendor-react";
          if (!normalizedId.includes("node_modules")) return undefined;
          if (normalizedId.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)\//)) {
            return "vendor-react";
          }
          if (id.includes("@stripe/")) return "vendor-stripe";
          if (id.includes("@paypal/")) return "vendor-paypal";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@tiptap/")) return "vendor-editor";
          if (id.match(/node_modules\/date-fns(?:-tz)?\//)) return "vendor-date";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
