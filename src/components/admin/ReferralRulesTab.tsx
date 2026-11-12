// Shared "Rules" tab for Red Interna and Red de Clientes.
// Pure UI, no DB — content lives in locales under referrals.rules.*
import { BookOpen, Coins, RotateCcw, ShieldCheck, Slash, Undo2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

type SectionKey = "production" | "notCounted" | "reset" | "reallocation" | "points" | "refunds";

const SECTIONS: { key: SectionKey; icon: typeof BookOpen }[] = [
  { key: "production",   icon: ShieldCheck },
  { key: "notCounted",   icon: Slash },
  { key: "reset",        icon: RotateCcw },
  { key: "reallocation", icon: Undo2 },
  { key: "points",       icon: Coins },
  { key: "refunds",      icon: Undo2 },
];

export default function ReferralRulesTab({ variant: _variant = "internal" }: { variant?: "internal" | "client" }) {
  const { t } = useTranslation();

  return (
    <div className="pt-4 pb-12">
      <div className="px-4 sm:px-6">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={14} style={{ color: "var(--text-tertiary)" }} />
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            {t("referrals.rules.title")}
          </span>
        </div>
        <p className="text-[12px] leading-snug mb-3" style={{ color: "var(--text-secondary)" }}>
          {t("referrals.rules.intro")}
        </p>

        <div className="space-y-2">
          {SECTIONS.map(({ key, icon: Icon }) => (
            <div key={key} className="rounded-xl p-3 card-elevated">
              <div className="flex items-start gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--accent-dim)" }}
                >
                  <Icon size={14} style={{ color: "var(--nav-accent)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
                    {t(`referrals.rules.${key}.title`)}
                  </div>
                  <p className="text-[11.5px] mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
                    {t(`referrals.rules.${key}.body`)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
