/**
 * Mounts once at the App root. Captures `?ref=<code>` on every navigation
 * and persists for 90 days via cookie + localStorage.
 *
 * Renders nothing.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureRefFromUrl } from "@/lib/referral";

export function RefCapture() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!search || !search.includes("ref=")) return;
    captureRefFromUrl();
  }, [pathname, search]);

  return null;
}
