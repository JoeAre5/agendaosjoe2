import { useState, useEffect, useMemo, useCallback } from "react";
import { Gift, Trophy, Loader2, Link2, Copy, Check, Share2, Lock, Star } from "lucide-react";
import { fireCelebrationConfetti } from "@/lib/celebrationConfetti";
import { resolveBenefitIcon } from "@/lib/benefitIcons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { PortalBrandLogo } from "@/components/PortalBrandLogo";
import { SlideToUnlock } from "@/components/portal/SlideToUnlock";

const fireConfetti = fireCelebrationConfetti;

type BenefitRow = {
  id: string;
  title_es: string;
  title_en: string;
  description_es: string | null;
  description_en: string | null;
  required_points: number;
  icon: string | null;
  sort_order: number;
  unlocked: boolean;
  has_active_voucher: boolean;
  progress_pct: number;
};

type HistoryRow = {
  id: string;
  points: number;
  source_type: string;
  description_es: string | null;
  description_en: string | null;
  created_at: string;
};

type ActiveVoucher = {
  id: string;
  code: string;
  points_cost: number;
  claimed_at: string;
  expires_at: string;
  benefit_id: string;
  title_es: string;
  title_en: string;
  icon: string | null;
};

type Summary = {
  client_id: string;
  first_name: string | null;
  referral_slug: string | null;
  referral_slug_updated_at: string | null;
  referral_slug_next_allowed_at?: string | null;
  referral_slug_can_change?: boolean;
  balance: number;
  breakdown: { spending: number; matching_bonus: number; adjustments: number };
  referrals_count: number;
  referees?: Array<{
    client_id: string;
    first_name: string | null;
    last_initial: string | null;
    matching_points: number;
    last_bonus_at: string | null;
  }>;

  active_voucher: ActiveVoucher | null;
  next_benefit: null | {
    id: string;
    title_es: string;
    title_en: string;
    required_points: number;
    icon: string | null;
    progress_pct: number;
    points_remaining?: number;
    remaining?: number;
  };
  benefits: BenefitRow[];
  history: HistoryRow[];
};


// Shared icon registry lives in @/lib/benefitIcons so admin picks always render here.

export default function BeneficiosTab() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const isEs = language === "es";
  const localeTag = isEs ? "es-PR" : "en-US";

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugSaveBlocked, setSlugSaveBlocked] = useState(false);
  // Claim flow state
  const [pendingClaim, setPendingClaim] = useState<BenefitRow | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [voucherCopied, setVoucherCopied] = useState(false);

  type RedeemedRow = { id: string; code: string; redeemed_at: string; points_cost: number; title_es: string; title_en: string; icon: string | null };
  const [redeemedHistory, setRedeemedHistory] = useState<RedeemedRow[]>([]);



  const handleClaim = useCallback(async (benefit: BenefitRow) => {
    setClaiming(true);
    const { data, error } = await (supabase.rpc as any)("claim_benefit", { _benefit_id: benefit.id });
    setClaiming(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("active_voucher_exists")) {
        toast.error(isEs ? "Ya tienes un beneficio activo sin redimir" : "You already have an active voucher");
      } else if (msg.includes("insufficient_points")) {
        toast.error(isEs ? "No tienes puntos suficientes" : "Not enough points");
      } else {
        toast.error(isEs ? "No se pudo reclamar" : "Could not claim");
      }
      setPendingClaim(null);
      return;
    }
    fireConfetti();
    setTimeout(() => fireConfetti(), 250);
    setPendingClaim(null);
    await load();
  }, [isEs]);



  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("get_client_rewards_summary", { _client_id: null });
    if (error) {
      console.warn("[BeneficiosTab]", error);
    } else {
      setSummary(data as Summary);
      const clientId = (data as any)?.client_id;
      if (clientId) {
        const { data: rh } = await (supabase as any)
          .from("client_benefit_redemptions")
          .select("id, code, redeemed_at, points_cost, rewards_benefits(title_es, title_en, icon)")
          .eq("client_id", clientId)
          .not("redeemed_at", "is", null)
          .order("redeemed_at", { ascending: false })
          .limit(20);
        setRedeemedHistory(
          (rh || []).map((r: any) => ({
            id: r.id,
            code: r.code,
            redeemed_at: r.redeemed_at,
            points_cost: r.points_cost,
            title_es: r.rewards_benefits?.title_es ?? "",
            title_en: r.rewards_benefits?.title_en ?? "",
            icon: r.rewards_benefits?.icon ?? null,
          }))
        );
      }
    }
    
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);



  // Sync input with loaded slug
  useEffect(() => {
    if (summary?.referral_slug) setNewSlug(summary.referral_slug);
  }, [summary?.referral_slug]);

  // Debounced availability check
  useEffect(() => {
    const current = summary?.referral_slug || "";
    if (!newSlug || newSlug === current) { setSlugAvailable(null); return; }
    if (!/^[a-z0-9-]{3,30}$/.test(newSlug)) { setSlugAvailable(false); return; }
    setCheckingSlug(true);
    const h = setTimeout(async () => {
      const { data } = await (supabase.rpc as any)("check_referral_slug_available", { _slug: newSlug });
      setSlugAvailable(!!(data as any)?.available);
      setCheckingSlug(false);
    }, 350);
    return () => clearTimeout(h);
  }, [newSlug, summary?.referral_slug]);

  // Hardcoded public domain (per project memory).
  const REFERRAL_HOST = "charliesbarbershop.co";
  const REFERRAL_PREFIX = `${REFERRAL_HOST}/r/`;
  const referralUrl = useMemo(() => {
    if (!summary?.referral_slug) return "";
    return `https://${REFERRAL_PREFIX}${summary.referral_slug}`;
  }, [summary?.referral_slug]);

  const slugCooldownDays = useMemo(() => {
    if (!summary?.referral_slug_next_allowed_at) return 0;
    const remainingMs = new Date(summary.referral_slug_next_allowed_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  }, [summary?.referral_slug_next_allowed_at]);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to legacy */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  const handleCopy = async () => {
    if (!referralUrl) return;
    const hasDraft = newSlug !== (summary?.referral_slug || "");
    const ok = await copyToClipboard(referralUrl);
    if (ok) {
      setCopied(true);
      toast.success(hasDraft ? (isEs ? "Enlace actual copiado" : "Current link copied") : (isEs ? "Enlace copiado" : "Link copied"));
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error(isEs ? "No se pudo copiar" : "Couldn't copy");
    }
  };

  const handleShare = async () => {
    if (!referralUrl) return;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ url: referralUrl });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    await handleCopy();
  };

  const handleSaveSlug = async () => {
    const cleaned = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const savedSlug = summary?.referral_slug || "";
    if (cleaned.length < 3 || cleaned.length > 30) {
      toast.error(isEs ? "Entre 3 y 30 caracteres" : "Between 3 and 30 characters");
      return;
    }
    setSavingSlug(true);
    const { data, error } = await supabase.functions.invoke("update-referral-slug", {
      body: { slug: cleaned },
    });
    setSavingSlug(false);
    if (error || (data && (data as any).success === false)) {
      const msg = (data as any)?.reason || (data as any)?.error || error?.message || "";
      const currentSlug = (data as any)?.current_slug || (data as any)?.slug || savedSlug;
      if (currentSlug) setNewSlug(currentSlug);
      setSlugAvailable(null);
      if (msg.includes("taken")) toast.error(isEs ? "Ese enlace ya está en uso" : "That link is already taken");
      else if (msg.includes("cooldown")) {
        setSlugSaveBlocked(true);
        toast.error(
          isEs
            ? "No se guardó. Ya cambiaste tu enlace y debes esperar 30 días. Volvimos al enlace actual."
            : "Not saved. You already changed your link and must wait 30 days. We restored your current link.",
        );
        setTimeout(() => setSlugSaveBlocked(false), 3200);
      }
      else if (msg.includes("invalid")) toast.error(isEs ? "Formato inválido" : "Invalid format");
      else toast.error(isEs ? "No se pudo actualizar" : "Could not update");
      return;
    }
    toast.success(isEs ? "Enlace actualizado" : "Link updated");
    setSlugAvailable(null);
    load();
  };


  const sourceLabel = (source: string) => {
    if (source === "spending") return isEs ? "Gasto" : "Spending";
    if (source === "matching_bonus") return isEs ? "Bono por Referir" : "Matching Bonus";
    if (source === "launch_bonus") return isEs ? "Bono de lanzamiento" : "Launch bonus";
    if (source === "manual_adjust") return isEs ? "Ajuste manual" : "Manual adjustment";
    if (source === "redemption") return isEs ? "Canje" : "Redemption";
    if (source === "refund_reversal") return isEs ? "Reembolso" : "Refund";
    if (source === "cancellation_reversal") return isEs ? "Cancelación" : "Cancellation";
    return source;
  };

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center pt-40">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const balance = summary.balance;
  const next = summary.next_benefit;
  const pointsLabel = isEs ? "puntos" : "points";
  const savedReferralSlug = summary.referral_slug || "";
  const hasSlugDraft = newSlug !== savedReferralSlug;
  const slugChangeBlockedByCooldown = hasSlugDraft && slugCooldownDays > 0 && summary.referral_slug_can_change === false;

  return (
    <div className="px-4 pt-14 pb-8">
      <PortalBrandLogo />
      <h1 className="text-2xl mb-6" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
        {isEs ? "Mis beneficios" : "My benefits"}
      </h1>

      {/* HERO: balance + progress to next benefit */}
      <div className="rounded-2xl p-5 mb-4 card-portal-hero">
        <div className="flex items-end justify-between mb-1">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Tu saldo" : "Your balance"}
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-4xl font-black tabular-nums" style={{ color: "var(--text-primary)", letterSpacing: "-1.5px" }}>
                {balance.toLocaleString(localeTag)}
              </span>
              <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>{pointsLabel}</span>
            </div>
          </div>
          <Trophy size={28} className="icon-bold" style={{ color: "var(--accent-color)" }} />
        </div>

        {next ? (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Próximo beneficio:" : "Next benefit:"} {isEs ? next.title_es : next.title_en}
              </span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                {balance.toLocaleString(localeTag)}/{next.required_points.toLocaleString(localeTag)}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${next.progress_pct}%`, background: "var(--accent-color)", minWidth: balance > 0 ? 4 : 0 }} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              {isEs
                ? `Te faltan ${Math.max(0, next.points_remaining ?? next.remaining ?? next.required_points - balance).toLocaleString(localeTag)} pts`
                : `${Math.max(0, next.points_remaining ?? next.remaining ?? next.required_points - balance).toLocaleString(localeTag)} pts to go`}
            </p>
          </div>
        ) : (
          <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
            {isEs ? "Has desbloqueado todos los beneficios disponibles." : "You've unlocked every available benefit."}
          </p>
        )}

        {/* Breakdown chips */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
            {isEs ? "Gasto" : "Spending"}: {summary.breakdown.spending}
          </span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
            {isEs ? "Referidos" : "Referrals"}: {summary.breakdown.matching_bonus}
          </span>
          {summary.breakdown.adjustments !== 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
              {isEs ? "Ajustes" : "Adjustments"}: {summary.breakdown.adjustments}
            </span>
          )}
        </div>
      </div>

      {/* Birthday gift now flows through the unified active-voucher card above (kind='birthday'). */}


      {/* Active benefit voucher card */}
      {summary.active_voucher && (() => {
        const v = summary.active_voucher;
        const title = isEs ? v.title_es : v.title_en;
        const expires = new Date(v.expires_at);
        const daysLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
        const VIcon = resolveBenefitIcon(v.icon);
        return (
          <div className="rounded-2xl p-5 mb-4 card-elevated" style={{ border: "1px solid var(--accent-color)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Gift size={18} className="icon-bold" style={{ color: "var(--accent-color)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-color)" }}>
                {isEs ? "Beneficio activo" : "Active benefit"}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
                <VIcon size={18} className="icon-bold" style={{ color: "var(--accent-color)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {isEs ? `Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}` : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(v.code).catch(() => {});
                setVoucherCopied(true);
                toast.success(isEs ? "Código copiado" : "Code copied");
                setTimeout(() => setVoucherCopied(false), 1500);
              }}
              className="w-full rounded-xl py-4 px-4 flex items-center justify-between transition-all active:scale-[0.98]"
              style={{ background: "var(--accent-dim)", border: "1px dashed var(--accent-color)" }}
            >
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent-color)" }}>
                  {isEs ? "Tu código" : "Your code"}
                </p>
                <p className="text-2xl font-black tabular-nums tracking-[0.2em]" style={{ color: "var(--text-primary)" }}>
                  {v.code}
                </p>
              </div>
              {voucherCopied ? <Check size={20} style={{ color: "var(--accent-color)" }} /> : <Copy size={18} style={{ color: "var(--accent-color)" }} />}
            </button>
            <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
              {isEs
                ? "Aplícalo al reservar tu próxima cita o muéstralo al barbero al pagar."
                : "Apply it when booking your next appointment or show it to your barber at checkout."}
            </p>
          </div>
        );
      })()}

      {/* Benefits catalog */}
      <div className="rounded-2xl p-5 mb-4 card-elevated">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "Catálogo de beneficios" : "Benefits catalog"}
          </span>
        </div>
        <div className="space-y-2.5">
          {summary.benefits.map((b) => {
            const Icon = resolveBenefitIcon(b.icon);
            const title = isEs ? b.title_es : b.title_en;
            const desc = isEs ? b.description_es : b.description_en;
            // Hide benefit that already has an active voucher (shown above)
            if (b.has_active_voucher) return null;
            // If client has any active voucher, claim is disabled for others
            const hasOtherActive = !!summary.active_voucher;
            const claimable = b.unlocked && !hasOtherActive;

            const row = (
              <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--bg-surface-2)", opacity: b.unlocked ? 1 : 0.85 }}>
                <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: b.unlocked ? "var(--accent-dim)" : "var(--bg-elevated)" }}>
                  {b.unlocked ? <Icon size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} /> : <Lock size={14} style={{ color: "var(--text-tertiary)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
                    <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: b.unlocked ? "var(--accent-color)" : "var(--text-tertiary)" }}>
                      {b.required_points} pts
                    </span>
                  </div>
                  {desc && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{desc}</p>}
                  {!b.unlocked && (
                    <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: "var(--bg-elevated)" }}>
                      <div className="h-full rounded-full" style={{ width: `${b.progress_pct}%`, background: "var(--accent-color)" }} />
                    </div>
                  )}
                </div>
              </div>
            );

            if (claimable) {
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPendingClaim(b)}
                  className="w-full text-left transition-transform active:scale-[0.99]"
                  aria-label={isEs ? `Reclamar ${title}` : `Claim ${title}`}
                >
                  {row}
                  <p className="text-[10px] font-bold uppercase tracking-wider mt-1.5 text-center" style={{ color: "var(--accent-color)" }}>
                    {isEs ? "Toca para reclamar" : "Tap to claim"}
                  </p>
                </button>
              );
            }
            return <div key={b.id}>{row}</div>;
          })}
        </div>
        {summary.active_voucher && summary.benefits.some(b => b.unlocked && !b.has_active_voucher) && (
          <p className="text-[11px] mt-3 text-center" style={{ color: "var(--text-tertiary)" }}>
            {isEs
              ? "Redime tu beneficio activo antes de reclamar otro."
              : "Redeem your active benefit before claiming another one."}
          </p>
        )}
      </div>

      {/* Redeemed history — keeps a record of past redemptions instead of resetting */}
      {redeemedHistory.length > 0 && (
        <div className="rounded-2xl p-5 mb-4 card-elevated">
          <div className="flex items-center gap-2 mb-3">
            <Check size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Beneficios redimidos" : "Redeemed benefits"}
            </span>
          </div>
          <div className="space-y-2">
            {redeemedHistory.map((r) => {
              const RIcon = resolveBenefitIcon(r.icon);
              const title = isEs ? r.title_es : r.title_en;
              const when = new Date(r.redeemed_at).toLocaleDateString(localeTag, { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}>
                  <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
                    <RIcon size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {isEs ? `Redimido el ${when}` : `Redeemed on ${when}`} · <span className="tabular-nums tracking-widest">{r.code}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    {r.points_cost} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* Claim confirmation sheet */}
      {pendingClaim && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !claiming && setPendingClaim(null)}
        >
          <div
            className="w-full max-w-[430px] rounded-t-3xl p-6"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-elevated)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--bg-elevated)" }} />
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
                <Gift size={20} className="icon-bold" style={{ color: "var(--accent-color)" }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent-color)" }}>
                  {isEs ? "Confirmar canje" : "Confirm claim"}
                </p>
                <p className="text-base font-black" style={{ color: "var(--text-primary)" }}>
                  {isEs ? pendingClaim.title_es : pendingClaim.title_en}
                </p>
              </div>
            </div>
            <div className="rounded-xl p-3 mb-4" style={{ background: "var(--bg-surface-2)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {isEs
                  ? `Vas a usar ${pendingClaim.required_points} pts. Tu saldo bajará de ${summary.balance} a ${summary.balance - pendingClaim.required_points} pts.`
                  : `You'll spend ${pendingClaim.required_points} pts. Your balance will drop from ${summary.balance} to ${summary.balance - pendingClaim.required_points} pts.`}
              </p>
              <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                {isEs
                  ? "Recibirás un código de 6 dígitos válido por 30 días. Si no lo usas, expira y los puntos no se devuelven."
                  : "You'll get a 6-character code valid for 30 days. If unused, it expires and points are not refunded."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingClaim(null)}
                disabled={claiming}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
              >
                {isEs ? "Cancelar" : "Cancel"}
              </button>
              <button
                onClick={() => handleClaim(pendingClaim)}
                disabled={claiming}
                className="flex-1 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}
              >
                {claiming && <Loader2 size={14} className="animate-spin" />}
                {isEs ? "Reclamar" : "Claim"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Referral link */}
      <div className="rounded-2xl p-5 mb-4 card-elevated">
        <div className="flex items-center gap-2 mb-3">
          <Gift size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "Mi enlace de referidos" : "My referral link"}
          </span>
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
          {isEs
            ? "Comparte tu enlace. Cuando un amigo reserve y pague su primera cita, ambos reciben puntos iguales al subtotal."
            : "Share your link. When a friend books and pays their first appointment, you both earn points equal to the subtotal."}
        </p>

        {/* Inline editable slug */}
        <div
          className="flex items-center gap-1.5 rounded-lg pl-2.5 mb-2 overflow-hidden transition-all duration-300"
          style={{
            background: slugSaveBlocked ? "var(--red-dim, rgba(239, 68, 68, 0.12))" : "var(--bg-surface-2)",
            boxShadow: slugSaveBlocked ? "inset 0 0 0 1px var(--red)" : "none",
          }}
        >
          <Link2 size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
          <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>{REFERRAL_PREFIX}</span>
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            maxLength={30}
            placeholder={isEs ? "tu-nombre" : "your-name"}
            aria-label={isEs ? "Personalizar enlace" : "Customize link"}
            className="flex-1 min-w-0 bg-transparent py-2.5 px-1 text-xs font-mono font-bold outline-none cursor-text"
            style={{ color: "var(--text-primary)" }}
          />

          <div className="shrink-0 pr-2.5">
            {checkingSlug ? <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-tertiary)" }} /> :
              slugAvailable === true ? <Check size={12} style={{ color: "var(--green)" }} /> :
              slugAvailable === false ? <span className="text-[10px] font-bold" style={{ color: "var(--red)" }}>×</span> : null}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold active:scale-[0.98] transition-transform"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? (isEs ? "Copiado" : "Copied") : (isEs ? "Copiar" : "Copy")}
          </button>
          {slugAvailable === true && hasSlugDraft ? (
            <button
              type="button"
              onClick={handleSaveSlug}
              disabled={savingSlug}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {savingSlug ? <Loader2 size={14} className="animate-spin" /> : (isEs ? "Guardar enlace" : "Save link")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold active:scale-[0.98] transition-transform"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              <Share2 size={14} /> {isEs ? "Compartir" : "Share"}
            </button>
          )}
        </div>

        {slugChangeBlockedByCooldown && (
          <div className="mt-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold" style={{ background: "var(--red-dim, rgba(239, 68, 68, 0.12))", color: "var(--red)" }}>
            {isEs
              ? `Ese cambio todavía no se puede guardar. Tu enlace actual sigue siendo /r/${savedReferralSlug}.`
              : `That change cannot be saved yet. Your current link is still /r/${savedReferralSlug}.`}
          </div>
        )}

        {/* Microcopy */}
        <p className="text-[10px] mt-2 transition-colors duration-300" style={{ color: slugSaveBlocked ? "var(--red)" : "var(--text-tertiary)" }}>
          {slugSaveBlocked
            ? (isEs ? "No se guardó. El enlace volvió a la versión actual." : "Not saved. The link was restored to the current version.")
            : (isEs ? "Toca el enlace para personalizarlo. Se confirma al tocar Guardar." : "Tap the link to customize it. Tap Save to confirm.")}
          {slugCooldownDays > 0 && (
            <> {isEs ? `Próximo cambio disponible en ${slugCooldownDays} días.` : `Next change available in ${slugCooldownDays} days.`}</>
          )}
        </p>


        {/* Legal consent — placed below microcopy per design */}
        <p className="text-[10px] mt-2 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {isEs ? (
            <>
              Al compartir y usar tu enlace aceptas los{" "}
              <a href="/terminos-referidos" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>
                Términos del Programa de Referidos
              </a>
              {" "}y los{" "}
              <a href="/terminos-recompensas" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>
                Términos del Programa de Recompensas
              </a>
              . Los puntos no son dinero y no son canjeables por efectivo.
            </>
          ) : (
            <>
              By sharing and using your link you accept the{" "}
              <a href="/terminos-referidos" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>
                Referral Program Terms
              </a>
              {" "}and the{" "}
              <a href="/terminos-recompensas" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>
                Rewards Program Terms
              </a>
              . Points are not money and are not redeemable for cash.
            </>
          )}
        </p>

        {summary.referrals_count > 0 && (
          <p className="text-[11px] mt-3 font-semibold" style={{ color: "var(--accent-color)" }}>
            {isEs ? `Has referido a ${summary.referrals_count} ${summary.referrals_count === 1 ? "cliente" : "clientes"}.` : `You've referred ${summary.referrals_count} ${summary.referrals_count === 1 ? "client" : "clients"}.`}
          </p>
        )}

        {summary.referees && summary.referees.length > 0 && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--divider-color)" }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Tus referidos" : "Your referrals"}
            </div>
            <div className="space-y-1.5">
              {summary.referees.map((r) => {
                const name = `${r.first_name ?? ""}${r.last_initial ? " " + r.last_initial + "." : ""}`.trim() || (isEs ? "Cliente" : "Client");
                return (
                  <div key={r.client_id} className="flex items-center justify-between text-[13px]">
                    <span style={{ color: "var(--text-secondary)" }}>{name}</span>
                    <span className="font-semibold tabular-nums" style={{ color: r.matching_points > 0 ? "var(--accent-color)" : "var(--text-tertiary)" }}>
                      {r.matching_points > 0 ? `+${r.matching_points}` : "0"} {isEs ? "pts" : "pts"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>


      {/* History */}
      {summary.history.length > 0 && (
        <div className="rounded-2xl p-5 mb-4 card-elevated">
          <div className="flex items-center gap-2 mb-3">
            <Star size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "Historial reciente" : "Recent activity"}
            </span>
          </div>
          <div className="space-y-2">
            {summary.history.map((h) => {
              const desc = (isEs ? h.description_es : h.description_en) || sourceLabel(h.source_type);
              return (
                <div key={h.id} className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{desc}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(h.created_at).toLocaleDateString(localeTag, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="text-xs font-black tabular-nums" style={{ color: h.points > 0 ? "var(--green)" : "var(--red)" }}>
                    {h.points > 0 ? "+" : ""}{h.points}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* How to earn */}
      <div className="rounded-2xl p-5 card-elevated">
        <div className="flex items-center gap-2 mb-3">
          <Gift size={16} className="icon-bold" style={{ color: "var(--accent-color)" }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "Cómo ganar más" : "How to earn more"}
          </span>
        </div>
        <ul className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <li className="flex gap-2"><span style={{ color: "var(--accent-color)" }}>•</span><span>{isEs ? "1 punto por cada $1 que gastes en servicios y productos." : "1 point per $1 spent on services and products."}</span></li>
          <li className="flex gap-2"><span style={{ color: "var(--accent-color)" }}>•</span><span><strong style={{ color: "var(--text-primary)", fontWeight: 800 }}>{isEs ? "Bono por Referir:" : "Matching Bonus:"}</strong> {isEs ? "cuando tu referido reserve y pague su primera cita, ambos ganan puntos iguales al subtotal." : "when your referral books and pays their first appointment, you both earn points equal to the subtotal."}</span></li>
          <li className="flex gap-2"><span style={{ color: "var(--accent-color)" }}>•</span><span>{isEs ? "Las propinas y reembolsos no cuentan." : "Tips and refunds don't count."}</span></li>

        </ul>
      </div>
    </div>
  );
}
