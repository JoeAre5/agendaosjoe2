import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Home as HomeIcon, Image as ImageIcon } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

interface BarberRow {
  id: string;
  name: string;
  avatar_url: string | null;
  ig_photos: string[] | null;
  is_bookable: boolean;
}

export default function Galleries() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [homeCount, setHomeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: bs }, { data: ss }] = await Promise.all([
        supabase
          .from("barbers")
          .select("id,name,avatar_url,ig_photos,is_bookable")
          .eq("is_active", true)
          .eq("is_bookable", true)
          .order("name"),
        supabase.from("shop_settings").select("home_grid_photos").limit(1).maybeSingle(),
      ]);
      setBarbers((bs as any) || []);
      setHomeCount(((ss as any)?.home_grid_photos || []).filter(Boolean).length);
      setLoading(false);
    })();
  }, []);

  const t = (es: string, en: string) => (language === "es" ? es : en);

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        sticky
        title={t("Galerías", "Galleries")}
        onBack={() => navigate("/admin/settings")}
      />

      <div className="px-4 space-y-2">
        <button
          onClick={() => navigate("/admin/galleries/home")}
          className="w-full flex items-center gap-3 p-3 rounded-xl card-elevated"
        >
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <HomeIcon size={20} style={{ color: "var(--text-primary)" }} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {t("Página de inicio", "Homepage")}
            </div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {homeCount} {t("fotos · grid 3×3", "photos · 3×3 grid")}
            </div>
          </div>
          <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>

        <div className="text-[11px] font-bold uppercase tracking-wider px-1 pt-3" style={{ color: "var(--text-tertiary)" }}>
          {t("Barberos", "Barbers")}
        </div>

        {loading && <div className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>…</div>}

        {barbers.map((b) => {
          const count = (b.ig_photos || []).filter(Boolean).length;
          return (
            <button
              key={b.id}
              onClick={() => navigate(`/admin/galleries/barber/${b.id}`)}
              className="w-full flex items-center gap-3 p-3 rounded-xl card-elevated"
            >
              {b.avatar_url ? (
                <img src={b.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                  <ImageIcon size={18} style={{ color: "var(--text-tertiary)" }} />
                </div>
              )}
              <div className="flex-1 text-left">
                <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{b.name}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {count} {t("fotos · Instagram 3×3", "photos · Instagram 3×3")}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
