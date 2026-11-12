// Recent broadcasts log with delivered / opened counts.
// Each row also has a "Studio" button to re-export the broadcast as a
// downloadable marketing asset (light/dark, 5 aspect ratios).
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Eye, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { BroadcastAssetStudio, type BroadcastAssetPayload } from "./BroadcastAssetStudio";

interface BroadcastLog {
  id: string;
  pill_es: string | null;
  pill_en: string | null;
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  cta_label_es: string | null;
  cta_label_en: string | null;
  hero_image_url: string | null;
  audience_count: number;
  delivered_count: number;
  failed_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
  opened_count?: number;
}

interface Props {
  refreshKey: number;
}

export function BroadcastHistory({ refreshKey }: Props) {
  const { language } = useTranslation();
  const [rows, setRows] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [studioFor, setStudioFor] = useState<BroadcastLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: broadcasts } = await supabase
        .from("broadcasts")
        .select("id,pill_es,pill_en,title_es,title_en,body_es,body_en,cta_label_es,cta_label_en,hero_image_url,audience_count,delivered_count,failed_count,status,sent_at,created_at")
        .neq("status", "test")
        .order("created_at", { ascending: false })
        .limit(20);

      const ids = (broadcasts || []).map((b) => b.id);
      let openedMap = new Map<string, number>();
      if (ids.length > 0) {
        const { data: receipts } = await supabase
          .from("broadcast_receipts")
          .select("broadcast_id, opened_at")
          .in("broadcast_id", ids)
          .not("opened_at", "is", null);
        for (const r of receipts || []) {
          openedMap.set(r.broadcast_id, (openedMap.get(r.broadcast_id) ?? 0) + 1);
        }
      }
      if (cancelled) return;
      setRows(
        (broadcasts || []).map((b) => ({
          ...b,
          opened_count: openedMap.get(b.id) ?? 0,
        })) as BroadcastLog[]
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-center text-[13px] py-8" style={{ color: "var(--text-tertiary)" }}>
        {language === "es" ? "Aún no has enviado difusiones." : "No broadcasts sent yet."}
      </p>
    );
  }

  const studioPayload: BroadcastAssetPayload | null = studioFor
    ? {
        pillEs: studioFor.pill_es,
        pillEn: studioFor.pill_en,
        titleEs: studioFor.title_es,
        titleEn: studioFor.title_en,
        bodyEs: studioFor.body_es,
        bodyEn: studioFor.body_en,
        ctaLabelEs: studioFor.cta_label_es,
        ctaLabelEn: studioFor.cta_label_en,
        imageUrl: studioFor.hero_image_url,
      }
    : null;

  return (
    <>
      <div className="rounded-xl overflow-hidden card-elevated">
        {rows.map((r, i) => (
          <div key={r.id}>
            {i > 0 && <div className="h-px mx-4" style={{ background: "var(--divider)" }} />}
            <div className="px-4 py-3">
              <div className="flex items-start gap-2 mb-1">
                {r.status === "sent" ? (
                  <CheckCircle2 size={13} className="mt-1 shrink-0" style={{ color: "var(--accent-color)" }} />
                ) : (
                  <Clock size={13} className="mt-1 shrink-0" style={{ color: "var(--text-tertiary)" }} />
                )}
                <span className="flex-1 text-[13px] font-bold truncate"
                  style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? r.title_es : r.title_en}
                </span>
                <button
                  onClick={() => setStudioFor(r)}
                  className="shrink-0 inline-flex items-center justify-center p-1.5 rounded-full"
                  style={{
                    background: "var(--bg-surface-2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--divider)",
                  }}
                  aria-label={language === "es" ? "Generar asset" : "Generate asset"}
                >
                  <ImageIcon size={13} />
                </button>
              </div>
              <div className="flex items-center gap-3 text-[11px] ml-[18px]"
                style={{ color: "var(--text-secondary)" }}>
                <span>
                  {language === "es" ? "Entregado" : "Delivered"}: {r.delivered_count}/{r.audience_count}
                </span>
                <span className="flex items-center gap-1">
                  <Eye size={10} /> {r.opened_count ?? 0}
                </span>
                {r.sent_at && (
                  <span style={{ color: "var(--text-tertiary)" }}>
                    · {new Date(r.sent_at).toLocaleString(language === "es" ? "es-PR" : "en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {studioFor && studioPayload && (
        <BroadcastAssetStudio
          payload={studioPayload}
          slug={((language === "es" ? studioFor.title_es : studioFor.title_en) || "broadcast")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 40)}
          onClose={() => setStudioFor(null)}
        />
      )}
    </>
  );
}
