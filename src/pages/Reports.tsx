import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, Download } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { WeekBanner } from "@/components/WeekBanner";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { useWeekSelector } from "@/hooks/useWeekSelector";
import { useReportData } from "@/hooks/useReportData";
import { useTranslation } from "@/hooks/useTranslation";
import { NominaContent } from "@/components/reports/NominaContent";
import { CuadreContent } from "@/components/reports/CuadreContent";
import { ShopContent } from "@/components/reports/ShopContent";
import { RetentionContent } from "@/components/reports/RetentionContent";
import { ExportPLModal } from "@/components/reports/ExportPLModal";

type ReportTab = "nomina" | "cuadre" | "shop" | "retention";

export default function Reports() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const week = useWeekSelector();
  const {
    barbers, transactions, appointments, expenses, settings, loading,
    productCommissionByBarber, productSalesByBarber, productSalesDetail,
  } = useReportData(week.weekStart, week.weekEnd, week.scope);
  const [activeTab, setActiveTab] = useState<ReportTab>("nomina");
  const [exportOpen, setExportOpen] = useState(false);

  // Duplicate detection: appointments with 2+ completed service tx, excluding dismissed.
  const duplicateCount = useMemo(() => {
    const counts = new Map<string, number>();
    const dismissed = new Set<string>();
    (transactions || []).forEach((t: any) => {
      if (t.status === "completed" && t.type === "service" && t.appointment_id) {
        counts.set(t.appointment_id, (counts.get(t.appointment_id) || 0) + 1);
      }
    });
    (appointments || []).forEach((a: any) => {
      if (a.duplicate_dismissed_at) dismissed.add(a.id);
    });
    let n = 0;
    counts.forEach((c, id) => { if (c >= 2 && !dismissed.has(id)) n++; });
    return n;
  }, [transactions, appointments]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="sticky top-0 z-30" style={{ background: "var(--bg-base)" }}>
        <SubpageHeader
          title={t("menu.reports")}
          onBack={() => navigate("/admin?tab=menu")}
          actions={
            <button
              onClick={() => setExportOpen(true)}
              className="p-2 rounded-lg flex items-center gap-1.5"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
              aria-label="Exportar P&L"
            >
              <Download size={16} />
              <span className="text-xs font-semibold">Exportar</span>
            </button>
          }
        />

        <ExportPLModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          currentWeekStart={week.weekStart}
          currentWeekEnd={week.weekEnd}
        />

        {/* Tab toggle pill — unified SegmentedTabs */}
        <div className="flex justify-center px-4 mb-6 pb-2">
          <SegmentedTabs<ReportTab>
            width={360}
            layoutId="report-tab-pill"
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: "nomina", label: t("reports.nomina") },
              { id: "cuadre", label: t("reports.cuadre") },
              { id: "shop", label: "Shop" },
              { id: "retention", label: t("reports.retention") },
            ]}
          />
        </div>

        <WeekBanner
          label={week.label}
          scope={week.scope}
          onPrev={week.goPrev}
          onNext={week.goNext}
          onToday={week.goToday}
          onScopeChange={week.setScope}
          onPickDate={week.goToDate}
          showScopeToggle
          selectedDate={week.weekStart}
          noStick
        />
      </div>

      {!loading && duplicateCount > 0 && (
        <button
          onClick={() => navigate("/admin/sales?status=pending_review")}
          className="mx-4 mt-3 mb-1 w-[calc(100%-2rem)] flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          <AlertTriangle size={14} style={{ color: "#ef4444" }} />
          <span className="text-[11px] font-bold flex-1 text-left" style={{ color: "#ef4444" }}>
            {t(duplicateCount === 1 ? "duplicates.weekAlertOne" : "duplicates.weekAlertMany", { count: duplicateCount })}
          </span>
          <span className="text-[11px] font-bold" style={{ color: "#ef4444" }}>{t("duplicates.weekAlertCta")} →</span>
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <>
          {activeTab === "nomina" && (
            <NominaContent
              barbers={barbers}
              transactions={transactions}
              appointments={appointments}
              expenses={expenses}
              settings={settings}
              rangeLabel={week.rangeLabel}
              productCommissionByBarber={productCommissionByBarber}
              productSalesByBarber={productSalesByBarber}
            />
          )}
          {activeTab === "cuadre" && (
            <CuadreContent
              barbers={barbers}
              transactions={transactions}
              appointments={appointments}
              expenses={expenses}
              settings={settings}
              rangeLabel={week.rangeLabel}
              productSalesDetail={productSalesDetail}
            />
          )}
          {activeTab === "shop" && (
            <ShopContent
              barbers={barbers}
              transactions={transactions}
              appointments={appointments}
              productSalesDetail={productSalesDetail}
              rangeLabel={week.rangeLabel}
            />
          )}
          {activeTab === "retention" && <RetentionContent />}
        </>
      )}
    </div>
  );
}
