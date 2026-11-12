/**
 * Admin → Titulares → Analytics
 *
 * Comprehensive blog/newsletter performance dashboard powered by
 * `blog_analytics_events` (raw event log) + `blog_posts` (totals) +
 * `clients` (newsletter subscribers).
 *
 * Sections:
 *   1. Time-range filter (24h / 7d / 30d / 90d / all)
 *   2. KPIs: views, unique sessions, avg time on page, read-through rate,
 *      newsletter subs in range, share count, prev/next CTR.
 *   3. Traffic sources breakdown (email, headlines, home, search, social, etc.)
 *   4. Top 10 posts by views (with read-through %, shares, prev/next clicks)
 *   5. Subscriber growth (rolling cumulative line)
 *   6. Funnel: views → 25% → 50% → 75% → completion
 *   7. Engagement events table (snapshot/share/CTA)
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Eye, Users, Clock, Share2, ArrowLeftRight, MousePointerClick, Mail } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";

type Range = "24h" | "7d" | "30d" | "90d" | "all";

interface RawEvent {
  id: string;
  post_id: string | null;
  event_type: string;
  source: string | null;
  session_id: string;
  language: string | null;
  scroll_depth: number | null;
  time_on_page_ms: number | null;
  created_at: string;
}

interface PostMeta {
  id: string;
  title: string;
  title_en: string | null;
  slug: string;
  view_count: number | null;
  published_at: string | null;
  category: string | null;
}

interface Subscriber {
  id: string;
  newsletter_opt_in_at: string | null;
}

const RANGES: { key: Range; label_es: string; label_en: string; days: number | null }[] = [
  { key: "24h", label_es: "24h", label_en: "24h", days: 1 },
  { key: "7d", label_es: "7 días", label_en: "7 days", days: 7 },
  { key: "30d", label_es: "30 días", label_en: "30 days", days: 30 },
  { key: "90d", label_es: "90 días", label_en: "90 days", days: 90 },
  { key: "all", label_es: "Todo", label_en: "All time", days: null },
];

function startOfRange(range: Range): string | null {
  const r = RANGES.find((x) => x.key === range);
  if (!r?.days) return null;
  const d = new Date();
  d.setDate(d.getDate() - r.days);
  return d.toISOString();
}

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtMs(ms: number) { const s = Math.round(ms / 1000); if (s < 60) return `${s}s`; return `${Math.floor(s / 60)}m ${s % 60}s`; }

export default function TitularesAnalytics() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [range, setRange] = useState<Range>("30d");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const since = startOfRange(range);
    (async () => {
      const evQ = supabase
        .from("blog_analytics_events")
        .select("id, post_id, event_type, source, session_id, language, scroll_depth, time_on_page_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (since) evQ.gte("created_at", since);
      const subsQ = supabase
        .from("clients")
        .select("id, newsletter_opt_in_at")
        .eq("newsletter_opt_in", true)
        .order("newsletter_opt_in_at", { ascending: true });
      const postsQ = supabase
        .from("blog_posts")
        .select("id, title, title_en, slug, view_count, published_at, category")
        .eq("is_published", true);

      const [evRes, subRes, postRes] = await Promise.all([evQ, subsQ, postsQ]);
      if (cancelled) return;
      setEvents((evRes.data as RawEvent[]) || []);
      setSubs((subRes.data as Subscriber[]) || []);
      setPosts((postRes.data as PostMeta[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const postById = useMemo(() => {
    const m = new Map<string, PostMeta>();
    posts.forEach((p) => m.set(p.id, p));
    return m;
  }, [posts]);

  const kpis = useMemo(() => {
    const views = events.filter((e) => e.event_type === "view");
    const sessions = new Set(views.map((e) => e.session_id));
    const completes = events.filter((e) => e.event_type === "read_complete").length;
    const shares = events.filter((e) => e.event_type === "share").length;
    const prevC = events.filter((e) => e.event_type === "prev_click").length;
    const nextC = events.filter((e) => e.event_type === "next_click").length;
    const ctaC = events.filter((e) => e.event_type === "cta_click").length;
    const exits = events.filter((e) => e.event_type === "exit" && (e.time_on_page_ms ?? 0) > 0);
    const avgMs = exits.length ? exits.reduce((s, e) => s + (e.time_on_page_ms ?? 0), 0) / exits.length : 0;
    const since = startOfRange(range);
    const subsInRange = subs.filter((s) => {
      if (!s.newsletter_opt_in_at) return false;
      if (!since) return true;
      return s.newsletter_opt_in_at >= since;
    }).length;
    const readThrough = views.length ? (completes / views.length) * 100 : 0;
    const navCtr = views.length ? ((prevC + nextC) / views.length) * 100 : 0;
    return {
      views: views.length,
      sessions: sessions.size,
      avgMs,
      readThrough,
      shares,
      prevC,
      nextC,
      ctaC,
      navCtr,
      subsInRange,
      totalSubs: subs.length,
    };
  }, [events, subs, range]);

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    events.filter((e) => e.event_type === "view").forEach((e) => {
      const s = e.source || "direct";
      map.set(s, (map.get(s) || 0) + 1);
    });
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const topPosts = useMemo(() => {
    const map = new Map<string, { views: number; completes: number; shares: number; nav: number }>();
    events.forEach((e) => {
      if (!e.post_id) return;
      const cur = map.get(e.post_id) || { views: 0, completes: 0, shares: 0, nav: 0 };
      if (e.event_type === "view") cur.views += 1;
      if (e.event_type === "read_complete") cur.completes += 1;
      if (e.event_type === "share") cur.shares += 1;
      if (e.event_type === "prev_click" || e.event_type === "next_click") cur.nav += 1;
      map.set(e.post_id, cur);
    });
    return Array.from(map.entries())
      .map(([id, stats]) => ({ id, post: postById.get(id), ...stats }))
      .filter((x) => x.post)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [events, postById]);

  const funnel = useMemo(() => {
    const types = ["view", "scroll_25", "scroll_50", "scroll_75", "read_complete"] as const;
    return types.map((t) => ({ stage: t, count: events.filter((e) => e.event_type === t).length }));
  }, [events]);

  const subsTimeline = useMemo(() => {
    // Cumulative subscribers per day in range
    const since = startOfRange(range);
    const filtered = subs.filter((s) => s.newsletter_opt_in_at && (!since || s.newsletter_opt_in_at >= since));
    const buckets = new Map<string, number>();
    filtered.forEach((s) => {
      const day = (s.newsletter_opt_in_at || "").slice(0, 10);
      buckets.set(day, (buckets.get(day) || 0) + 1);
    });
    const sorted = Array.from(buckets.entries()).sort();
    let cum = 0;
    return sorted.map(([day, n]) => { cum += n; return { day, n, cum }; });
  }, [subs, range]);

  const sourceColors: Record<string, string> = {
    email: "#a08060", headlines: "#22c55e", home: "#3b82f6", post: "#f59e0b",
    search: "#a855f7", social: "#ec4899", direct: "#6b7280", external: "#94a3b8",
  };

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Analíticas" : "Analytics"}
        subtitle={es ? "Rendimiento real de cada artículo y suscriptor." : "Real performance for every post and subscriber."}
        onBack={() => navigate("/admin/titulares")}
      />
      <div className="px-4 pb-3" style={{ background: "var(--bg-base)" }}>

        {/* Range pills */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto no-scrollbar -mx-4 px-4">
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className="px-3 h-8 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0"
                style={{
                  background: active ? "var(--cta-bg)" : "var(--bg-surface-2)",
                  color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                  border: active ? "none" : "1px solid var(--divider)",
                }}
              >
                {es ? r.label_es : r.label_en}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Cargando…" : "Loading…"}
        </div>
      ) : (
        <div className="px-4 pb-12 space-y-6">
          {/* KPIs */}
          <section className="grid grid-cols-2 gap-2.5">
            <KpiCard icon={Eye} label={es ? "Vistas" : "Views"} value={kpis.views.toLocaleString()} />
            <KpiCard icon={Users} label={es ? "Sesiones únicas" : "Unique sessions"} value={kpis.sessions.toLocaleString()} />
            <KpiCard icon={Clock} label={es ? "Tiempo promedio" : "Avg time on page"} value={fmtMs(kpis.avgMs)} />
            <KpiCard icon={BarChart3} label={es ? "Lectura completa" : "Read-through"} value={fmtPct(kpis.readThrough)} />
            <KpiCard icon={Share2} label={es ? "Compartidos" : "Shares"} value={kpis.shares.toLocaleString()} />
            <KpiCard icon={ArrowLeftRight} label={es ? "Nav. siguiente/anterior" : "Prev/next CTR"} value={fmtPct(kpis.navCtr)} />
            <KpiCard icon={MousePointerClick} label={es ? "Clicks en CTA" : "CTA clicks"} value={kpis.ctaC.toLocaleString()} />
            <KpiCard icon={Mail} label={es ? "Suscriptores nuevos" : "New subscribers"} value={`+${kpis.subsInRange}`} sub={`${kpis.totalSubs} ${es ? "totales" : "total"}`} />
          </section>

          {/* Sources */}
          <section className="card-elevated rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {es ? "Fuentes de tráfico" : "Traffic sources"}
            </h2>
            {sources.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{es ? "Sin datos en este rango." : "No data in this range."}</p>
            ) : (
              <div className="space-y-2.5">
                {sources.map((s) => (
                  <div key={s.source}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="capitalize font-semibold" style={{ color: "var(--text-primary)" }}>{s.source}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>{s.count.toLocaleString()} · {fmtPct(s.pct)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: sourceColors[s.source] || "var(--accent-color)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Funnel */}
          <section className="card-elevated rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {es ? "Embudo de lectura" : "Reading funnel"}
            </h2>
            <div className="space-y-2">
              {funnel.map((f, idx) => {
                const top = funnel[0].count || 1;
                const pct = (f.count / top) * 100;
                const labels: Record<string, { es: string; en: string }> = {
                  view: { es: "Vista inicial", en: "Initial view" },
                  scroll_25: { es: "Llega al 25%", en: "Reached 25%" },
                  scroll_50: { es: "Llega al 50%", en: "Reached 50%" },
                  scroll_75: { es: "Llega al 75%", en: "Reached 75%" },
                  read_complete: { es: "Lectura completa", en: "Completed read" },
                };
                const lbl = labels[f.stage];
                return (
                  <div key={f.stage}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{es ? lbl.es : lbl.en}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>{f.count.toLocaleString()} · {fmtPct(pct)}</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: idx === 0 ? "#3b82f6" : idx === 4 ? "#22c55e" : "var(--accent-color)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top posts */}
          <section className="card-elevated rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {es ? "Top 10 artículos" : "Top 10 posts"}
            </h2>
            {topPosts.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{es ? "Sin datos." : "No data."}</p>
            ) : (
              <div className="space-y-3">
                {topPosts.map((p, i) => {
                  const t = es ? p.post!.title : (p.post!.title_en || p.post!.title);
                  const through = p.views ? (p.completes / p.views) * 100 : 0;
                  return (
                    <div key={p.id} className="divider-hairline-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2 mb-1.5">
                        <span className="text-[10px] font-black tabular-nums w-5 mt-0.5" style={{ color: "var(--text-tertiary)" }}>{i + 1}</span>
                        <span className="text-[13px] font-bold leading-snug flex-1" style={{ color: "var(--text-primary)" }}>{t}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 ml-7 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        <span><Eye size={10} className="inline mr-0.5" /> {p.views}</span>
                        <span><BarChart3 size={10} className="inline mr-0.5" /> {fmtPct(through)}</span>
                        <span><Share2 size={10} className="inline mr-0.5" /> {p.shares}</span>
                        <span><ArrowLeftRight size={10} className="inline mr-0.5" /> {p.nav}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Subscriber growth */}
          <section className="card-elevated rounded-2xl p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {es ? "Crecimiento de suscriptores" : "Subscriber growth"}
            </h2>
            {subsTimeline.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{es ? "Sin nuevos suscriptores en este rango." : "No new subscribers in this range."}</p>
            ) : (
              <div>
                <SparkLine data={subsTimeline.map((d) => d.cum)} />
                <div className="flex items-center justify-between text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                  <span>{subsTimeline[0]?.day}</span>
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>+{kpis.subsInRange} {es ? "nuevos" : "new"}</span>
                  <span>{subsTimeline[subsTimeline.length - 1]?.day}</span>
                </div>
              </div>
            )}
          </section>

          <p className="text-[10px] text-center pt-2" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Datos en vivo. Excluye bots cuando es posible." : "Live data. Bots excluded when detectable."}
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="card-elevated rounded-2xl p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: "var(--text-tertiary)" }} className="icon-bold" />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      </div>
      <div className="text-lg font-black tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>{value}</div>
      {sub ? <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sub}</div> : null}
    </div>
  );
}

function SparkLine({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-16 flex items-center justify-center text-xs" style={{ color: "var(--text-tertiary)" }}>—</div>;
  const w = 360, h = 64, pad = 4;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(1, max - min);
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => `${pad + i * step},${h - pad - ((v - min) / range) * (h - pad * 2)}`).join(" ");
  const last = pts.split(" ").slice(-1)[0];
  const [lx, ly] = last.split(",").map(Number);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <polyline fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <circle cx={lx} cy={ly} r="3" fill="var(--accent-color)" />
    </svg>
  );
}
