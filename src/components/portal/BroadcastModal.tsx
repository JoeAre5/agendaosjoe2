// Full-screen broadcast modal — matches the reference style:
//  • Optional hero image with rounded corners
//  • Small accent pill (custom text per broadcast)
//  • Bold all-caps headline
//  • Supporting body copy
//  • Optional dark CTA pill (label + URL)
//
// Auto-fetches the oldest unread broadcast for the current client. When dismissed
// or when the CTA is tapped, marks the receipt so it never shows again.
//
// Triggers:
//  1. On mount (portal load) → checks for the latest unread receipt.
//  2. ?broadcast=<id> in the URL (deep-link from a push tap) → opens that one.
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

interface BroadcastRow {
  id: string;
  pill_es: string | null;
  pill_en: string | null;
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  hero_image_url: string | null;
  cta_label_es: string | null;
  cta_label_en: string | null;
  cta_url: string | null;
}

interface Props {
  clientId: string | null;
}

export default function BroadcastModal({ clientId }: Props) {
  const { language } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [broadcast, setBroadcast] = useState<BroadcastRow | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const loadBroadcast = useCallback(async () => {
    if (!clientId) return;

    // 1. Deep-link from push tap takes priority.
    const deepLinkId = searchParams.get("broadcast");
    let target: { broadcast: BroadcastRow; receiptId: string } | null = null;

    if (deepLinkId) {
      const { data: receipt } = await supabase
        .from("broadcast_receipts")
        .select(
          "id, opened_at, dismissed_at, broadcasts(id,pill_es,pill_en,title_es,title_en,body_es,body_en,hero_image_url,cta_label_es,cta_label_en,cta_url)"
        )
        .eq("client_id", clientId)
        .eq("broadcast_id", deepLinkId)
        .maybeSingle();
      if (receipt && receipt.broadcasts) {
        target = { broadcast: receipt.broadcasts as BroadcastRow, receiptId: receipt.id };
      }
      // Clean the param either way.
      const next = new URLSearchParams(searchParams);
      next.delete("broadcast");
      setSearchParams(next, { replace: true });
    }

    // 2. Otherwise pick the latest unread/undismissed receipt.
    if (!target) {
      const { data: receipt } = await supabase
        .from("broadcast_receipts")
        .select(
          "id, broadcasts(id,pill_es,pill_en,title_es,title_en,body_es,body_en,hero_image_url,cta_label_es,cta_label_en,cta_url)"
        )
        .eq("client_id", clientId)
        .is("opened_at", null)
        .is("dismissed_at", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (receipt && receipt.broadcasts) {
        target = { broadcast: receipt.broadcasts as BroadcastRow, receiptId: receipt.id };
      }
    }

    if (target) {
      setBroadcast(target.broadcast);
      setReceiptId(target.receiptId);
      // Mark opened immediately when the modal is shown.
      await supabase
        .from("broadcast_receipts")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", target.receiptId);
    }
  }, [clientId, searchParams, setSearchParams]);

  useEffect(() => {
    void loadBroadcast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const close = async () => {
    if (receiptId) {
      await supabase
        .from("broadcast_receipts")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", receiptId);
    }
    setBroadcast(null);
    setReceiptId(null);
  };

  const handleCta = async () => {
    if (!broadcast?.cta_url) return;
    await close();
    if (broadcast.cta_url.startsWith("http")) {
      window.open(broadcast.cta_url, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(broadcast.cta_url);
    }
  };

  if (!broadcast) return null;

  const pill = language === "es" ? broadcast.pill_es : broadcast.pill_en;
  const title = language === "es" ? broadcast.title_es : broadcast.title_en;
  const body = language === "es" ? broadcast.body_es : broadcast.body_en;
  const ctaLabel = language === "es" ? broadcast.cta_label_es : broadcast.cta_label_en;

  return (
    <AnimatePresence>
      <motion.div
        key="broadcast-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center px-5"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
        onClick={close}
      >
        <motion.div
          key="broadcast-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="relative w-full max-w-[400px] rounded-[28px] overflow-hidden shadow-2xl"
          style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={close}
            aria-label="close"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: broadcast.hero_image_url ? "rgba(0,0,0,0.45)" : "var(--bg-surface-2)",
              color: broadcast.hero_image_url ? "#fff" : "var(--text-secondary)",
              backdropFilter: broadcast.hero_image_url ? "blur(8px)" : undefined,
            }}
          >
            <X className="icon-bold" size={16} />
          </button>

          {/* Hero image */}
          {broadcast.hero_image_url && (
            <div className="px-4 pt-4">
              <div
                className="rounded-2xl overflow-hidden bg-black/5"
                style={{ aspectRatio: "3 / 2" }}
              >
                <img loading="lazy" decoding="async"
                  src={broadcast.hero_image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-7 pt-5 pb-7 text-center">
            {pill && (
              <div className="flex justify-center mb-3">
                <span
                  className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold"
                  style={{
                    background: "var(--accent-tint, hsl(var(--accent) / 0.15))",
                    color: "var(--accent-color, hsl(var(--accent)))",
                  }}
                >
                  {pill}
                </span>
              </div>
            )}
            <h2
              className="text-[26px] leading-[1.1] mb-3"
              style={{
                fontWeight: 900,
                letterSpacing: "-0.5px",
                textTransform: "uppercase",
              }}
            >
              {title}
            </h2>
            <p
              className="text-[14px] leading-[1.45] mb-6"
              style={{ color: "var(--text-secondary)" }}
            >
              {body}
            </p>
            {ctaLabel && broadcast.cta_url && (
              <button
                onClick={handleCta}
                className="px-8 py-3 rounded-full text-[14px] font-semibold transition-transform active:scale-95"
                style={{
                  background: "var(--cta-bg, hsl(var(--foreground)))",
                  color: "var(--cta-fg, hsl(var(--background)))",
                }}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
