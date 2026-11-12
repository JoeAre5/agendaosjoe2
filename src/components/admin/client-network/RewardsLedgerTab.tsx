// Rewards Ledger tab — read-only ledger with semantic filters.
// Default view hides the noisy +0 (ineligible) entries; user can switch filter to see them.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

type Row = {
  id: string;
  created_at: string;
  client_id: string;
  points: number;
  source_type: string;
  description_es: string | null;
  description_en: string | null;
  source_transaction_id: string | null;
  source_appointment_id: string | null;
  created_by: string | null;
};

type FilterKey =
  | "all"
  | "withPoints"
  | "noPoints"
  | "ineligible"
  | "matching"
  | "reversals";

const sourceLabel = (s: string, isEs: boolean) => {
  const map: Record<string, [string, string]> = {
    spending: ["Compra", "Purchase"],
    matching_bonus: ["Bono por Referir", "Matching Bonus"],
    manual_adjust: ["Ajuste manual", "Manual Adjustment"],
    refund_reversal: ["Reverso refund", "Refund Reversal"],
    cancellation_reversal: ["Reverso cancelación", "Cancellation Reversal"],
    redemption: ["Redención", "Redemption"],
  };
  return map[s] ? (isEs ? map[s][0] : map[s][1]) : s;
};

const fmtDt = (d: string, isEs: boolean) =>
  new Date(d).toLocaleDateString(isEs ? "es-PR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// "Ineligible" = explicit +0 entry (commonly emitted to log non-eligible activity).
const isIneligible = (r: Row) => r.points === 0;

const matchesFilter = (r: Row, f: FilterKey): boolean => {
  switch (f) {
    case "all": return true;
    case "withPoints": return r.points > 0;
    case "noPoints": return r.points <= 0; // includes 0 and reversals
    case "ineligible": return isIneligible(r);
    case "matching": return r.source_type === "matching_bonus";
    case "reversals": return r.source_type === "refund_reversal" || r.source_type === "cancellation_reversal" || r.points < 0;
    default: return true;
  }
};

export default function RewardsLedgerTab({ isEs }: { isEs: boolean }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("");
  // Default: "withPoints" to keep the noisy +0 out of the main view.
  const [activeFilter, setActiveFilter] = useState<FilterKey>("withPoints");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_rewards_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.warn(error);
    const list = (data as Row[]) || [];
    setRows(list);

    const ids = [...new Set(list.map((r) => r.client_id))];
    if (ids.length) {
      const { data: cs } = await supabase.from("clients").select("id, first_name, last_name").in("id", ids);
      const m: Record<string, string> = {};
      (cs || []).forEach((c: any) => { m[c.id] = `${c.first_name || ""} ${c.last_name || ""}`.trim(); });
      setClientsMap(m);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    withPoints: rows.filter((r) => r.points > 0).length,
    noPoints: rows.filter((r) => r.points <= 0).length,
    ineligible: rows.filter(isIneligible).length,
    matching: rows.filter((r) => r.source_type === "matching_bonus").length,
    reversals: rows.filter((r) => r.source_type === "refund_reversal" || r.source_type === "cancellation_reversal" || r.points < 0).length,
  }), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!matchesFilter(r, activeFilter)) return false;
      if (filter) {
        const q = filter.toLowerCase();
        const name = (clientsMap[r.client_id] || "").toLowerCase();
        if (!name.includes(q) && !r.client_id.includes(q)) return false;
      }
      return true;
    });
  }, [rows, activeFilter, filter, clientsMap]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>;

  const FILTERS: { key: FilterKey; labelKey: string }[] = [
    { key: "withPoints", labelKey: "referrals.ledgerFilters.withPoints" },
    { key: "all",        labelKey: "referrals.ledgerFilters.all" },
    { key: "matching",   labelKey: "referrals.ledgerFilters.matching" },
    { key: "reversals",  labelKey: "referrals.ledgerFilters.reversals" },
    { key: "ineligible", labelKey: "referrals.ledgerFilters.ineligible" },
    { key: "noPoints",   labelKey: "referrals.ledgerFilters.noPoints" },
  ];

  return (
    <div className="pt-4">
      <div className="px-4 sm:px-6 space-y-2">
        <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--bg-elevated)" }}>
          <Search size={14} style={{ color: "var(--text-tertiary)" }} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={isEs ? "Buscar por cliente..." : "Search by client..."}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: "var(--text-primary)" }} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map(({ key, labelKey }) => (
            <Chip key={key} active={activeFilter === key} onClick={() => setActiveFilter(key)}>
              {t(labelKey)} <span className="opacity-60">({counts[key]})</span>
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 mt-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl p-6 card-elevated text-center">
            <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
              {t("referrals.empty.noForFilter")}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {isEs ? "Cambia los filtros para ver más movimientos." : "Change the filter to see more entries."}
            </div>
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-xl p-3 card-elevated flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {clientsMap[r.client_id] || "—"}
                </div>
                <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
                  {sourceLabel(r.source_type, isEs)} · {fmtDt(r.created_at, isEs)}
                </div>
                {(r.description_es || r.description_en) && (
                  <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {(isEs ? r.description_es : r.description_en) || ""}
                  </div>
                )}
              </div>
              <div
                className="text-[15px] font-bold tabular-nums"
                style={{
                  color:
                    r.points > 0 ? "var(--green)"
                      : r.points < 0 ? "var(--red, #ef4444)"
                        : "var(--text-tertiary)",
                }}
              >
                {r.points > 0 ? "+" : ""}{r.points}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className="text-[10px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap"
      style={{ background: active ? "var(--accent-dim)" : "var(--bg-elevated)", color: active ? "var(--nav-accent)" : "var(--text-secondary)" }}>
      {children}
    </button>
  );
}
