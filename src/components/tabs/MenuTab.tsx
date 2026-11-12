import { useState, useCallback, useEffect } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useClientDuplicateBadges } from "@/contexts/ClientDuplicateBadgesContext";
import { PendingCountBadge } from "@/components/ui/PendingCountBadge";
import {
  Users, Package, BarChart3, Settings, Globe,
  Moon, Sun, Monitor, LogOut, ChevronRight, ChevronDown,
  ListChecks, Clock, Bell, Mail, Upload, Share2, Copy,
  Check, ExternalLink, ShoppingBag, Hourglass, Store, CalendarClock, SlidersHorizontal, FileText,
  TrendingUp, MessageCircle, Megaphone, Newspaper, Inbox, Rocket, Trophy, GitMerge, ShieldCheck, Images, Gift,
} from "lucide-react";


const ACUITY_BOOKING_BASE = "https://app.acuityscheduling.com/schedule.php?owner=33547498";

interface Barber {
  id: string; name: string; is_active: boolean;
}

const publicBarberSlug = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("charlie")) return "charlie";
  if (n.includes("hector") || n.includes("pito")) return "pito";
  if (n.includes("joseph")) return "joseph";
  return n.split(" ")[0] || "";
};

export function MenuTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme, language, setLanguage } = usePreferences();
  const { signOut, user, isOwner } = useAuth();
  const { count: clientDuplicateCount } = useClientDuplicateBadges();
  const duplicateTrailing = clientDuplicateCount != null && clientDuplicateCount > 0 ? (
    <div className="flex items-center gap-2">
      <PendingCountBadge count={clientDuplicateCount} label={language === "es" ? "Posibles duplicados" : "Possible duplicates"} />
      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
    </div>
  ) : undefined;

  const [shareOpen, setShareOpen] = useState(false);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userBarberId, setUserBarberId] = useState<string | null>(null);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [recruitCount, setRecruitCount] = useState(0);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  // Fetch pending_review tx count + unread inbox + unread recruitment + duplicates (realtime)
  useEffect(() => {
    const fetchCounts = async () => {
      const [tx, inbox, recruit, dupTxs] = await Promise.all([
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("recruitment_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("transactions").select("appointment_id").eq("status", "completed").eq("type", "service").not("appointment_id", "is", null).limit(2000),
      ]);
      setPendingCount(tx.count || 0);
      setInboxCount(inbox.count || 0);
      setRecruitCount(recruit.count || 0);

      const counts = new Map<string, number>();
      (dupTxs.data || []).forEach((t: any) => {
        if (!t.appointment_id) return;
        counts.set(t.appointment_id, (counts.get(t.appointment_id) || 0) + 1);
      });
      const candidateIds = Array.from(counts.keys()).filter((id) => (counts.get(id) || 0) >= 2);
      let dupAppts = 0;
      if (candidateIds.length) {
        const { data: dismissedRows } = await supabase
          .from("appointments").select("id").in("id", candidateIds).not("duplicate_dismissed_at", "is", null);
        const dismissed = new Set((dismissedRows || []).map((r: any) => r.id));
        dupAppts = candidateIds.filter((id) => !dismissed.has(id)).length;
      }
      setDuplicatesCount(dupAppts);
    };
    fetchCounts();
    const ch = supabase.channel("menutab-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_submissions" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "recruitment_submissions" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchCounts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const requestNotifPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    haptic();
    if (Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    }
  }, []);

  const toggleShareLinks = useCallback(async () => {
    if (!linksLoaded) {
      const { data: bData } = await supabase
        .from("barbers_public").select("id, name, is_active")
        .eq("is_active", true).order("name");
      setBarbers(bData || []);
      if (!isOwner && user) {
        const { data: profile } = await supabase
          .from("profiles").select("barber_id").eq("id", user.id).maybeSingle();
        setUserBarberId(profile?.barber_id || null);
      }
      setLinksLoaded(true);
    }
    setShareOpen((prev) => !prev);
  }, [isOwner, user, linksLoaded]);

  const copyLink = useCallback((link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(40); };

  const SITE_BASE = "https://charliesbarbershop.co";

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Map public slug → referral code registered in `referral_codes`.
  // Using the /r/<code> URL ensures every booking made via the link is
  // attributed in `referral_attributions` (see RefRedirect + RefCapture).
  const slugToRefCode: Record<string, string> = {
    charlie: "charlie",
    pito: "hector", // Hector's slug is "pito" but ref code is "hector"
    joseph: "joseph",
  };

  const bookingLinks = (() => {
    const links: { id: string; label: string; url: string }[] = [
      ...(isOwner ? [{ id: "shop", label: "Barbershop", url: `${SITE_BASE}/` }] : []),
    ];
    const visibleBarbers = isOwner
      ? barbers
      : barbers.filter((b) => b.id === userBarberId);
    visibleBarbers.forEach((b) => {
      const slug = publicBarberSlug(b.name);
      const refCode = slugToRefCode[slug] || slug;
      links.push({ id: b.id, label: b.name, url: `${SITE_BASE}/r/${refCode}` });
    });
    return links;
  })();

  const SectionHeader = ({ label }: { label: string }) => (
    <p className="text-[11px] font-semibold uppercase tracking-wider px-4 mb-1.5"
      style={{ color: "var(--text-tertiary)" }}>{label}</p>
  );

  const Row = ({ icon: Icon, label, onClick, trailing }: {
    icon: React.ElementType; label: string; onClick?: () => void; trailing?: React.ReactNode;
  }) => (
    <button onClick={onClick} className="flex items-center w-full px-4 py-3.5 gap-3 transition-colors"
      style={{ borderBottom: "1px solid var(--divider)" }}>
      <Icon size={20} style={{ color: "var(--accent-color)" }} />
      <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
      {trailing || <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />}
    </button>
  );

  const lastRowStyle = { borderBottom: "none" };

  const themeOptions: { value: "dark" | "light" | "system"; icon: React.ElementType; label: string }[] = [
    { value: "dark", icon: Moon, label: t("menu.darkMode") },
    { value: "light", icon: Sun, label: t("menu.lightMode") },
    { value: "system", icon: Monitor, label: t("menu.systemMode") || "System" },
  ];

  return (
    <div className="pb-4">
      <AdminHeader title={t("menu.title")} />
      <div className="px-4">

      {/* BOOKING LINKS */}
      <SectionHeader label={t("menu.schedulingPage")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <button onClick={toggleShareLinks}
          className="flex items-center w-full px-4 py-3.5 gap-3 transition-colors"
          style={{ borderBottom: shareOpen ? "1px solid var(--divider)" : "none" }}>
          <Share2 size={20} style={{ color: "var(--accent-color)" }} />
          <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("menu.shareLinks")}
          </span>
          <ChevronDown size={16} className="transition-transform duration-300"
            style={{ color: "var(--text-tertiary)", transform: shareOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>
        <div className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: shareOpen ? `${bookingLinks.length * 72 + 16}px` : "0px", opacity: shareOpen ? 1 : 0 }}>
          <div className="p-3 space-y-2">
            {bookingLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: "var(--bg-surface-2)" }}>
                <ExternalLink size={16} style={{ color: "var(--accent-color)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{link.label}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{link.url}</p>
                </div>
                <button onClick={() => copyLink(link.url, link.id)} className="p-2 rounded-lg"
                  style={{ background: "var(--bg-base)" }}>
                  {copiedId === link.id
                    ? <Check size={16} style={{ color: "var(--green)" }} />
                    : <Copy size={16} style={{ color: "var(--accent-color)" }} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MANAGE */}
      <SectionHeader label={t("menu.manage")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <Row icon={ShoppingBag} label="Ventas" onClick={() => navigate("/admin/sales")}
          trailing={(pendingCount + duplicatesCount) > 0 ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold"
                style={{ background: "#ef4444", color: "#fff" }}>
                {pendingCount + duplicatesCount}
              </span>
              <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : undefined}
        />
        <Row icon={ListChecks} label={t("menu.services")} onClick={() => navigate("/admin/services")} />
        <Row icon={Images} label="Media" onClick={() => navigate("/admin/media")} />
        {!isOwner && <Row icon={Users} label={language === "es" ? "Retención · Reactivación" : "Retention · Reactivation"} onClick={() => navigate("/admin/retencion/outreach")} />}
        {isOwner && <Row icon={Globe} label={language === "es" ? "Página Web" : "Website"} onClick={() => navigate("/admin/website")} />}
        {isOwner && <Row icon={CalendarClock} label={t("menu.availability")} onClick={() => navigate("/admin/availability")} />}
        <Row icon={Store} label={language === "es" ? "Lista de Espera (En Tienda)" : "In-Shop Waitlist"} onClick={() => navigate("/admin/waitlist")} />
        {isOwner && (
          <div style={lastRowStyle}>
            <Row icon={SlidersHorizontal} label={language === "es" ? "Reglas de Reserva" : "Booking Rules"} onClick={() => navigate("/admin/booking-rules")} />
          </div>
        )}
      </div>

      {/* PRODUCTS (owner only) */}
      {isOwner && (
        <>
          <SectionHeader label={language === "es" ? "Productos" : "Products"} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <Row icon={Package} label={t("inventory.title")} onClick={() => navigate("/admin/inventory")} />
            <div style={lastRowStyle}>
              <Row icon={TrendingUp} label={language === "es" ? "Ganancia" : "Profit"} onClick={() => navigate("/admin/profit")} />
            </div>
          </div>
        </>
      )}

      {/* REPORTS (owner only) */}
      {isOwner && (
        <>
          <SectionHeader label={t("menu.reports")} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <Row icon={BarChart3} label={t("menu.reports")} onClick={() => navigate("/admin/reports")} />
            <Row icon={Trophy} label={language === "es" ? "Sistemas de Referidos" : "Referral Systems"} onClick={() => navigate("/admin/referidos")} />
            <Row icon={Mail} label={t("menu.contable")} onClick={() => navigate("/admin/contable")} />
            <div style={lastRowStyle}>
              <Row icon={Upload} label={t("reports.importCSV")} onClick={() => navigate("/admin/import")} />
            </div>
          </div>
        </>
      )}

      {/* PAYSTUBS (barbers only) */}
      {!isOwner && (
        <>
          <SectionHeader label={language === "es" ? "Pago" : "Pay"} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <div style={lastRowStyle}>
              <Row
                icon={FileText}
                label={language === "es" ? "Talonarios" : "Paystubs"}
                onClick={() => navigate("/admin/talonarios")}
              />
            </div>
          </div>
        </>
      )}

      {/* CLIENTS (owner only) */}
      {isOwner && (
        <>
          <SectionHeader label={t("menu.clients")} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <Row icon={Users} label={t("menu.clients")} onClick={() => navigate("/admin/clients")} trailing={duplicateTrailing} />
            <Row icon={GitMerge} label={language === "es" ? "Duplicados" : "Duplicates"} onClick={() => navigate("/admin/clients/duplicates")} trailing={duplicateTrailing} />
            <div style={lastRowStyle}>
              <Row icon={Gift} label={language === "es" ? "Regalos y Beneficios" : "Gifts & Benefits"} onClick={() => navigate("/admin/gifts")} />
            </div>
          </div>

        </>
      )}

      {/* COMUNICACIÓN (owner only) — Notification templates, broadcasts, and
          browser permission for pending-payment alerts. Lives as its own
          section so it isn't buried inside Settings. */}
      {isOwner && (
        <>
          <SectionHeader label={language === "es" ? "Comunicación" : "Communication"} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <Row
              icon={Megaphone}
              label={language === "es" ? "Broadcast" : "Broadcast"}
              onClick={() => navigate("/admin/broadcasts")}
            />
            <Row
              icon={Mail}
              label={language === "es" ? "Outreach" : "Outreach"}
              onClick={() => navigate("/admin/outreach")}
            />
            <Row
              icon={MessageCircle}
              label={language === "es" ? "Plantillas (legacy)" : "Templates (legacy)"}
              onClick={() => navigate("/admin/notifications")}
            />
            {/* Browser permission for pending-payment alerts (separate from
                push notifications sent to clients). */}
            <button
              onClick={requestNotifPermission}
              disabled={notifPermission === "granted" || notifPermission === "denied" || notifPermission === "unsupported"}
              className="flex items-center w-full px-4 py-3.5 gap-3"
              style={lastRowStyle}
            >
              <Bell size={20} style={{ color: "var(--accent-color)" }} />
              <div className="flex-1 text-left">
                <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? "Alertas del navegador" : "Browser alerts"}
                </span>
                <span className="block text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Pagos pendientes en este dispositivo" : "Pending payments on this device"}
                </span>
              </div>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background:
                    notifPermission === "granted"
                      ? "rgba(34,197,94,0.15)"
                      : notifPermission === "denied"
                      ? "rgba(239,68,68,0.15)"
                      : "var(--bg-surface-2)",
                  color:
                    notifPermission === "granted"
                      ? "#22c55e"
                      : notifPermission === "denied"
                      ? "#ef4444"
                      : "var(--text-secondary)",
                }}
              >
                {notifPermission === "granted"
                  ? language === "es" ? "Activadas" : "On"
                  : notifPermission === "denied"
                  ? language === "es" ? "Bloqueadas" : "Blocked"
                  : notifPermission === "unsupported"
                  ? "N/A"
                  : language === "es" ? "Activar" : "Enable"}
              </span>
            </button>
          </div>
        </>
      )}

      {/* BOLETÍN / NEWSLETTER (owner only) */}
      {isOwner && (
        <>
          <SectionHeader label={language === "es" ? "Boletín" : "Newsletter"} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <div style={lastRowStyle}>
              <Row
                icon={Newspaper}
                label={language === "es" ? "Titulares" : "Headlines"}
                onClick={() => navigate("/admin/titulares")}
              />
            </div>
          </div>

          <SectionHeader label={language === "es" ? "Pre-launch" : "Pre-launch"} />
          <div className="rounded-xl overflow-hidden mb-4 card-elevated">
            <Row
              icon={Inbox}
              label={language === "es" ? "Bandeja" : "Inbox"}
              onClick={() => navigate("/admin/bandeja")}
              trailing={(inboxCount + recruitCount) > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    {inboxCount + recruitCount}
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                </div>
              ) : undefined}
            />
            <div style={lastRowStyle}>
              <Row
                icon={Rocket}
                label={language === "es" ? "Launch Control" : "Launch Control"}
                onClick={() => navigate("/admin/launch")}
              />
            </div>
          </div>
        </>
      )}

      {/* ACCOUNT */}
      <SectionHeader label={t("menu.account")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        {isOwner && <Row icon={ShieldCheck} label={language === "es" ? "Roles y Acceso" : "Roles & Access"} onClick={() => navigate("/admin/roles")} />}
        {isOwner && <Row icon={Settings} label={t("menu.settings")} onClick={() => navigate("/admin/settings")} />}

        {/* Theme — 3-state pill */}
        <div className="flex items-center w-full px-4 py-3.5 gap-3"
          style={{ borderBottom: "1px solid var(--divider)" }}>
          {theme === "dark" ? <Moon size={20} style={{ color: "var(--accent-color)" }} />
            : theme === "light" ? <Sun size={20} style={{ color: "var(--accent-color)" }} />
            : <Monitor size={20} style={{ color: "var(--accent-color)" }} />}
          <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("menu.theme")}
          </span>
          <div className="flex rounded-full overflow-hidden" style={{ border: "1px solid var(--divider)" }}>
            {themeOptions.map((opt) => {
              const active = theme === opt.value;
              return (
                <button key={opt.value}
                  onClick={() => { haptic(); setTheme(opt.value); }}
                  className="px-3 py-1.5 flex items-center gap-1 transition-colors duration-[250ms]"
                  style={{
                    background: active ? "var(--accent-color)" : "transparent",
                    color: active ? "var(--cta-fg)" : "var(--text-tertiary)",
                  }}>
                  <opt.icon size={12} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Language pill */}
        <button onClick={() => { haptic(); setLanguage(language === "es" ? "en" : "es"); }}
          className="flex items-center w-full px-4 py-3.5 gap-3"
          style={{ borderBottom: "1px solid var(--divider)" }}>
          <Globe size={20} style={{ color: "var(--accent-color)" }} />
          <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("menu.language")}
          </span>
          <div className="flex rounded-full overflow-hidden" style={{ border: "1px solid var(--divider)" }}>
            {(["es", "en"] as const).map((l) => (
              <span key={l} className="px-3 py-1 text-xs font-semibold transition-colors duration-[250ms]"
                style={{
                  background: language === l ? "var(--accent-color)" : "transparent",
                  color: language === l ? "var(--cta-fg)" : "var(--text-tertiary)",
                }}>{l.toUpperCase()}</span>
            ))}
          </div>
        </button>

        {/* Account email */}
        {user && (
          <div className="flex items-center w-full px-4 py-3.5 gap-3" style={lastRowStyle}>
            <Mail size={20} style={{ color: "var(--accent-color)" }} />
            <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t("menu.account")}
            </span>
            <span className="text-xs font-medium truncate max-w-[180px]" style={{ color: "var(--text-secondary)" }}>
              {user.email}
            </span>
          </div>
        )}
      </div>

      {/* Sign Out */}
      {user && (
        <div className="rounded-xl overflow-hidden card-elevated">
          <button onClick={signOut} className="flex items-center w-full px-4 py-3.5 gap-3">
            <LogOut size={20} style={{ color: "var(--red)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--red)" }}>{t("menu.signOut")}</span>
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
