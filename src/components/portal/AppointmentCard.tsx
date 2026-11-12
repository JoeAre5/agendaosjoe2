import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Repeat } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { canCancelNow } from "@/lib/cancelPolicy";
import type { PortalAppointment } from "./types";
import { serviceKey } from "./serviceKey";

interface Props {
  appt: PortalAppointment;
  /** @deprecated Cancellation policy is now "midnight day before"; prop kept for backward compat */
  cancelWindowHours?: number;
  onCancel?: () => void;
  showStatus?: boolean;
}

export default function AppointmentCard({ appt, onCancel, showStatus }: Props) {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const d = new Date(appt.starts_at);
  const now = Date.now();
  const canCancel = canCancelNow(appt.starts_at, now);
  const isUpcoming = ["scheduled", "confirmed"].includes(appt.status) && d.getTime() > now;
  const hasActions = isUpcoming && canCancel;

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    scheduled: { bg: "var(--accent-dim)", text: "var(--nav-accent)", label: t("portal.appointmentCard.statusScheduled") },
    confirmed: { bg: "rgba(34,197,94,0.15)", text: "var(--green)", label: t("portal.appointmentCard.statusConfirmed") },
    completed: { bg: "var(--accent-dim)", text: "var(--text-secondary)", label: t("portal.appointmentCard.statusCompleted") },
    cancelled: { bg: "rgba(239,68,68,0.15)", text: "var(--red)", label: t("portal.appointmentCard.statusCancelled") },
    "no-show": { bg: "rgba(234,179,8,0.15)", text: "var(--yellow)", label: t("portal.appointmentCard.statusNoShow") },
    "in-progress": { bg: "rgba(59,130,246,0.15)", text: "#3b82f6", label: t("portal.appointmentCard.statusInProgress") },
  };
  const style = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
  const localeTag = language === "en" ? "en-US" : "es-PR";

  const handleReschedule = () => {
    const params = new URLSearchParams({
      apptId: appt.id,
      acuityId: String(appt.acuity_id),
      typeId: serviceKey(appt),
      barberId: appt.barber_id,
      service: appt.service_name,
      barber: appt.barber_name,
      duration: String(appt.duration_minutes || 30),
      startsAt: appt.starts_at,
    });
    navigate(`/app/cliente/reagendar?${params.toString()}`);
  };

  const handleRepeat = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams({
      repeat: "true",
      barberId: appt.barber_id,
      serviceTypeId: serviceKey(appt),
      serviceName: appt.service_name,
      duration: String(appt.duration_minutes || 30),
      barberName: appt.barber_name,
    });
    navigate(`/app/cliente/nueva-cita?${params.toString()}`);
  };

  return (
    <div
      className="rounded-xl p-4 transition-all card-elevated"
      style={{ cursor: hasActions ? "pointer" : "default" }}
      onClick={() => hasActions && setExpanded((prev) => !prev)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* service.name is Acuity-sourced; intentionally Spanish-only in v1.0 */}
          {/* (Camuy market). Add translation layer in v2.0 if expanding. */}
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{appt.service_name}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: appt.barber_color || "var(--nav-accent)" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{appt.barber_name}</span>
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
            {d.toLocaleDateString(localeTag, { weekday: "short", month: "short", day: "numeric" }).replace(/ de /g, ' ')} -{" "}
            {d.toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit", hour12: true })}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {showStatus && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.text }}>
              {style.label}
            </span>
          )}
          <button
            onClick={handleRepeat}
            aria-label={t("portal.inicio.repeatService")}
            className="p-1.5 rounded-full active:scale-90 transition-transform"
            style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}
          >
            <Repeat size={13} strokeWidth={2} />
          </button>
        </div>
      </div>


      {hasActions && expanded && (
        <div className="divider-hairline flex items-center gap-2 mt-3 pt-3">
          {onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}
            >
              {t("portal.appointmentCard.cancel")}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleReschedule(); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}
          >
            {t("portal.appointmentCard.reschedule")}
          </button>
        </div>
      )}
    </div>
  );
}
