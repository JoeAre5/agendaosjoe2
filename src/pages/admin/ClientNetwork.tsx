// Admin Client Network shell — tabs: overview, benefits, ledger, links, settings.
import { lazy, Suspense, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { useTranslation } from "@/hooks/useTranslation";

const OverviewTab = lazy(() => import("@/components/admin/client-network/OverviewTab"));
const RewardsLedgerTab = lazy(() => import("@/components/admin/client-network/RewardsLedgerTab"));
const ReferralLinksTab = lazy(() => import("@/components/admin/client-network/ReferralLinksTab"));
const RewardsSettingsTab = lazy(() => import("@/components/admin/client-network/RewardsSettingsTab"));
const ReferralRulesTab = lazy(() => import("@/components/admin/ReferralRulesTab"));

type TabId = "overview" | "ledger" | "links" | "settings" | "rules";
const TAB_IDS: TabId[] = ["overview", "ledger", "links", "settings", "rules"];


export default function ClientNetwork() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const isEs = language === "es";
  const [params, setParams] = useSearchParams();
  const tab = (TAB_IDS.includes(params.get("tab") as TabId) ? params.get("tab") : "overview") as TabId;

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const labels = useMemo(
    () =>
      isEs
        ? { overview: "Resumen", ledger: "Puntos", links: "Enlaces", settings: "Ajustes", rules: "Reglas" }
        : { overview: "Overview", ledger: "Ledger", links: "Links", settings: "Settings", rules: "Rules" },
    [isEs]
  );


  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={isEs ? "Red de Clientes" : "Client Network"}
        subtitle={isEs ? "Rewards y referidos" : "Rewards + Referrals"}
        onBack={() => navigate("/admin/referidos")}
      />

      <div className="px-4 sm:px-6 pt-1">
        <SegmentedTabs
          tabs={TAB_IDS.map((id) => ({ id, label: labels[id] }))}
          value={tab}
          onChange={setTab}
          fitContent
          layoutId="client-network-tabs"
          labelClassName="text-[11px] px-2"
        />
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
          </div>
        }
      >
        {tab === "overview" && <OverviewTab isEs={isEs} />}
        {tab === "ledger" && <RewardsLedgerTab isEs={isEs} />}
        {tab === "links" && <ReferralLinksTab isEs={isEs} />}
        {tab === "settings" && <RewardsSettingsTab isEs={isEs} />}
        {tab === "rules" && <ReferralRulesTab variant="client" />}

      </Suspense>
    </div>
  );
}

