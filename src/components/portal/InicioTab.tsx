import { useMemo } from "react";
import { CalendarPlus, CalendarDays, CreditCard, Clock, Scissors, TrendingUp, Repeat, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "@/hooks/useTranslation";
import type { PortalAppointment } from "./types";
import { PortalBrandLogo } from "@/components/PortalBrandLogo";
import AppointmentCard from "./AppointmentCard";
import { serviceKey } from "./serviceKey";

interface InicioTabProps {
  firstName: string;
  upcoming: PortalAppointment[];
  past: PortalAppointment[];
  cancelWindowHours: number;
  onCancel: (appt: PortalAppointment) => void;
  onTabChange?: (tab: string) => void;
  preferredBarberName?: string | null;
}

export default function InicioTab({ firstName, upcoming, past, cancelWindowHours, onCancel, onTabChange, preferredBarberName }: InicioTabProps) {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const next = upcoming[0] || null;
  const lastVisit = past[0] || null;
  const localeTag = language === "en" ? "en-US" : "es-PR";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t("portal.inicio.greetingMorning");
    if (h < 18) return t("portal.inicio.greetingAfternoon");
    return t("portal.inicio.greetingEvening");
  }, [t]);

  const countdown = (startsAt: string): string => {
    const diff = new Date(startsAt).getTime() - Date.now();
    if (diff <= 0) return t("portal.inicio.countdownNow");
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return t("portal.inicio.countdownDays", { d: days, h: hours % 24 });
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return t("portal.inicio.countdownHours", { h: hours, m: mins });
    return t("portal.inicio.countdownMinutes", { m: mins });
  };

  const stats = useMemo(() => {
    const total = past.length + upcoming.length;
    return { totalVisits: total };
  }, [past, upcoming]);

  return (
    <div className="px-4 pt-14 pb-4">
      <PortalBrandLogo />
      {/* Time-based greeting */}
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl mb-1"
        style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {greeting}, {firstName}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-xs mb-6"
        style={{ color: "var(--text-secondary)" }}
      >
        {upcoming.length === 0
          ? t("portal.inicio.noUpcoming")
          : upcoming.length === 1
          ? t("portal.inicio.upcomingOne")
          : t("portal.inicio.upcomingMany", { count: upcoming.length })}
      </motion.p>

      {/* Next appointment — hero card */}
      {next ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--text-secondary)" }}>
            {t("portal.inicio.nextAppointmentLabel")}
          </p>
          <div className="card-portal-hero rounded-2xl p-5 relative overflow-hidden">
            <div
              className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.04)" }}
            />
            <div
              className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.03)" }}
            />

            <div className="relative z-[1]">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} style={{ color: "var(--portal-hero-fg-muted)" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--portal-hero-fg-muted)" }}>
                  {countdown(next.starts_at)}
                </span>
              </div>
              <p className="text-lg font-black mb-1" style={{ color: "var(--portal-hero-fg)", letterSpacing: "-0.5px" }}>
                {next.service_name}
              </p>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: next.barber_color || "var(--portal-hero-fg-muted)" }}
                />
                <span className="text-sm" style={{ color: "var(--portal-hero-fg-muted)" }}>
                  {next.barber_name}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--portal-hero-fg-muted)" }}>
                {new Date(next.starts_at).toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric" })}
                {" - "}
                {new Date(next.starts_at).toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit", hour12: true })}
              </p>

              {/* Actions row */}
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => onCancel(next)}
                  className="text-[11px] font-semibold px-4 py-2 rounded-lg"
                  style={{ background: "var(--accent-dim)", color: "var(--portal-hero-fg)" }}
                >
                  {t("portal.inicio.cancel")}
                </button>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      apptId: next.id,
                      acuityId: String(next.acuity_id),
                      typeId: serviceKey(next),
                      barberId: next.barber_id,
                      service: next.service_name,
                      barber: next.barber_name,
                      duration: String(next.duration_minutes || 30),
                    });
                    navigate(`/app/cliente/reagendar?${params.toString()}`);
                  }}
                  className="btn-hero-outline text-[11px] font-semibold px-4 py-2 rounded-lg"
                >
                  {t("portal.inicio.reschedule")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--text-secondary)" }}>
            {t("portal.inicio.bookSectionLabel")}
          </p>
          <div className="card-portal-hero rounded-2xl p-6 relative overflow-hidden">
            <Scissors
              size={120}
              strokeWidth={1}
              className="absolute -top-4 -right-4 opacity-[0.06] rotate-12"
              style={{ color: "var(--portal-hero-fg)" }}
            />
            <div className="relative z-[1]">
              <p
                className="font-black uppercase whitespace-pre-line mb-2"
                style={{
                  fontSize: "clamp(22px, 6vw, 28px)",
                  letterSpacing: "-0.25px",
                  lineHeight: 1.1,
                  color: "var(--portal-hero-fg)",
                }}
              >
                {t("portal.inicio.bookCtaTitle")}
              </p>
              <p className="text-sm mb-5" style={{ color: "var(--portal-hero-fg-muted)" }}>
                {t("portal.inicio.bookCtaSubtitle")}
              </p>
              <button
                onClick={() => navigate("/app/cliente/nueva-cita")}
                className="btn-hero-outline inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-transform active:scale-95"
              >
                {t("portal.inicio.bookCtaButton")}
                <ArrowRight className="icon-bold" size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* More upcoming appointments */}
      {upcoming.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--text-secondary)" }}>
            {t("portal.inicio.moreUpcomingLabel")}
          </p>
          <div className="space-y-2">
            {upcoming.slice(1, 4).map((a) => (
              <AppointmentCard key={a.id} appt={a} cancelWindowHours={cancelWindowHours} onCancel={() => onCancel(a)} showStatus />
            ))}
          </div>
          {upcoming.length > 4 && (
            <button
              onClick={() => onTabChange?.("citas")}
              className="text-xs font-semibold mt-2"
              style={{ color: "var(--accent-color)" }}
            >
              {t("portal.inicio.viewAll", { count: upcoming.length })}
            </button>
          )}
        </motion.div>
      )}

      {/* Quick stats */}
      {stats.totalVisits > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          <button
            onClick={() => onTabChange?.("citas")}
            className="rounded-xl p-4 card-elevated text-left active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} style={{ color: "var(--nav-accent)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                {t("portal.inicio.statVisits")}
              </span>
            </div>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)", letterSpacing: "-1px" }}>
              {stats.totalVisits}
            </p>
          </button>
          <button
            onClick={() => onTabChange?.("perfil")}
            className="rounded-xl p-4 card-elevated text-left active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center gap-2 mb-2">
              <Scissors size={16} style={{ color: "var(--nav-accent)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                {t("portal.inicio.statBarber")}
              </span>
            </div>
            <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {preferredBarberName || t("portal.inicio.barberUndetermined")}
            </p>
          </button>
        </motion.div>
      )}

      {/* Quick access */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--text-secondary)" }}>
          {t("portal.inicio.quickAccessLabel")}
        </p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => navigate("/app/cliente/nueva-cita")}
            className="rounded-xl p-4 text-center card-elevated active:scale-[0.97] transition-transform"
          >
            <CalendarPlus size={22} className="mx-auto mb-2" style={{ color: "var(--nav-accent)" }} />
            <p className="text-[11px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{t("portal.inicio.quickBook")}</p>
          </button>
          <button
            onClick={() => onTabChange?.("citas")}
            className="rounded-xl p-4 text-center card-elevated active:scale-[0.97] transition-transform"
          >
            <CalendarDays size={22} className="mx-auto mb-2" style={{ color: "var(--nav-accent)" }} />
            <p className="text-[11px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{t("portal.inicio.quickAppointments")}</p>
          </button>
          <button
            onClick={() => onTabChange?.("perfil")}
            className="rounded-xl p-4 text-center card-elevated active:scale-[0.97] transition-transform"
          >
            <CreditCard size={22} className="mx-auto mb-2" style={{ color: "var(--nav-accent)" }} />
            <p className="text-[11px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{t("portal.inicio.quickWallet")}</p>
          </button>
        </div>
      </motion.div>

      {/* Last visit — editorial card */}
      {lastVisit && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--accent-color)" }}
            >
              {t("portal.inicio.lastVisitLabel")}
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          <div className="card-portal-hero rounded-2xl p-5 relative overflow-hidden">
            <div
              className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.04)" }}
            />
            <div
              className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.03)" }}
            />

            <div className="relative z-[1]">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} style={{ color: "var(--portal-hero-fg-muted)" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--portal-hero-fg-muted)" }}>
                  {new Date(lastVisit.starts_at).toLocaleDateString(localeTag, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-lg font-black mb-1" style={{ color: "var(--portal-hero-fg)", letterSpacing: "-0.5px" }}>
                {lastVisit.service_name}
              </p>
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: lastVisit.barber_color || "var(--portal-hero-fg-muted)" }}
                />
                <span className="text-sm" style={{ color: "var(--portal-hero-fg-muted)" }}>
                  {lastVisit.barber_name}
                </span>
              </div>

              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    repeat: "true",
                    barberId: lastVisit.barber_id,
                    serviceTypeId: serviceKey(lastVisit),
                    serviceName: lastVisit.service_name,
                    duration: String(lastVisit.duration_minutes || 30),
                    barberName: lastVisit.barber_name,
                  });
                  navigate(`/app/cliente/nueva-cita?${params.toString()}`);
                }}
                className="btn-hero-outline w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-transform active:scale-[0.97]"
              >
                <Repeat className="icon-bold" size={14} />
                {t("portal.inicio.repeatService")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
