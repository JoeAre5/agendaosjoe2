import { X, Loader2, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { canCancelNow, formatCancelDeadlineLabel } from "@/lib/cancelPolicy";

interface CancelModalProps {
  serviceName: string;
  barberName: string;
  dateTime: string;
  startsAt?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  loading?: boolean;
  /** @deprecated kept for backward compat with older callers */
  hoursUntilStart?: number;
  /** @deprecated kept for backward compat with older callers */
  cancelWindowHours?: number;
  willRefund?: boolean;
  amountCents?: number;
}

export default function CancelModal({
  serviceName, barberName, dateTime, startsAt,
  onConfirm, onDismiss, loading,
  willRefund, amountCents,
}: CancelModalProps) {
  const { t, language } = useTranslation();
  const lang = language === "en" ? "en" : "es";
  const outsideWindow = startsAt ? !canCancelNow(startsAt) : false;
  const deadlineLabel = startsAt ? formatCancelDeadlineLabel(startsAt, lang) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] rounded-t-2xl p-6"
        style={{
          background: "var(--bg-surface)",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onDismiss} className="absolute top-4 right-4 p-1">
          <X size={20} style={{ color: "var(--text-primary)" }} />
        </button>

        <h3 className="text-lg font-black mb-4" style={{ color: "var(--text-primary)", fontFamily: "Montserrat" }}>
          {outsideWindow ? t("portal.cancelModal.blockedTitle") : t("portal.cancelModal.confirmTitle")}
        </h3>

        <div className="rounded-xl p-4 mb-4" style={{ background: "var(--bg-surface-2)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{serviceName}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {barberName} - {dateTime}
          </p>
        </div>

        {outsideWindow ? (
          <>
            <div className="rounded-xl p-3 mb-4 flex gap-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertTriangle size={18} style={{ color: "var(--red)", flexShrink: 0 }} className="mt-0.5" />
              <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                {t("portal.cancelModal.blockedBodyPrefix")} <strong>{deadlineLabel}</strong>{". "}
                {t("portal.cancelModal.blockedBodySuffix")}
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {t("portal.cancelModal.understood")}
            </button>
          </>
        ) : (
          <>
            {willRefund && typeof amountCents === "number" && amountCents > 0 && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-color)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {t("portal.cancelModal.refundNotice", { amount: (amountCents / 100).toFixed(2) })}
                </p>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {t("portal.cancelModal.refundManualHint")}
                </p>
              </div>
            )}
            <button
              onClick={onConfirm}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm mb-3 flex items-center justify-center gap-2"
              style={{ background: "var(--red)", color: "#fff", opacity: loading ? 0.6 : 1 }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? t("portal.cancelModal.cancelling") : t("portal.cancelModal.confirmCancel")}
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              {t("portal.cancelModal.back")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
