// Referral Links tab — global slug management.
import { useEffect, useState } from "react";
import { Loader2, Copy, Edit3, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EditSlugModal from "./EditSlugModal";

type Row = {
  owner_id: string;
  owner_type: string;
  owner_profile_id: string;
  owner_name: string;
  slug: string;
  is_active: boolean;
  updated_at: string;
};

const REFERRAL_BASE = "https://charliesbarbershop.co/r/";

export default function ReferralLinksTab({ isEs }: { isEs: boolean }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("get_referral_links_overview");
    if (error) console.warn(error);
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = (slug: string) => {
    navigator.clipboard?.writeText(REFERRAL_BASE + slug).then(
      () => toast.success(isEs ? "Enlace copiado." : "Link copied."),
      () => toast.error(isEs ? "No se pudo copiar." : "Could not copy.")
    );
  };

  const filtered = rows.filter((r) =>
    !filter || r.owner_name?.toLowerCase().includes(filter.toLowerCase()) || r.slug.includes(filter.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>;

  return (
    <div className="pt-4">
      <div className="px-4 sm:px-6 mb-3">
        <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--bg-elevated)" }}>
          <Search size={14} style={{ color: "var(--text-tertiary)" }} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={isEs ? "Buscar..." : "Search..."}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: "var(--text-primary)" }} />
        </div>
        <div className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
          {isEs ? "Cambiar slug no rompe atribuciones existentes (se guardan por ID)." : "Changing slug does not break existing attribution (stored by ID)."}
        </div>
      </div>

      <div className="px-4 sm:px-6 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl p-6 card-elevated text-center">
            <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Sin enlaces" : "No referral links found."}</div>
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.owner_id} className="rounded-xl p-3 card-elevated">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{r.owner_name || "—"}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>{r.owner_type}</span>
                  </div>
                  <div className="text-[11px] font-mono mt-1 truncate" style={{ color: "var(--text-secondary)" }}>/r/{r.slug}</div>
                </div>
                <div className="flex gap-1">
                  <IconBtn icon={Copy} onClick={() => copyLink(r.slug)} />
                  <IconBtn icon={Edit3} onClick={() => setEditing(r)} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <EditSlugModal
        open={!!editing}
        row={editing}
        isEs={isEs}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function IconBtn({ icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
      <Icon size={13} />
    </button>
  );
}
