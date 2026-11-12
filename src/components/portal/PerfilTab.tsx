import { useState, useEffect, useRef } from "react";
import {
  LogOut, CreditCard, ChevronRight, Bell, Globe,
  Lock, Mail, MessageSquare, Phone, User, Calendar,
  Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Gift,
  Smartphone, HelpCircle, Presentation,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
// Stripe SDK removed — cards auto-save via Stripe Link during hosted Checkout.
import { resolveClientAvatarUrl } from "@/lib/clientAvatar";
import {
  enablePush,
  disablePush,
  hasActivePushSubscription,
  getPushSupport,
} from "@/lib/push";
import { CardBrandIcon } from "@/components/icons/CardBrandIcon";
import { AthMovilIcon } from "@/components/icons/AthMovilIcon";
import { PortalBrandLogo } from "@/components/PortalBrandLogo";

interface ClientRecord {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  preferred_barber_id: string | null;
  account_verified: boolean;
  stripe_customer_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  preferred_payment_method: string | null;
  ath_phone: string | null;
  ath_phone_last4: string | null;
  date_of_birth: string | null;
  gender: string | null;
  avatar_url: string | null;
  notify_sms_appointments: boolean;
  notify_whatsapp_appointments: boolean;
  notify_email_appointments: boolean;
  notify_sms_marketing: boolean;
  notify_whatsapp_marketing: boolean;
  notify_email_marketing: boolean;
  notify_push_appointments?: boolean;
}

interface Barber {
  id: string;
  name: string;
  color: string | null;
}

interface PerfilTabProps {
  client: ClientRecord;
  barbers: Barber[];
  onUpdate: () => void;
}

type SubView = "main" | "edit" | "wallet" | "password";

export default function PerfilTab({ client, barbers, onUpdate }: PerfilTabProps) {
  const [view, setView] = useState<SubView>("main");

  return (
    <div className="px-4 pt-14 pb-4">
      <PortalBrandLogo />
      {view === "main" && <MainView client={client} barbers={barbers} onUpdate={onUpdate} setView={setView} />}
      {view === "edit" && <EditView client={client} onUpdate={onUpdate} onBack={() => setView("main")} />}
      {view === "wallet" && <WalletView client={client} onBack={() => setView("main")} onUpdate={onUpdate} />}
      {view === "password" && <PasswordView onBack={() => setView("main")} />}
    </div>
  );
}

function Row({ icon: Icon, label, onClick, trailing, danger }: {
  icon: React.ElementType; label: string; onClick?: () => void; trailing?: React.ReactNode; danger?: boolean;
}) {
  return (
    <button onClick={onClick} className="divider-hairline-b flex items-center w-full px-4 py-3.5 gap-3 transition-colors">
      <Icon size={20} style={{ color: danger ? "var(--red)" : "var(--accent-color)" }} />
      <span className="flex-1 text-left text-sm font-medium" style={{ color: danger ? "var(--red)" : "var(--text-primary)" }}>{label}</span>
      {trailing || <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />}
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider px-4 mb-1.5"
      style={{ color: "var(--text-tertiary)" }}>{label}</p>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className="text-sm font-medium mb-4" style={{ color: "var(--nav-accent)" }}>
      ← {label ?? t("portal.perfil.back")}
    </button>
  );
}

// Shared push-toggle hook — used both inline on the main Perfil menu
// and on the dedicated Settings page so the master switch is one tap.
function usePushToggle(client: ClientRecord, onUpdate: () => void) {
  const { t, language } = useTranslation();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupport, setPushSupport] = useState<ReturnType<typeof getPushSupport>>("supported");

  useEffect(() => {
    setPushSupport(getPushSupport());
    hasActivePushSubscription().then((active) => {
      setPushOn(active && (client.notify_push_appointments ?? true));
    });
  }, [client.notify_push_appointments]);

  const handlePushToggle = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        await supabase
          .from("clients")
          .update({ notifications_enabled: false, notify_push_appointments: false } as any)
          .eq("id", client.id);
        setPushOn(false);
        toast.success(t("push.disabledToast"));
      } else {
        const result = await enablePush(language === "en" ? "en" : "es");
        if (result.ok) {
          await supabase
            .from("clients")
            .update({
              notifications_enabled: true,
              notifications_permission_asked: true,
              notify_push_appointments: true,
            } as any)
            .eq("id", client.id);
          setPushOn(true);
          toast.success(t("push.enabledToast"));
        } else {
          const reason = (result as { ok: false; reason: string }).reason;
          if (reason === "denied") toast.error(t("push.deniedToast"));
          else if (reason === "ios-needs-pwa") toast(t("push.iosPwaToast"));
          else if (reason === "unsupported") toast(t("push.unsupportedToast"));
          else toast.error(t("push.errorToast"));
        }
      }
      onUpdate();
    } finally {
      setPushBusy(false);
    }
  };

  return { pushOn, pushBusy, pushSupport, handlePushToggle };
}

function PushSwitch({ pushOn, pushBusy, disabled, onToggle, ariaLabel }: {
  pushOn: boolean; pushBusy: boolean; disabled: boolean; onToggle: () => void; ariaLabel: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      disabled={disabled}
      className="w-11 h-6 rounded-full relative transition-colors duration-200 disabled:opacity-40 shrink-0"
      style={{ background: pushOn ? "var(--accent-color)" : "var(--switch-off)" }}
      aria-pressed={pushOn}
      aria-label={ariaLabel}
    >
      {pushBusy ? (
        <Loader2 size={12} className="animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: "#fff" }} />
      ) : (
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-transform duration-200"
          style={{ background: "#fff", transform: pushOn ? "translateX(22px)" : "translateX(2px)" }}
        />
      )}
    </button>
  );
}

function MainView({ client, barbers, onUpdate, setView }: PerfilTabProps & { setView: (v: SubView) => void }) {
  const { signOut, user } = useAuth();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const localeTag = language === "en" ? "en-US" : "es-PR";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedAvatarUrl, setSignedAvatarUrl] = useState<string | null>(null);
  const verified = client.account_verified || !!user?.email_confirmed_at;
  const { pushOn, pushBusy, pushSupport, handlePushToggle } = usePushToggle(client, onUpdate);
  const pushDisabled = pushBusy || pushSupport === "unsupported" || pushSupport === "ios-needs-pwa";

  // 'client-avatars' bucket is private — resolve avatar_url (path or legacy
  // public URL) to a short-lived signed URL whenever it changes.
  useEffect(() => {
    let cancelled = false;
    setSignedAvatarUrl(null);
    if (!client.avatar_url) return;
    resolveClientAvatarUrl(client.avatar_url).then((url) => {
      if (!cancelled) setSignedAvatarUrl(url);
    });
    return () => { cancelled = true; };
  }, [client.avatar_url]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("client-avatars").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(uploadErr.message); setUploading(false); return; }
    // Store the storage path (not a public URL) — bucket is private and
    // display goes through createSignedUrl. Bust caches with ?t= when reading.
    await supabase.from("clients").update({ avatar_url: path }).eq("id", client.id);
    toast.success(t("portal.perfil.photoUpdated"));
    setUploading(false);
    onUpdate();
  };

  const initials = `${client.first_name?.[0] || ""}${client.last_name?.[0] || ""}`.toUpperCase();

  const genderLabel = (g: string | null) => {
    if (!g) return "—";
    if (g === "M") return t("portal.perfil.genderMale");
    if (g === "F") return t("portal.perfil.genderFemale");
    return g;
  };

  return (
    <>
      <h1 className="text-2xl mb-6" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
        {t("portal.perfil.title")}
      </h1>

      <div className="flex flex-col items-center mb-6">
        <label className="cursor-pointer">
          <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center relative"
            style={{ background: "var(--bg-surface-2)", border: "3px solid var(--accent-color)" }}>
            {uploading ? (
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
            ) : signedAvatarUrl ? (
              <img loading="lazy" decoding="async" src={signedAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>{initials}</span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </label>
        <p className="text-lg font-bold mt-3" style={{ color: "var(--text-primary)" }}>
          {client.first_name} {client.last_name || ""}
        </p>
        {verified ? (
          <div className="flex items-center gap-1.5 mt-1">
            <CheckCircle size={12} style={{ color: "var(--green)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--green)" }}>{t("portal.perfil.verified")}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-1">
            <AlertCircle size={12} style={{ color: "var(--yellow)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--yellow)" }}>{t("portal.perfil.pending")}</span>
          </div>
        )}
      </div>

      <SectionHeader label={language === "es" ? "Beneficios" : "Benefits"} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <div style={{ borderBottom: "none" }}>
          <Row
            icon={Gift}
            label={language === "es" ? "Mis beneficios" : "My benefits"}
            onClick={() => navigate("/app/cliente?tab=beneficios")}
          />
        </div>
      </div>

      <SectionHeader label={t("portal.perfil.sectionWallet")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <Row icon={CreditCard} label={t("portal.perfil.viewWallet")} onClick={() => setView("wallet")}
          trailing={
            <div className="flex items-center gap-1.5">
              {client.stripe_customer_id && client.preferred_payment_method === "card" && client.card_last4 && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}>
                  <CardBrandIcon brand={client.card_brand} height={14} />
                  ••{client.card_last4}
                </span>
              )}
              {client.ath_phone_last4 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,102,179,0.12)", color: "#0066B3" }}>
                  ATH ••{client.ath_phone_last4}
                </span>
              )}
              <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
            </div>
          }
        />
      </div>

      <SectionHeader label={t("portal.perfil.sectionInfo")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <InfoRow label={t("portal.perfil.fieldName")} value={`${client.first_name} ${client.last_name || ""}`.trim()} />
        <InfoRow label={t("portal.perfil.fieldPhone")} value={client.phone || "—"} />
        <InfoRow label={t("portal.perfil.fieldEmail")} value={client.email || "—"} />
        <InfoRow label={t("portal.perfil.fieldDob")} value={client.date_of_birth ? new Date(client.date_of_birth + "T00:00:00").toLocaleDateString(localeTag, { year: "numeric", month: "long", day: "numeric" }).replace(/ de /g, ' ') : "—"} />
        <InfoRow label={t("portal.perfil.fieldGender")} value={genderLabel(client.gender)} last />
        <button onClick={() => setView("edit")} className="divider-hairline w-full px-4 py-3 text-sm font-semibold text-center"
          style={{ color: "var(--nav-accent)" }}>
          {t("portal.perfil.editProfile")}
        </button>
      </div>

      <SectionHeader label={t("portal.perfil.sectionPreferredBarber")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <div className="px-4 py-3.5">
          <select
            value={client.preferred_barber_id || ""}
            onChange={async (e) => {
              await supabase.from("clients").update({ preferred_barber_id: e.target.value || null }).eq("id", client.id);
              toast.success(t("portal.perfil.preferenceSaved"));
              onUpdate();
            }}
            className="w-full text-sm font-medium bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
          >
            <option value="">{t("portal.perfil.noPreference")}</option>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* AYUDA — top-level so the welcome tour is one tap from the profile,
          not buried inside Settings → Replay. */}
      <SectionHeader label={language === "es" ? "Ayuda" : "Help"} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <Row
          icon={Presentation}
          label={t("portal.perfil.rowReplayOnboarding")}
          onClick={() => navigate("/app/cliente?replay=true")}
        />
        <div style={{ borderBottom: "none" }}>
          <Row
            icon={HelpCircle}
            label={language === "es" ? "Contactar barbería" : "Contact shop"}
            onClick={() => navigate("/app/cliente?tab=contacto")}
          />
        </div>
      </div>

      <SectionHeader label={t("portal.perfil.sectionSettings")} />
      <div className="rounded-xl overflow-hidden mb-4 card-elevated">
        <div className="divider-hairline-b flex items-center w-full px-4 py-3.5 gap-3">
          <Bell size={20} style={{ color: "var(--accent-color)" }} />
          <div className="flex-1 text-left">
            <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {t("portal.perfil.rowNotifications")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {pushSupport === "ios-needs-pwa"
                ? t("portal.perfil.notifPushIosHint")
                : pushSupport === "unsupported"
                ? t("portal.perfil.notifPushUnsupportedHint")
                : pushOn
                ? t("portal.perfil.notifPushOn")
                : t("portal.perfil.notifPushOff")}
            </div>
          </div>
          <PushSwitch
            pushOn={pushOn}
            pushBusy={pushBusy}
            disabled={pushDisabled}
            onToggle={handlePushToggle}
            ariaLabel={t("portal.perfil.rowNotifications")}
          />
        </div>
        <LanguageRow />
        <div style={{ borderBottom: "none" }}>
          <Row icon={Lock} label={t("portal.perfil.rowChangePassword")} onClick={() => setView("password")} />
        </div>
      </div>

      <div className="rounded-xl overflow-hidden card-elevated">
        <div style={{ borderBottom: "none" }}>
          <Row icon={LogOut} label={t("portal.perfil.signOut")} onClick={signOut} danger />
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center w-full px-4 py-3 gap-3 ${last ? "" : "divider-hairline-b"}`}>
      <span className="text-xs font-medium w-28 shrink-0" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="flex-1 text-sm text-right truncate" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function LanguageRow() {
  const { language, setLanguage } = usePreferences();
  const { t } = useTranslation();
  const haptic = () => { if (navigator.vibrate) navigator.vibrate(40); };

  return (
    <div className="divider-hairline-b flex items-center w-full px-4 py-3.5 gap-3">
      <Globe size={20} style={{ color: "var(--accent-color)" }} />
      <span className="flex-1 text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t("portal.perfil.rowLanguage")}</span>
      <div className="flex rounded-full overflow-hidden" style={{ border: "1px solid var(--divider)" }}>
        {(["es", "en"] as const).map((l) => (
          <button key={l}
            onClick={() => { haptic(); setLanguage(l); }}
            className="px-3 py-1 text-xs font-semibold transition-colors duration-[250ms]"
            style={{
              background: language === l ? "var(--accent-color)" : "transparent",
              color: language === l ? "var(--cta-fg)" : "var(--text-tertiary)",
            }}>{l.toUpperCase()}</button>
        ))}
      </div>
    </div>
  );
}

function EditView({ client, onUpdate, onBack }: { client: ClientRecord; onUpdate: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(client.first_name);
  const [lastName, setLastName] = useState(client.last_name || "");
  const [phone, setPhone] = useState(client.phone || "");
  const [email, setEmail] = useState(client.email || "");
  const [dob, setDob] = useState(client.date_of_birth || "");
  const [gender, setGender] = useState(client.gender || "");
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    background: "var(--bg-surface-2)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("clients").update({
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      date_of_birth: dob || null,
      gender: gender || null,
    }).eq("id", client.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("portal.perfil.profileUpdated"));
    onUpdate();
    onBack();
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-2xl mb-6" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
        {t("portal.perfil.editTitle")}
      </h1>
      <div className="space-y-4">
        <Field label={t("portal.perfil.fieldName")} value={firstName} onChange={setFirstName} style={inputStyle} />
        <Field label={t("portal.perfil.fieldLastName")} value={lastName} onChange={setLastName} style={inputStyle} />
        <Field label={t("portal.perfil.fieldPhone")} value={phone} onChange={setPhone} style={inputStyle} type="tel" icon={Phone} />
        <Field label={t("portal.perfil.fieldEmail")} value={email} onChange={setEmail} style={inputStyle} type="email" icon={Mail} />
        <Field label={t("portal.perfil.fieldDob")} value={dob} onChange={setDob} style={inputStyle} type="date" icon={Calendar} />
        <div>
          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-secondary)" }}>{t("portal.perfil.fieldGender")}</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full rounded-lg px-3 py-2.5 text-sm" style={inputStyle}>
            <option value="">{t("portal.perfil.genderPreferNot")}</option>
            <option value="M">{t("portal.perfil.genderMale")}</option>
            <option value="F">{t("portal.perfil.genderFemale")}</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl text-sm font-semibold"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>{t("portal.perfil.cancel")}</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl text-sm font-semibold"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", opacity: saving ? 0.6 : 1 }}>
          {saving ? t("portal.perfil.saving") : t("portal.perfil.save")}
        </button>
      </div>
    </>
  );
}

function Field({ label, value, onChange, style, type = "text", icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; style: React.CSSProperties; type?: string; icon?: React.ElementType;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <div className="relative">
        {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />}
        <input value={value} onChange={(e) => onChange(e.target.value)} type={type}
          className="w-full rounded-lg py-2.5 text-sm" style={{ ...style, paddingLeft: Icon ? 36 : 12, paddingRight: 12 }} />
      </div>
    </div>
  );
}

function WalletView({ client, onBack }: { client: ClientRecord; onBack: () => void; onUpdate: () => void }) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCards = async () => {
    if (!client.stripe_customer_id) { setLoading(false); return; }
    const { data } = await supabase.functions.invoke("stripe-saved-cards", {
      body: { stripe_customer_id: client.stripe_customer_id },
    });
    setCards(data?.cards || []);
    setLoading(false);
  };

  useEffect(() => { loadCards(); }, [client.stripe_customer_id]);

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-2xl mb-6" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
        {t("portal.perfil.walletTitle")}
      </h1>

      {client.ath_phone_last4 && (
        <div className="rounded-xl p-4 mb-3 flex items-center gap-3"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,102,179,0.12)" }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#0066B3", letterSpacing: "-0.5px" }}>ATH</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              ATH Móvil •••• {client.ath_phone_last4}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {t("portal.perfil.athSavedAuto")}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--nav-accent)" }} />
        </div>
      ) : cards.length === 0 && !client.ath_phone_last4 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-surface)" }}>
          <CreditCard size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t("portal.perfil.noCardsTitle")}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {client.card_last4 && client.preferred_payment_method !== "card"
              ? t("portal.perfil.walletTokenHint")
              : t("portal.perfil.noCardsDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c: any, i: number) => (
            <div key={c.id} className="flex items-center gap-4 rounded-xl p-4"
              style={{ background: "var(--bg-surface)", border: i === 0 ? "2px solid var(--accent-color)" : "var(--card-border)" }}>
              <CardBrandIcon brand={c.brand} height={24} />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {c.brand?.toUpperCase()} •••• {c.last4}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {t("portal.perfil.expires", { exp: `${c.exp_month}/${c.exp_year}` })}
                </p>
              </div>
              {i === 0 && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}>
                  {t("portal.perfil.primary")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PasswordView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const handleChange = async () => {
    if (!oldPw || !newPw) { toast.error(t("portal.perfil.fillBothFields")); return; }
    if (newPw.length < 6) { toast.error(t("portal.perfil.passwordMinLen")); return; }
    setSaving(true);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user?.email || "",
      password: oldPw,
    });
    if (signInErr) {
      toast.error(t("portal.perfil.wrongPassword"));
      setSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("portal.perfil.passwordUpdated"));
    onBack();
  };

  const inputStyle = {
    background: "var(--bg-surface-2)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 className="text-2xl mb-6" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
        {t("portal.perfil.passwordTitle")}
      </h1>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-secondary)" }}>{t("portal.perfil.currentPassword")}</label>
          <div className="relative">
            <input value={oldPw} onChange={(e) => setOldPw(e.target.value)} type={showOld ? "text" : "password"}
              className="w-full rounded-lg px-3 py-2.5 text-sm pr-10" style={inputStyle} />
            <button onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2" type="button">
              {showOld ? <EyeOff size={16} style={{ color: "var(--text-tertiary)" }} /> : <Eye size={16} style={{ color: "var(--text-tertiary)" }} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: "var(--text-secondary)" }}>{t("portal.perfil.newPassword")}</label>
          <div className="relative">
            <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type={showNew ? "text" : "password"}
              className="w-full rounded-lg px-3 py-2.5 text-sm pr-10" style={inputStyle} />
            <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2" type="button">
              {showNew ? <EyeOff size={16} style={{ color: "var(--text-tertiary)" }} /> : <Eye size={16} style={{ color: "var(--text-tertiary)" }} />}
            </button>
          </div>
        </div>
      </div>
      <button onClick={handleChange} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold mt-6"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", opacity: saving ? 0.6 : 1 }}>
        {saving ? t("portal.perfil.changing") : t("portal.perfil.changePassword")}
      </button>
    </>
  );
}
