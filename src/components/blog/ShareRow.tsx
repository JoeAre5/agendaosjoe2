import { useTranslation } from "@/hooks/useTranslation";
import { Send, Check } from "lucide-react";
import { useState } from "react";
import { trackBlogEvent } from "@/lib/blog/analytics";

/**
 * ShareRow — single paper-airplane button under each blog post.
 * Opens the native Web Share sheet (iOS/Android) so readers pick the target
 * (Instagram, Messages, AirDrop, Mail, Copy, etc.). Falls back to copying the
 * URL on desktop browsers without `navigator.share`.
 */
export function ShareRow({ url, title, postId }: { url: string; title: string; postId?: string }) {
  const { language } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onNativeShare = async () => {
    trackBlogEvent("share", { postId, language, metadata: { method: "native_or_copy" } });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="flex items-center justify-between gap-3 py-4 mt-8">
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
        {language === "es" ? "Compartir" : "Share"}
      </span>
      <button
        onClick={onNativeShare}
        className="p-2 rounded-full transition-transform active:scale-95"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        aria-label={language === "es" ? "Compartir" : "Share"}
        title={language === "es" ? "Compartir" : "Share"}
      >
        {copied ? <Check size={14} strokeWidth={1.5} /> : <Send size={14} strokeWidth={1.5} className="-rotate-12" />}
      </button>
    </div>
  );
}
