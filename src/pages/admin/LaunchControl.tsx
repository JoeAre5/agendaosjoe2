/**
 * Admin → Launch Control (/admin/launch)
 *
 * Owner-only. Live pre-launch dashboard:
 *  • Toggle public site between Coming Soon and live (real-time, no deploy).
 *  • Live checklist of every phase before launch — items are marked done
 *    by the AI assistant ONLY (no self-check). Owner can add/edit/delete
 *    custom items (e.g. "Integrate AI agent").
 *  • Rehearsal countdown (5-min temporary live flip — auto-revert).
 *  • Mirror routes + post-launch backlog kept for context.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Rocket, Eye, AlertTriangle, ExternalLink,
  CheckCircle2, Circle, Clock, Lock, Plus, Pencil, Trash2, X, Inbox, Copy, Check,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

type Status = "pending" | "in_review" | "done" | "blocked";

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  status: Status;
  weight: number;
  sort_order: number;
  confirmed_at: string | null;
  confirmed_by_note: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  pre_launch: "Pre-launch · Formularios y bandeja",
  public_site: "Sitio público",
  client_app: "App del cliente",
  launch_day: "Día del launch",
  custom: "Items personalizados",
};

const CATEGORY_ORDER = ["pre_launch", "public_site", "client_app", "launch_day", "custom"];

const INTERCEPTED_ROUTES = [
  { path: "/", label: "Home" },
  { path: "/citas", label: "Booking" },
  { path: "/citas/jose", label: "Booking · José" },
  { path: "/unete", label: "Únete al equipo" },
  { path: "/contacto", label: "Contacto" },
  { path: "/servicios/cortes", label: "Servicios · Cortes" },
  { path: "/servicios/barba", label: "Servicios · Barba" },
  { path: "/servicios/experiencias", label: "Servicios · Experiencias" },
];

const POST_LAUNCH = [
  "Online Waitlist (v2): client-facing waitlist with auto-notify on cancellations (separate from in-shop walk-in waitlist)",
  "White-label admin app: replicate AgendaOS for other barbershops with their branding",
  "Inbox Phase 2: email reply threads (native)",
  "Marketing Phase 3: drip sequences + segments (native)",
  "Stripe 3DS / requires_action handling",
  "Real gateway fees from Stripe balance_transaction.fee",
  "Visible cancellation/refund policy on paywall",
  "\"Expired by system\" status flag for auto-cancelled appointments",
  "Apple Pay / Google Pay via Stripe Payment Request Button",
  "Resend payment link on abandonment",
  "Abandonment metrics dashboard",
];

function statusIcon(status: Status) {
  if (status === "done") return <CheckCircle2 size={16} style={{ color: "#22c55e" }} className="shrink-0" />;
  if (status === "in_review") return <Clock size={16} style={{ color: "#f59e0b" }} className="shrink-0" />;
  if (status === "blocked") return <AlertTriangle size={16} style={{ color: "#ef4444" }} className="shrink-0" />;
  return <Circle size={16} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />;
}

export default function LaunchControl() {
  const navigate = useNavigate();
  const [live, setLive] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showConfirm, setShowConfirm] = useState<"on" | "off" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Checklist state
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [adding, setAdding] = useState(false);

  // Rehearsal countdown
  const [rehearsalEnd, setRehearsalEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const rehearsalTimer = useRef<number | null>(null);

  async function loadFlag() {
    const { data, error } = await supabase
      .from("app_flags")
      .select("public_site_live, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) setErr(error.message);
    setLive(Boolean(data?.public_site_live));
    setUpdatedAt(data?.updated_at ?? null);
    setLoading(false);
  }

  async function loadChecklist() {
    const { data, error } = await supabase
      .from("launch_checklist")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) { setErr(error.message); return; }
    setItems((data ?? []) as ChecklistItem[]);
  }

  useEffect(() => {
    loadFlag();
    loadChecklist();
    const ch = supabase
      .channel("launch-control")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_flags" }, () => loadFlag())
      .on("postgres_changes", { event: "*", schema: "public", table: "launch_checklist" }, () => loadChecklist())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Rehearsal ticker
  useEffect(() => {
    if (!rehearsalEnd) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [rehearsalEnd]);

  // Auto-revert rehearsal
  useEffect(() => {
    if (!rehearsalEnd) return;
    if (Date.now() >= rehearsalEnd) {
      setRehearsalEnd(null);
      flip(false, true);
    }
  }, [now, rehearsalEnd]);

  async function flip(target: boolean, silent = false) {
    if (!silent) setWorking(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_flags")
      .update({ public_site_live: target, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
      .eq("id", true);
    if (error) setErr(error.message);
    if (!silent) {
      setShowConfirm(null);
      setWorking(false);
    }
    await loadFlag();
  }

  async function startRehearsal() {
    await flip(true, true);
    setRehearsalEnd(Date.now() + 5 * 60 * 1000);
  }
  async function cancelRehearsal() {
    setRehearsalEnd(null);
    await flip(false, true);
  }

  // Group + progress
  const grouped = useMemo(() => {
    const g: Record<string, ChecklistItem[]> = {};
    for (const it of items) {
      (g[it.category] ??= []).push(it);
    }
    return g;
  }, [items]);

  const progress = useMemo(() => {
    if (!items.length) return 0;
    const totalW = items.reduce((s, i) => s + i.weight, 0);
    const doneW = items.filter(i => i.status === "done").reduce((s, i) => s + i.weight, 0);
    return Math.round((doneW / totalW) * 100);
  }, [items]);

  async function deleteItem(id: string) {
    if (!confirm("¿Borrar este item?")) return;
    const { error } = await supabase.from("launch_checklist").delete().eq("id", id);
    if (error) alert(error.message);
  }

  const remainingMs = rehearsalEnd ? Math.max(0, rehearsalEnd - now) : 0;
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000).toString().padStart(2, "0");

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title="Launch Control"
        subtitle="Pre-launch en tiempo real. La IA marca cada fase como completada — tú confirmas conmigo en chat."
        onBack={() => navigate("/admin")}
      />

      <div className="px-4 pb-12 space-y-4">
        {/* Status card */}
        <div className="rounded-2xl p-5 card-elevated">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: live ? "#22c55e" : "#ceb79e", boxShadow: `0 0 0 4px ${live ? "rgba(34,197,94,0.18)" : "rgba(206,183,158,0.18)"}` }}
            />
            <span className="text-xs uppercase tracking-wider font-bold" style={{ color: "var(--text-tertiary)" }}>
              Estado actual
            </span>
          </div>
          <h2 className="text-2xl font-black mb-1" style={{ color: "var(--text-primary)" }}>
            {loading ? "…" : live ? "Sitio público EN VIVO" : "Sitio en Coming Soon"}
          </h2>
          {updatedAt && (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Última actualización: {new Date(updatedAt).toLocaleString("es-PR")}
            </p>
          )}
          {err && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{err}</p>}
        </div>

        {/* Action button */}
        {!loading && !rehearsalEnd && (
          <button
            onClick={() => setShowConfirm(live ? "off" : "on")}
            disabled={working}
            className="w-full rounded-2xl px-5 py-4 font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: live ? "var(--bg-surface-2)" : "var(--accent-color)",
              color: live ? "var(--text-primary)" : "var(--cta-fg)",
              border: live ? "1px solid var(--divider)" : "none",
            }}
          >
            {live ? <><Eye size={18} className="icon-bold" />Volver a Coming Soon</> : <><Rocket size={18} className="icon-bold" />Lanzar el sitio público</>}
          </button>
        )}

        {/* Rehearsal */}
        {!loading && (
          <div className="rounded-2xl p-4 card-elevated">
            <div className="flex items-start gap-2 mb-2">
              <Clock size={16} style={{ color: "var(--accent-color)" }} className="icon-bold mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Ensayo nocturno (5 min)</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  Activa el sitio temporalmente y vuelve solo a Coming Soon.
                </p>
              </div>
            </div>
            {rehearsalEnd ? (
              <>
                <div className="text-center my-3">
                  <div className="text-3xl font-black tabular-nums" style={{ color: "var(--accent-color)" }}>
                    {remainingMin}:{remainingSec}
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>tiempo restante en vivo</p>
                </div>
                <button
                  onClick={cancelRehearsal}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-bold"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  Cortar ahora
                </button>
              </>
            ) : (
              <button
                onClick={startRehearsal}
                disabled={working || live === true}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              >
                Empezar ensayo
              </button>
            )}
          </div>
        )}

        {/* Checklist */}
        <div className="rounded-2xl p-4 card-elevated">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Checklist pre-launch
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Lock size={11} style={{ color: "var(--text-tertiary)" }} />
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Solo lectura — la IA marca cuando confirmamos en chat
                </p>
              </div>
            </div>
            <button
              onClick={() => setAdding(true)}
              className="rounded-full p-2 active:scale-95"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
              aria-label="Add"
            >
              <Plus size={14} className="icon-bold" />
            </button>
          </div>

          {/* Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              <span>Progreso</span>
              <span className="tabular-nums font-bold">{progress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: "var(--accent-color)" }} />
            </div>
          </div>

          {/* Groups */}
          <div className="space-y-4">
            {CATEGORY_ORDER.filter(c => grouped[c]?.length).map((cat) => (
              <div key={cat}>
                <h4 className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: "var(--text-tertiary)" }}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </h4>
                <div className="space-y-1.5">
                  {grouped[cat].map((it) => (
                    <div
                      key={it.id}
                      className="flex items-start gap-2 py-1.5"
                    >
                      {statusIcon(it.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{it.title}</p>
                        {it.description && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{it.description}</p>
                        )}
                        {it.confirmed_at && (
                          <p className="text-[10px] mt-0.5" style={{ color: "#22c55e" }}>
                            ✓ {new Date(it.confirmed_at).toLocaleString("es-PR")}
                            {it.confirmed_by_note ? ` · ${it.confirmed_by_note}` : ""}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setEditing(it)}
                        className="p-1 active:opacity-70"
                        style={{ color: "var(--text-tertiary)" }}
                        aria-label="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => deleteItem(it.id)}
                        className="p-1 active:opacity-70"
                        style={{ color: "#ef4444" }}
                        aria-label="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bandeja shortcut */}
        <button
          onClick={() => navigate("/admin/bandeja")}
          className="w-full rounded-2xl p-4 flex items-center gap-3 card-elevated active:opacity-80"
        >
          <Inbox size={18} style={{ color: "var(--accent-color)" }} className="icon-bold" />
          <div className="flex-1 text-left">
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Bandeja de formularios</p>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Newsletter · Contacto · Equipo</p>
          </div>
          <ExternalLink size={14} style={{ color: "var(--text-tertiary)" }} />
        </button>

        {/* Public routes that are live */}
        <div className="rounded-2xl p-4 card-elevated">
          <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            Rutas públicas en vivo ({INTERCEPTED_ROUTES.length})
          </h3>
          <div className="space-y-1.5">
            {INTERCEPTED_ROUTES.map((r) => (
              <div key={r.path} className="flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={14} style={{ color: "#22c55e" }} className="shrink-0" />
                  <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {r.label}
                  </span>
                  <code className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{r.path}</code>
                </div>
                <a
                  href={r.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:opacity-70"
                  style={{ color: "var(--accent-color)" }}
                  aria-label="Open"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>


        {/* Acuity independence */}
        <AcuityIndependence />

        {/* Learning curve — readiness to build what's missing */}
        <LearningCurve />

        {/* Post-launch list */}
        <details className="rounded-2xl p-4 card-elevated">
          <summary className="text-sm font-bold cursor-pointer" style={{ color: "var(--text-primary)" }}>
            Pendiente post-launch ({POST_LAUNCH.length})
          </summary>
          <ul className="mt-3 space-y-1.5 list-disc pl-5">
            {POST_LAUNCH.map((item, i) => (
              <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>{item}</li>
            ))}
          </ul>
        </details>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !working && setShowConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle size={20} style={{ color: "#f59e0b" }} className="shrink-0 mt-0.5 icon-bold" />
              <div>
                <h3 className="font-bold text-base mb-1" style={{ color: "var(--text-primary)" }}>
                  {showConfirm === "on" ? "Lanzar el sitio público" : "Volver a Coming Soon"}
                </h3>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {showConfirm === "on"
                    ? "Todos los visitantes verán la nueva web en menos de 1 segundo. Puedes revertir desde aquí en cualquier momento."
                    : "El sitio público volverá a mostrar la página de Coming Soon para todos los visitantes."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                disabled={working}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => flip(showConfirm === "on")}
                disabled={working}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{
                  background: showConfirm === "on" ? "var(--accent-color)" : "#ef4444",
                  color: showConfirm === "on" ? "var(--cta-fg)" : "#ffffff",
                }}
              >
                {working ? "…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit item modal */}
      {(adding || editing) && (
        <ItemEditor
          item={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ItemEditor({ item, onClose }: { item: ChecklistItem | null; onClose: () => void }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category ?? "custom");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) { setErr("Título requerido"); return; }
    setSaving(true);
    setErr(null);
    if (isEdit && item) {
      const { error } = await supabase
        .from("launch_checklist")
        .update({ title: title.trim(), description: description.trim() || null, category })
        .eq("id", item.id);
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("launch_checklist").insert({
        title: title.trim(),
        description: description.trim() || null,
        category,
        sort_order: 900,
        weight: 1,
        status: "pending" as Status,
      });
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Editar item" : "Nuevo item"}
          </h3>
          <button onClick={onClose} className="p-1" style={{ color: "var(--text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm mb-3"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          placeholder="Ej: Integrar AI agent"
        />

        <label className="block text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl px-3 py-2.5 text-sm mb-3 resize-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
          placeholder="Detalles opcionales"
        />

        <label className="block text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>Categoría</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm mb-4"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        {err && <p className="text-xs mb-2" style={{ color: "#ef4444" }}>{err}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
        >
          {saving ? "…" : isEdit ? "Guardar cambios" : "Añadir item"}
        </button>
      </div>
    </div>
  );
}

// ─── Acuity Independence ─────────────────────────────────────────────────────
// Tracks how close we are to running fully native (no Acuity dependency).
// Each capability has equal weight; flip `done` as we cut the cord on each one.
// Each card includes a Lovable prompt the owner can copy + send to rebuild
// the capability natively (with two-way Acuity sync as a safety net).
interface AcuityCap {
  title: string;
  done: boolean;
  prompt: string;
}

const ACUITY_CAPABILITIES: AcuityCap[] = [
  {
    title: "Webhooks de eventos (sched/resched/cancel)",
    done: true,
    prompt: "Build native event broadcasting so when an appointment is created, rescheduled, canceled or changed in our DB it triggers the same downstream effects as our Acuity webhook (notifications, payments reconciliation, etc.) without depending on Acuity firing the event.",
  },
  {
    title: "Pagos (Stripe / PayPal / ATH / Cash)",
    done: true,
    prompt: "Audit and harden our native payments stack (Stripe, PayPal, ATH Móvil, Cash) so it can fully replace any Acuity payment flow. Confirm every booking path writes to our payments table without Acuity as the source of truth.",
  },
  {
    title: "Emails transaccionales propios",
    done: true,
    prompt: "Confirm every transactional email (booking confirmation, reschedule, cancel, reminder, paystub, newsletter) is sent natively from noreply@charliesbarbershop.co with the brand signature, and remove any reliance on Acuity-sent emails.",
  },
  {
    title: "Push notifications nativas",
    done: true,
    prompt: "Confirm we send all critical push notifications (new booking, reminder, cancel, payment received) natively via our service worker + Supabase Edge Function, with no dependency on Acuity-triggered events.",
  },
  {
    title: "Bloques de tiempo: lectura local, escritura espejo",
    done: false,
    prompt: "We already mirror block creates/edits/deletes to Acuity via `acuityProxy()` (Acuity's /blocks endpoint supports POST and DELETE). What's missing: every availability read in the app + public booking flow currently calls Acuity's /availability/times. Refactor so block-overlap checks query our local `block_times` table first, and Acuity's availability API is only consulted as a fallback. Add a unit test that verifies a block created in our app immediately blocks a slot in our availability function without waiting for Acuity round-trip. Keep the outbound mirror so Acuity's hosted page stays accurate.",
  },
  {
    title: "Motor de disponibilidad nativo",
    done: false,
    prompt: "Build a single TypeScript function `computeAvailability({ barberId, serviceId, dateRange })` that returns bookable slots without calling Acuity's /availability API. Inputs from our DB: `working_hours` (per barber per weekday), `services` (duration + padding_before + padding_after), `block_times` (overlap → unavailable), `appointments` (overlap → unavailable, excluding cancelled/no-show), `booking_rules` (advance window, max-per-day, interval grid — Acuity defaults to 15min slot starts, confirm ours matches). Output: array of ISO start times in America/Puerto_Rico. Use it in: (a) public booking flow (`PublicBookingFlow`), (b) admin `NewAppointment` and `EditAppointment`, (c) `ClientNewAppointment`, (d) recurrence checker (`recurrenceAvailability.ts` — currently calls Acuity, replace with this). Keep Acuity's API call as a feature-flagged fallback for one week, then remove. Add Vitest cases comparing our output vs Acuity's output for 30 random barber+service+date combos — must match 100% before flipping the flag.",
  },
];

// ─── Learning curve ──────────────────────────────────────────────────────────
// How ready we are to build each remaining Acuity-dependent capability natively.
// 100 = we know the schema, the algorithm, and have observed Acuity's behavior
// enough to match or beat it. <100 = there's a specific unknown we still need
// to learn (named in `gap`). Average across pending items = overall readiness.
interface LearningItem {
  title: string;
  readiness: number; // 0–100
  gap: string | null; // null when readiness === 100
}

const LEARNING_ITEMS: LearningItem[] = [
  {
    title: "Bloques de tiempo: lectura local",
    readiness: 100,
    gap: null,
  },
  {
    title: "Motor de disponibilidad nativo",
    readiness: 75,
    gap: "El algoritmo exacto de Acuity para grilla de slots cuando un servicio no divide en intervalos de 15 min con padding por barbero. Hay que observar 20–30 outputs reales de Acuity (vía webhooks que ya estamos capturando) y comparar con nuestra fórmula antes del cutover.",
  },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {/* noop */}
      }}
      className="absolute top-2 right-2 p-1.5 rounded-md active:scale-90"
      style={{ background: "var(--bg-surface-2)", color: copied ? "#22c55e" : "var(--text-tertiary)" }}
      aria-label="Copiar prompt"
    >
      {copied ? <Check size={12} className="icon-bold" /> : <Copy size={12} className="icon-bold" />}
    </button>
  );
}

function AcuityIndependence() {
  const total = ACUITY_CAPABILITIES.length;
  const done = ACUITY_CAPABILITIES.filter((c) => c.done).length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="rounded-2xl p-4 card-elevated">
      <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
        Independencia de Acuity
      </h3>
      <p className="text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
        100% = listos para soltar Acuity y dejar que otros profesionales conecten su propio backend (Acuity, Fresha, Booksy).
      </p>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: "var(--accent-color)" }} />
        </div>
        <span className="text-sm font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{pct}%</span>
      </div>
      <div className="space-y-2">
        {ACUITY_CAPABILITIES.map((c, i) => (
          <div
            key={i}
            className="relative rounded-xl p-3"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
          >
            <div className="flex items-center gap-2 mb-1.5 pr-8">
              {c.done
                ? <CheckCircle2 size={14} style={{ color: "#22c55e" }} className="shrink-0" />
                : <Circle size={14} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />}
              <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{c.title}</p>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              {c.prompt}
            </p>
            <CopyBtn text={c.prompt} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LearningCurve() {
  const total = LEARNING_ITEMS.length;
  const pct = total === 0
    ? 100
    : Math.round(LEARNING_ITEMS.reduce((s, i) => s + i.readiness, 0) / total);
  return (
    <div className="rounded-2xl p-4 card-elevated">
      <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
        Curva de aprendizaje
      </h3>
      <p className="text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
        100% = sé exactamente cómo construir lo que falta de Acuity. Si baja, hay un detalle que aún tengo que aprender observando cómo Acuity lo hace.
      </p>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: "var(--accent-color)" }} />
        </div>
        <span className="text-sm font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{pct}%</span>
      </div>
      <div className="space-y-2">
        {LEARNING_ITEMS.map((it, i) => (
          <div
            key={i}
            className="rounded-xl p-3"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{it.title}</p>
              <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: it.readiness === 100 ? "#22c55e" : "var(--accent-color)" }}>
                {it.readiness}%
              </span>
            </div>
            {it.gap && (
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                <span className="font-bold" style={{ color: "var(--text-secondary)" }}>Lo que falta aprender: </span>
                {it.gap}
              </p>
            )}
            {!it.gap && (
              <p className="text-[11px] leading-relaxed" style={{ color: "#22c55e" }}>
                Listo para construir.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

