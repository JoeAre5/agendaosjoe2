import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { startOfWeek, endOfWeek, addWeeks, format, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { WeekBanner } from "@/components/WeekBanner";
import { useReportData } from "@/hooks/useReportData";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction } from "@/lib/unifiedProduction";
import { computeGatewayFee } from "@/lib/gatewayFees";
import { generateSPPaystub, generateW2Paystub, getNextCheckNumber } from "@/lib/paystub";
import { ServiceSummaryCard } from "@/components/reports/ServiceSummaryCard";
import { computeCommissionBonus } from "@/lib/commissionBonus";

// Earliest selectable week: Saturday April 4, 2026
const MIN_DATE = new Date(2026, 3, 4); // month is 0-indexed
const MIN_WEEK_START = startOfWeek(MIN_DATE, { weekStartsOn: 6 });

function fmt(cents: number) {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

function PayRow({ label, value, negative, highlight }: { label: string; value: string; negative?: boolean; highlight?: boolean }) {
  const valueColor = highlight
    ? "var(--green, #16a34a)"
    : negative
    ? "var(--red)"
    : "var(--text-primary)";
  return (
    <div className="flex justify-between py-1.5">
      <span
        className="text-sm"
        style={{ color: highlight ? "var(--green, #16a34a)" : "var(--text-secondary)", fontWeight: highlight ? 700 : 400 }}
      >
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

export default function BarberPaystubs() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language } = usePreferences();
  const { user, isOwner } = useAuth();
  const locale = language === "es" ? es : undefined;

  const [barberId, setBarberId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Resolve the logged-in user's barber_id (owner can also have one for testing)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("barber_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setBarberId(data?.barber_id || null);
        setProfileLoading(false);
      });
  }, [user]);

  // Week selector clamped to MIN_WEEK_START
  const todayWeek = startOfWeek(new Date(), { weekStartsOn: 6 });
  const initialWeek = isBefore(todayWeek, MIN_WEEK_START) ? MIN_WEEK_START : todayWeek;
  const [weekStart, setWeekStart] = useState<Date>(initialWeek);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 6 }), [weekStart]);
  const atMin = !isBefore(MIN_WEEK_START, weekStart); // weekStart <= MIN_WEEK_START

  const goPrev = () => {
    const next = addWeeks(weekStart, -1);
    if (!isBefore(next, MIN_WEEK_START)) setWeekStart(next);
  };
  const goNext = () => setWeekStart((w) => addWeeks(w, 1));
  const goToday = () => {
    const tw = startOfWeek(new Date(), { weekStartsOn: 6 });
    setWeekStart(isBefore(tw, MIN_WEEK_START) ? MIN_WEEK_START : tw);
  };
  const goToDate = (d: Date) => {
    const ws = startOfWeek(d, { weekStartsOn: 6 });
    setWeekStart(isBefore(ws, MIN_WEEK_START) ? MIN_WEEK_START : ws);
  };

  const label = `${format(weekStart, "d MMM", { locale })} - ${format(weekEnd, "d MMM", { locale })}`;
  const rangeLabel = `${format(weekStart, "d MMM", { locale })} - ${format(weekEnd, "d MMM yyyy", { locale })}`;

  const { barbers, transactions, appointments, settings, loading, productCommissionByBarber } = useReportData(weekStart, weekEnd, "week");

  const me = useMemo(() => barbers.find((b) => b.id === barberId), [barbers, barberId]);

  // Compute the single barber card data using the same logic as NominaContent
  const card = useMemo(() => {
    if (!me) return null;
    const fallbackRate = settings?.digital_fee_rate || 0.10;
    const rows = buildUnifiedProduction(
      appointments as unknown as RawAppointment[],
      transactions as unknown as RawTransaction[]
    ).filter((r) => r.barber_id === me.id);

    let cash = 0, digital = 0, tipsCash = 0, tipsDigital = 0, digitalFee = 0, tipFee = 0;
    rows.forEach((r) => {
      const subFee = computeGatewayFee(r.subtotal_cents, r.processor, fallbackRate);
      const tFee = r.tip_cents > 0
        ? computeGatewayFee(r.subtotal_cents + r.tip_cents, r.processor, fallbackRate) - subFee
        : 0;
      if (r.pm === "digital") {
        digital += r.subtotal_cents;
        digitalFee += subFee;
      } else {
        cash += r.subtotal_cents;
      }
      if (r.tip_cents > 0) {
        if (r.pm === "digital") {
          tipsDigital += r.tip_cents;
          tipFee += Math.max(0, tFee);
        } else {
          tipsCash += r.tip_cents;
        }
      }
    });

    return { cash, digital, tipsCash, tipsDigital, digitalFee, tipFee };
  }, [me, appointments, transactions, settings]);

  const company = { legal_entity: settings?.legal_entity, address: settings?.address, city: settings?.city };

  // ---- RENDER STATES ----

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  // Owners without a linked barber profile shouldn't see an empty page
  if (!me) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Header onBack={() => navigate("/admin?tab=menu")} title={language === "es" ? "Talonarios" : "Paystubs"} />
        <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Tu cuenta no está enlazada a un perfil de barbero."
            : "Your account is not linked to a barber profile."}
        </div>
      </div>
    );
  }

  // Render content based on employment type
  let content: JSX.Element;
  if (me.employment_type === "commission" && card) {
    const gross = card.cash + card.digital;
    const production = gross - card.digitalFee;
    const baseRate = me.commission_rate ?? 0.65;
    const bonus = computeCommissionBonus(baseRate, gross, (me as any).bonus_threshold_cents);
    const commRate = bonus.effectiveRate;
    const retRate = me.retention_rate ?? 0;
    const preNet = Math.round(production * commRate);
    const retention = Math.round(preNet * retRate);
    const subtotal = preNet - retention;
    const totalTips = card.tipsCash + card.tipsDigital;
    const netTips = totalTips - card.tipFee;
    const productCommission = productCommissionByBarber?.[me.id] || 0;
    const payout = subtotal + netTips + productCommission;

    content = (
      <div className="rounded-xl p-4 card-elevated space-y-2">
        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{me.name}</div>
        <PayRow label="Producción bruta" value={fmt(gross)} />
        {card.digitalFee > 0 && <PayRow label="Cuota digital" value={`-${fmt(card.digitalFee)}`} negative />}
        <PayRow label="Producción neta" value={fmt(production)} />
        <PayRow
          highlight={bonus.bonusActive}
          label={
            bonus.bonusActive
              ? `Comisión ${(commRate * 100).toFixed(0)}% ✨ (bonificación +5%)${retRate > 0 ? ` (menos ${(retRate * 100).toFixed(0)}% retención)` : ""}`
              : `Comisión ${(commRate * 100).toFixed(0)}%${retRate > 0 ? ` (menos ${(retRate * 100).toFixed(0)}% retención)` : ""}`
          }
          value={fmt(subtotal)}
        />
        {bonus.bonusActive && (
          <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--green, #16a34a)" }}>
            {language === "es"
              ? `Tasa subió de ${(bonus.baseRate * 100).toFixed(0)}% a ${(commRate * 100).toFixed(0)}% esta semana.`
              : `Rate bumped from ${(bonus.baseRate * 100).toFixed(0)}% to ${(commRate * 100).toFixed(0)}% this week.`}
          </div>
        )}
        {totalTips > 0 && (
          <>
            <PayRow label="Propinas" value={`+${fmt(netTips)}`} />
            {card.tipFee > 0 && (
              <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--text-tertiary)" }}>
                Propinas brutas {fmt(totalTips)} menos cuota digital de {fmt(card.tipFee)} cobrada por el procesador.
              </div>
            )}
          </>
        )}
        {productCommission > 0 && (
          <>
            <PayRow label="Comisión de productos" value={`+${fmt(productCommission)}`} />
            <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--text-tertiary)" }}>
              Solo productos vendidos dentro de citas.
            </div>
          </>
        )}
        <div className="pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Pago Neto (Comisión + Propinas{productCommission > 0 ? " + Productos" : ""})
          </div>
          <div className="text-xl font-black" style={{ color: "var(--accent-color)" }}>{fmt(payout)}</div>
        </div>
        <button
          onClick={async () => {
            const checkNumber = await getNextCheckNumber();
            generateSPPaystub({
              name: me.name,
              professionalFees: preNet,
              retainedEarnings: retention,
              netTips,
              productCommission,
              checkDate: rangeLabel,
              checkNumber,
              company,
            });
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs mt-2"
          style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
        >
          <FileText size={14} /> {language === "es" ? "Generar Talonario" : "Generate Paystub"}
        </button>
      </div>
    );
  } else if (me.employment_type === "w2_fixed" && card) {
    const gross = card.cash + card.digital;
    const production = gross - card.digitalFee;
    const w2Gross = me.weekly_salary || 57000;
    const ss = Math.round(w2Gross * 0.062);
    const medicare = Math.round(w2Gross * 0.0145);
    const pr = Math.round(w2Gross * 0.04);
    const sinot = Math.round(w2Gross * 0.003);
    const net = w2Gross - ss - medicare - pr - sinot;

    content = (
      <div className="rounded-xl p-4 card-elevated space-y-2">
        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{me.name} — W-2 Fijo</div>
        <PayRow label="Producción bruta" value={fmt(gross)} />
        <PayRow label="Cuota digital" value={`-${fmt(card.digitalFee)}`} negative />
        <PayRow label="Producción neta" value={fmt(production)} />
        <PayRow label="W-2 Bruto" value={fmt(w2Gross)} />
        <PayRow label="Seg. Social 6.2%" value={`-${fmt(ss)}`} negative />
        <PayRow label="Medicare 1.45%" value={`-${fmt(medicare)}`} negative />
        <PayRow label="Contrib. Estatal 4%" value={`-${fmt(pr)}`} negative />
        <PayRow label="Seg. Incapacidad 0.3%" value={`-${fmt(sinot)}`} negative />
        <div className="pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Cheque Neto</div>
          <div className="text-xl font-black" style={{ color: "var(--accent-color)" }}>{fmt(net)}</div>
        </div>
        <button
          onClick={async () => {
            const checkNumber = await getNextCheckNumber();
            generateW2Paystub({
              name: me.name,
              employeeId: me.employee_id || undefined,
              ssnLast4: me.ssn_last4 || undefined,
              gross: w2Gross,
              socSec: ss,
              medicare,
              stIncome: pr,
              stDisIns: sinot,
              netCheck: net,
              payPeriodStart: rangeLabel.split("–")[0]?.trim() || rangeLabel,
              payPeriodEnd: rangeLabel.split("–")[1]?.trim() || rangeLabel,
              checkDate: rangeLabel,
              checkNumber,
              salary: w2Gross,
              company,
            });
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs mt-2"
          style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
        >
          <FileText size={14} /> {language === "es" ? "Generar Talonario W-2" : "Generate W-2 Paystub"}
        </button>
      </div>
    );
  } else {
    content = (
      <div className="rounded-xl p-4 card-elevated text-sm" style={{ color: "var(--text-secondary)" }}>
        {language === "es"
          ? "No hay talonario disponible para este tipo de empleo en esta semana."
          : "No paystub available for this employment type this week."}
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="sticky top-0 z-30" style={{ background: "var(--bg-base)" }}>
        <Header
          onBack={() => navigate("/admin?tab=menu")}
          title={language === "es" ? "Talonarios" : "Paystubs"}
        />
        <WeekBanner
          label={label}
          onPrev={atMin ? () => {} : goPrev}
          onNext={goNext}
          onToday={goToday}
          onPickDate={goToDate}
          selectedDate={weekStart}
          noStick
        />
      </div>
      <div className="px-4 py-4 space-y-4 pb-24">
        {atMin && (
          <p className="text-[11px] text-center" style={{ color: "var(--text-tertiary)" }}>
            {language === "es"
              ? "Los talonarios comienzan el 4 de abril de 2026."
              : "Paystubs start on April 4, 2026."}
          </p>
        )}
        {me && (
          <ServiceSummaryCard
            barberId={me.id}
            appointments={appointments as any}
            transactions={transactions as any}
            language={language}
          />
        )}
        {me && card && me.employment_type === "commission" && (() => {
          const gross = card.cash + card.digital;
          const threshold = (me as any).bonus_threshold_cents || 0;
          if (threshold <= 0) return null;
          const pct = Math.min(100, (gross / threshold) * 100);
          const met = gross >= threshold;
          const barColor = met ? "var(--green, #16a34a)" : "var(--accent-color)";
          return (
            <div className="rounded-xl p-4 card-elevated">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", letterSpacing: "0.5px" }}>
                  {language === "es" ? "Progreso a Bonificación" : "Bonus Progress"}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: barColor }}>
                  {fmt(gross)} / {fmt(threshold)}
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: barColor, minWidth: pct > 0 ? 4 : 0 }}
                />
              </div>
              {met && (
                <div className="text-[11px] mt-1.5 font-semibold" style={{ color: "var(--green, #16a34a)" }}>
                  {language === "es" ? "✨ ¡Bonificación activada!" : "✨ Bonus unlocked!"}
                </div>
              )}
            </div>
          );
        })()}
        {content}
      </div>
    </div>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return <SubpageHeader title={title} onBack={onBack} />;
}
