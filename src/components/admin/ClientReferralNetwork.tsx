// Admin-only card showing a client's referral network + rewards points
// with manual adjustment capability.
import { useEffect, useState } from "react";
import { ChevronRight, Network, Loader2, ArrowUpRight, ArrowDownRight, Trophy, Plus, Minus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Upline = {
  referrer_type: "barber" | "client" | "shop" | string;
  referrer_id: string | null;
  code: string;
  conversion_type: string;
  attributed_at: string;
  name: string | null;
} | null;

type Downline = {
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  total_visits: number;
  total_spent_cents: number;
  first_attribution_at: string;
  conversions: string[];
  codes: string[];
};

type Summary = {
  balance: number;
  breakdown: { spending: number; matching_bonus: number; adjustments: number };
  referrals_count: number;
  next_benefit: null | { title_es: string; title_en: string; required_points: number; points_remaining: number; progress_pct: number };
};

interface Props {
  clientId: string;
  isEs: boolean;
  onOpenClient?: (clientId: string) => void;
}

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClientReferralNetwork({ clientId, isEs, onOpenClient }: Props) {
  const [loading, setLoading] = useState(true);
  const [upline, setUpline] = useState<Upline>(null);
  const [downlines, setDownlines] = useState<Downline[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [savingAdjust, setSavingAdjust] = useState(false);

  const load = async () => {
    setLoading(true);
    const [netRes, sumRes] = await Promise.all([
      (supabase.rpc as any)("get_client_referral_network", { _client_id: clientId }),
      (supabase.rpc as any)("get_client_rewards_summary", { _client_id: clientId }),
    ]);
    if (netRes.error) console.warn("[ClientReferralNetwork:net]", netRes.error);
    else {
      setUpline((netRes.data?.upline as Upline) ?? null);
      setDownlines(((netRes.data?.downlines as Downline[]) ?? []).filter(Boolean));
    }
    if (sumRes.error) console.warn("[ClientReferralNetwork:sum]", sumRes.error);
    else setSummary(sumRes.data as Summary);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clientId]);

  const handleAdjust = async () => {
    const n = parseInt(adjustPoints, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(isEs ? "Cantidad inválida" : "Invalid amount");
      return;
    }
    if (adjustReason.trim().length < 4) {
      toast.error(isEs ? "Escribe una razón (mín. 4 caracteres)" : "Provide a reason (min 4 chars)");
      return;
    }
    setSavingAdjust(true);
    const { error } = await (supabase.rpc as any)("admin_adjust_client_rewards", {
      _client_id: clientId,
      _points: n * adjustSign,
      _reason: adjustReason.trim(),
    });
    setSavingAdjust(false);
    if (error) {
      toast.error(error.message || (isEs ? "No se pudo ajustar" : "Could not adjust"));
      return;
    }
    toast.success(isEs ? "Puntos ajustados" : "Points adjusted");
    setAdjustOpen(false);
    setAdjustPoints("");
    setAdjustReason("");
    setAdjustSign(1);
    load();
  };

  const hasNothing = !upline && downlines.length === 0;
  const next = summary?.next_benefit;

  return (
    <div className="rounded-xl card-elevated p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network size={16} style={{ color: "var(--text-secondary)" }} />
          <h3 className="text-xs font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "Referidos y puntos" : "Referrals & points"}
          </h3>
        </div>
        {!loading && (
          <button
            onClick={() => setAdjustOpen(true)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-md"
            style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}
          >
            {isEs ? "Ajustar" : "Adjust"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : (
        <>
          {/* POINTS BLOCK */}
          {summary && (
            <div className="rounded-lg p-3" style={{ background: "var(--bg-base)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Trophy size={14} className="icon-bold" style={{ color: "var(--accent-color)" }} />
                  <span className="text-[11px] font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                    {isEs ? "Puntos" : "Points"}
                  </span>
                </div>
                <span className="text-base font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {summary.balance.toLocaleString()}
                </span>
              </div>
              {next ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {isEs ? "Próx:" : "Next:"} {isEs ? next.title_es : next.title_en}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                      {summary.balance}/{next.required_points}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                    <div className="h-full" style={{ width: `${next.progress_pct}%`, background: "var(--accent-color)" }} />
                  </div>
                </>
              ) : (
                <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {isEs ? "Máximo alcanzado." : "Max tier reached."}
                </p>
              )}
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                <span>{isEs ? "Gasto" : "Spend"}: <strong style={{ color: "var(--text-secondary)" }}>{summary.breakdown.spending}</strong></span>
                <span>{isEs ? "Bono" : "Bonus"}: <strong style={{ color: "var(--text-secondary)" }}>{summary.breakdown.matching_bonus}</strong></span>
                {summary.breakdown.adjustments !== 0 && (
                  <span>{isEs ? "Ajustes" : "Adj"}: <strong style={{ color: "var(--text-secondary)" }}>{summary.breakdown.adjustments}</strong></span>
                )}
              </div>
            </div>
          )}

          {hasNothing ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Este cliente no tiene upline ni downlines." : "This client has no upline or downlines yet."}
            </p>
          ) : (
            <>
              {/* UPLINE */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <ArrowUpRight size={12} style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>Upline</span>
                </div>
                {upline ? (
                  <div className="rounded-lg p-2.5" style={{ background: "var(--bg-base)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {upline.name || (isEs ? "Sin nombre" : "Unnamed")}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                          {upline.referrer_type} · /r/{upline.code}
                        </div>
                      </div>
                      {upline.referrer_type === "client" && upline.referrer_id && onOpenClient && (
                        <button onClick={() => onOpenClient(upline.referrer_id!)}
                          className="text-[11px] font-medium px-2 py-1 rounded-md"
                          style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}>
                          {isEs ? "Ver" : "Open"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {isEs ? "Sin upline (registro orgánico)." : "No upline (organic signup)."}
                  </p>
                )}
              </div>

              {/* DOWNLINES */}
              <div>
                <button onClick={() => setExpanded((v) => !v)} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1">
                    <ArrowDownRight size={12} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                      Downlines ({downlines.length})
                    </span>
                  </div>
                  {downlines.length > 0 && (
                    <ChevronRight size={14} className="transition-transform"
                      style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
                  )}
                </button>
                {expanded && downlines.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {downlines.map((d) => (
                      <button key={d.client_id} onClick={() => onOpenClient?.(d.client_id)}
                        className="w-full text-left rounded-lg p-2.5 flex items-center justify-between gap-2"
                        style={{ background: "var(--bg-base)" }}>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {d.name || (isEs ? "Sin nombre" : "Unnamed")}
                          </div>
                          <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                            {d.total_visits} {isEs ? "visitas" : "visits"} · {fmt(d.total_spent_cents)}
                          </div>
                        </div>
                        <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                      </button>
                    ))}
                  </div>
                )}
                {downlines.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    {isEs ? "Aún no ha referido a nadie." : "Hasn't referred anyone yet."}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ADJUST MODAL */}
      {adjustOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => !savingAdjust && setAdjustOpen(false)}>
          <div className="w-full max-w-md rounded-2xl p-5 card-elevated" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                {isEs ? "Ajustar puntos" : "Adjust points"}
              </h3>
              <button onClick={() => setAdjustOpen(false)} className="p-1">
                <X size={18} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button onClick={() => setAdjustSign(1)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                style={{
                  background: adjustSign === 1 ? "var(--accent-dim)" : "var(--bg-surface-2)",
                  color: adjustSign === 1 ? "var(--accent-color)" : "var(--text-secondary)",
                }}>
                <Plus size={14} /> {isEs ? "Agregar" : "Add"}
              </button>
              <button onClick={() => setAdjustSign(-1)}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                style={{
                  background: adjustSign === -1 ? "var(--accent-dim)" : "var(--bg-surface-2)",
                  color: adjustSign === -1 ? "var(--accent-color)" : "var(--text-secondary)",
                }}>
                <Minus size={14} /> {isEs ? "Restar" : "Subtract"}
              </button>
            </div>

            <label className="text-[11px] font-bold uppercase block mb-1" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Cantidad" : "Amount"}
            </label>
            <input type="number" min="1" value={adjustPoints}
              onChange={(e) => setAdjustPoints(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg px-3 py-2.5 text-sm mb-3 outline-none tabular-nums"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }} />

            <label className="text-[11px] font-bold uppercase block mb-1" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Razón" : "Reason"}
            </label>
            <textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}
              rows={3} placeholder={isEs ? "Compensación por demora..." : "Compensation for delay..."}
              className="w-full rounded-lg px-3 py-2.5 text-sm mb-4 outline-none resize-none"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }} />

            <button onClick={handleAdjust} disabled={savingAdjust}
              className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-50"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
              {savingAdjust ? <Loader2 size={16} className="animate-spin mx-auto" /> : (isEs ? "Confirmar ajuste" : "Confirm adjustment")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
