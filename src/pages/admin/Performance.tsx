import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Trophy, Copy, Check } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";

interface Row {
  code: string;
  owner_type: string;
  owner_id: string;
  owner_name: string | null;
  signups: number;
  waitlist_joins: number;
  first_bookings: number;
  pwa_installs: number;
  push_enabled: number;
  unique_clients: number;
  total_conversions: number;
  ltv_cents: number;
  last_conversion_at: string | null;
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((cents || 0) / 100);

export default function Performance() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase.rpc as any)("get_referral_performance");
      if (error) {
        toast.error(error.message);
        setRows([]);
      } else {
        setRows((data || []) as Row[]);
      }
      setLoading(false);
    })();
  }, []);

  const baseUrl = "https://charliesbarbershop.co/r/";

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}${code}`);
      setCopied(code);
      toast.success(language === "es" ? "Link copiado" : "Link copied");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={language === "es" ? "Performance referidos" : "Referral performance"}
        onBack={() => navigate("/admin?tab=menu")}
      />

      <p className="px-4 pb-4 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {language === "es"
          ? "Ranking de barberos referidores con conversiones y LTV (gasto total de los clientes que trajeron)."
          : "Top referring barbers by conversions and lifetime value of attributed clients."}
      </p>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-16 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "Aún no hay datos de referidos." : "No referral data yet."}
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-10">
          {rows.map((r, idx) => (
            <div key={r.code} className="rounded-xl p-4 card-elevated">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: idx === 0 ? "rgba(245,158,11,0.18)" : "var(--bg-elevated)" }}>
                  {idx === 0 ? <Trophy size={18} style={{ color: "#f59e0b" }} /> : <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{idx + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {r.owner_name || r.code}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    /r/{r.code} · {r.owner_type}
                  </div>
                </div>
                <button
                  onClick={() => copy(r.code)}
                  className="p-2 rounded-lg"
                  style={{ background: "var(--bg-elevated)" }}
                  aria-label="Copy link"
                >
                  {copied === r.code ? <Check size={16} style={{ color: "#22c55e" }} /> : <Copy size={16} style={{ color: "var(--text-secondary)" }} />}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <Stat label={language === "es" ? "Conversiones" : "Conversions"} value={String(r.total_conversions)} />
                <Stat label={language === "es" ? "Clientes" : "Clients"} value={String(r.unique_clients)} />
                <Stat label="LTV" value={fmtMoney(Number(r.ltv_cents))} />
              </div>

              <div className="grid grid-cols-5 gap-2 mt-2">
                <Mini label={language === "es" ? "Sign-up" : "Sign-up"} value={r.signups} />
                <Mini label={language === "es" ? "Reservas" : "Bookings"} value={r.first_bookings} />
                <Mini label="Waitlist" value={r.waitlist_joins} />
                <Mini label="PWA" value={r.pwa_installs} />
                <Mini label="Push" value={r.push_enabled} />
              </div>

              {r.last_conversion_at && (
                <div className="mt-3 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {language === "es" ? "Última conversión:" : "Last conversion:"}{" "}
                  {new Date(r.last_conversion_at).toLocaleDateString(language === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <div className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}
