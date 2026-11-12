// Lightweight client tracker for blog interactions.
// Writes directly to public.blog_analytics_events via the anon RLS insert policy.
// Best-effort: failures are swallowed to never block the reader UI.
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "blog.session.id";
const SOURCE_KEY = "blog.last.source";
const SOURCE_TS_KEY = "blog.last.source.ts";
const SOURCE_TTL_MS = 30 * 60 * 1000; // 30 min

export type BlogEventType =
  | "view"
  | "scroll_25"
  | "scroll_50"
  | "scroll_75"
  | "read_complete"
  | "prev_click"
  | "next_click"
  | "related_click"
  | "share"
  | "snapshot_click"
  | "cta_click"
  | "subscribe_from_post"
  | "toc_click"
  | "listen_play"
  | "exit";

export type BlogSource =
  | "email"
  | "headlines"
  | "home"
  | "post"
  | "search"
  | "social"
  | "direct"
  | "external";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** Resolve traffic source from URL params, sessionStorage cache, or referrer. */
export function resolveSource(): BlogSource {
  try {
    const url = new URL(window.location.href);
    const u = (url.searchParams.get("utm_source") || url.searchParams.get("src") || "").toLowerCase();
    if (u) {
      const map: Record<string, BlogSource> = {
        email: "email",
        newsletter: "email",
        headlines: "headlines",
        titulares: "headlines",
        home: "home",
        social: "social",
        ig: "social",
        fb: "social",
        x: "social",
        whatsapp: "social",
        wa: "social",
      };
      const mapped = map[u] ?? (u as BlogSource);
      sessionStorage.setItem(SOURCE_KEY, mapped);
      sessionStorage.setItem(SOURCE_TS_KEY, String(Date.now()));
      return mapped;
    }
    const cachedTs = Number(sessionStorage.getItem(SOURCE_TS_KEY) || 0);
    const cached = sessionStorage.getItem(SOURCE_KEY) as BlogSource | null;
    if (cached && Date.now() - cachedTs < SOURCE_TTL_MS) return cached;

    const ref = document.referrer || "";
    if (!ref) return "direct";
    const here = window.location.host;
    const refHost = (() => { try { return new URL(ref).host; } catch { return ""; } })();
    if (refHost && refHost !== here) {
      if (/google|bing|duckduckgo|yahoo/i.test(refHost)) return "search";
      if (/instagram|facebook|tiktok|twitter|x\.com|threads|linkedin|whatsapp|t\.co/i.test(refHost)) return "social";
      return "external";
    }
    if (ref.includes("/titulares/") && window.location.pathname.includes("/titulares/")) return "post";
    if (ref.includes("/titulares")) return "headlines";
    if (refHost === here) return "home";
    return "direct";
  } catch {
    return "direct";
  }
}

interface TrackOpts {
  postId?: string | null;
  source?: BlogSource;
  language?: string;
  scrollDepth?: number;
  timeOnPageMs?: number;
  metadata?: Record<string, unknown>;
}

export function trackBlogEvent(eventType: BlogEventType, opts: TrackOpts = {}): void {
  try {
    const payload = {
      post_id: opts.postId ?? null,
      event_type: eventType,
      source: opts.source ?? resolveSource(),
      session_id: getSessionId(),
      language: opts.language ?? null,
      scroll_depth: opts.scrollDepth ?? null,
      time_on_page_ms: opts.timeOnPageMs ?? null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      path: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: opts.metadata ?? {},
    };
    // Fire-and-forget; .then() is required to actually execute the request
    // (the PostgrestFilterBuilder is thenable and only fires on .then/await).
    supabase.from("blog_analytics_events").insert(payload as any).then(() => {}, () => {});
  } catch {
    /* noop */
  }
}
