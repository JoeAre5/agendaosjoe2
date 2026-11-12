// Admin profile side panel for a single client's rewards data.
import { useEffect, useState } from "react";
import { Loader2, Copy, Edit3, BookOpen, X, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import AdjustPointsModal from "./AdjustPointsModal";

interface Props {
  clientId: string | null;
  isEs: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const REFERRAL_BASE = "https://charliesbarbershop.co/r/";

const sourceLabel = (s: string, isEs: boolean) => {
  const map: Record<string, [string, string]> = {
    spending: ["Compra", "Purchase"],
    matching_bonus: ["Bono por Referir", "Matching Bonus"],
    manual_adjust: ["Ajuste manual", "Manual Adjustment"],
    refund_reversal: ["Reverso por reembolso", "Refund Reversal"],
    cancellation_reversal: ["Reverso por cancelación", "Cancellation Reversal"],
    redemption: ["Redención", "Redemption"],
  };
  const v = map[s]; return v ? (isEs ? v[0] : v[1]) : s;
};

export default function ClientRewardsProfilePanel({ clientId, isEs, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("get_client_rewards_profile", { _client_id: clientId });
    if (error) { console.warn(error); toast.error(isEs ? "Error al cargar" : "Failed to load"); }
    setData(data);
    setLoading(false);
  };

  useEffect(() => { if (clientId) load(); }, [clientId]);

  const client = data?.client;
  const summary = data?.summary;
  const ledger: any[] = data?.recent_ledger || [];
  const referrals: any[] = data?.referrals || [];

  const copyLink = () => {
    const url = REFERRAL_BASE + (client?.referral_slug || "");
    navigator.clipboard?.writeText(url).then(
      () => toast.success(isEs ? "Enlace copiado." : "Referral link copied."),
      () => toast.error(isEs ? "No se pudo copiar." : "Could not copy.")
    );
  };

  return (
    <Sheet open={!!clientId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ background: "var(--bg-base)", borderColor: "var(--border-color)" }}>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Perfil de rewards" : "Client Rewards Profile"}</div>
            <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Solo admin. Cambios quedan en el ledger." : "Admin-only. All changes are logged."}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md" style={{ color: "var(--text-secondary)" }}><X size={18} /></button>
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Header card */}
            <div className="rounded-xl p-4 card-elevated">
              <div className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
                {client?.first_name} {client?.last_name || ""}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {client?.phone || (isEs ? "Sin teléfono" : "No phone")} · {client?.email || (isEs ? "Sin email" : "No email")}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Puntos" : "Points"}</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {(summary?.balance ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Referidos" : "Referrals"}</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{summary?.referrals_count ?? 0}</div>
                </div>
              </div>
              {client?.referral_slug && (
                <div className="mt-3 rounded-lg px-3 py-2 text-[11px] font-mono break-all" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                  {REFERRAL_BASE}{client.referral_slug}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Btn onClick={copyLink} icon={Copy} label={isEs ? "Copiar enlace" : "Copy Link"} disabled={!client?.referral_slug} />
                <Btn onClick={() => setAdjustOpen(true)} icon={Edit3} label={isEs ? "Editar puntos" : "Edit Points"} primary />
              </div>
            </div>

            {/* Benefit progress */}
            {summary?.next_benefit && (
              <div className="rounded-xl p-4 card-elevated">
                <div className="flex items-center gap-2 mb-2">
                  <Gift size={14} style={{ color: "var(--accent-color)" }} />
                  <div className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Progreso del próximo beneficio" : "Benefit Progress"}</div>
                </div>
                <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
                  {isEs ? summary.next_benefit.title_es : summary.next_benefit.title_en}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {summary.balance} / {summary.next_benefit.required_points} pts ·{" "}
                  {isEs ? `Faltan ${summary.next_benefit.points_remaining} pts` : `${summary.next_benefit.points_remaining} pts left`}
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                  <div className="h-full" style={{ width: `${summary.next_benefit.progress_pct}%`, background: "var(--accent-color)" }} />
                </div>
              </div>
            )}

            {/* Recent ledger */}
            <div className="rounded-xl p-4 card-elevated">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={14} style={{ color: "var(--text-tertiary)" }} />
                <div className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Actividad reciente" : "Recent Points Activity"}</div>
              </div>
              {ledger.length === 0 ? (
                <div className="text-[11px] py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  {isEs ? "Sin movimientos aún." : "No activity yet."}
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border-color)" }}>
                  {ledger.map((l) => (
                    <div key={l.id} className="py-2 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{sourceLabel(l.source_type, isEs)}</div>
                        <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                          {(isEs ? l.description_es : l.description_en) || ""}
                        </div>
                      </div>
                      <div className="text-[13px] font-bold tabular-nums" style={{ color: l.points >= 0 ? "#22c55e" : "#ef4444" }}>
                        {l.points >= 0 ? "+" : ""}{l.points}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Referrals */}
            <div className="rounded-xl p-4 card-elevated">
              <div className="text-[12px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                {isEs ? "Actividad de referidos" : "Referral Activity"} ({referrals.length})
              </div>
              {referrals.length === 0 ? (
                <div className="text-[11px] py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  {isEs ? "Aún no ha referido a nadie." : "No referrals yet."}
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border-color)" }}>
                  {referrals.map((r) => (
                    <div key={r.referred_client_id} className="py-2 flex items-center justify-between text-[12px]">
                      <span className="truncate" style={{ color: "var(--text-primary)" }}>{r.referred_name}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{r.attribution_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <AdjustPointsModal
          open={adjustOpen}
          clientId={clientId}
          isEs={isEs}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => { setAdjustOpen(false); load(); onChanged?.(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function Btn({ icon: Icon, label, onClick, primary, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
      style={{
        background: primary ? "var(--accent-color)" : "var(--bg-elevated)",
        color: primary ? "var(--bg-base)" : "var(--text-primary)",
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}
