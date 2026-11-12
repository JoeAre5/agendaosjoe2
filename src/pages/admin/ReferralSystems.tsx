import { useNavigate } from "react-router-dom";
import { Users, UserPlus, Briefcase, Lock, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { SubpageHeader } from "@/components/SubpageHeader";

interface SystemCard {
  slug: string;
  labelKey: string;
  titleKey: string;
  descKey: string;
  active: boolean;
  icon: typeof Users;
  route?: string;
}

const SYSTEMS: SystemCard[] = [
  {
    slug: "barber_to_client",
    labelKey: "referrals.systems.internal",
    titleKey: "referrals.systems.internalSub",
    descKey: "referrals.systems.internalDesc",
    active: true,
    icon: Users,
    route: "/admin/referidos/interna",
  },
  {
    slug: "client_to_client",
    labelKey: "referrals.systems.client",
    titleKey: "referrals.systems.clientSub",
    descKey: "referrals.systems.clientDesc",
    active: true,
    icon: UserPlus,
    route: "/admin/client-network",
  },

  {
    slug: "representative_to_professional",
    labelKey: "referrals.systems.professional",
    titleKey: "referrals.systems.professionalSub",
    descKey: "referrals.systems.professionalDesc",
    active: false,
    icon: Briefcase,
  },
];

export default function ReferralSystems() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={t("referrals.title")}
        onBack={() => navigate("/admin?tab=menu")}
        subtitle={t("referrals.subtitle")}
      />

      <p
        className="px-4 sm:px-6 pb-3 text-[12px] leading-snug"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("referrals.intro")}
      </p>




      <div className="px-4 sm:px-6 space-y-3 pb-10">
        {SYSTEMS.map((s) => {
          const Icon = s.icon;
          const clickable = s.active && s.route;
          return (
            <button
              key={s.slug}
              onClick={() => clickable && navigate(s.route!)}
              disabled={!clickable}
              className="w-full text-left rounded-2xl p-4 card-elevated transition"
              style={{
                opacity: clickable ? 1 : 0.55,
                cursor: clickable ? "pointer" : "not-allowed",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{
                    width: 40,
                    height: 40,
                    background: clickable ? "var(--accent-dim)" : "var(--bg-elevated)",
                  }}
                >
                  {clickable ? (
                    <Icon size={20} style={{ color: "var(--nav-accent)" }} />
                  ) : (
                    <Lock size={18} style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                        {t(s.labelKey)}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {t(s.titleKey)}
                      </div>
                    </div>
                    {clickable && (
                      <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
                    )}
                  </div>
                  <p className="text-[12px] mt-2 leading-snug" style={{ color: "var(--text-secondary)" }}>
                    {t(s.descKey)}
                  </p>
                  <div className="mt-2.5">
                    <span
                      className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{
                        background: s.active ? "rgba(34,197,94,0.15)" : "var(--bg-elevated)",
                        color: s.active ? "#22c55e" : "var(--text-tertiary)",
                      }}
                    >
                      {t(s.active ? "referrals.status.active" : "referrals.status.comingSoon")}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
