import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Trash2, Plus, Camera, Phone, X, Upload } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { notifyBrandLogosUpdated } from "@/contexts/BrandLogosContext";

import { toast } from "sonner";
import { OperationalExpensesManager } from "@/components/reports/OperationalExpensesManager";

import type { Database } from "@/integrations/supabase/types";

type EmploymentType = Database["public"]["Enums"]["employment_type"];

/* ─── Extracted to avoid re-mount on every keystroke ─── */
function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div
        className="flex items-center rounded-lg px-3 py-2.5"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--divider)",
        }}
      >
        {prefix && (
          <span className="text-sm mr-1" style={{ color: "var(--text-tertiary)" }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent flex-1 text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
        />
        {suffix && (
          <span className="text-sm ml-1" style={{ color: "var(--text-tertiary)" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function LogoUploader({
  label,
  hint,
  value,
  onUpload,
  onRemove,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div
        className="flex items-center gap-3 rounded-lg p-3"
        style={{ background: "var(--bg-base)", border: "1px solid var(--divider)" }}
      >
        <div
          className="flex items-center justify-center rounded-md shrink-0"
          style={{
            width: 72,
            height: 40,
            background: "var(--bg-surface-2)",
            border: "1px dashed var(--divider)",
          }}
        >
          {value ? (
            <img src={value} alt="" style={{ maxHeight: 32, maxWidth: 64, objectFit: "contain" }} />
          ) : (
            <Upload size={14} style={{ color: "var(--text-tertiary)" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {hint && (
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {hint}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <label className="text-xs font-semibold cursor-pointer" style={{ color: "var(--accent-color)" }}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              {value ? "Reemplazar" : "Subir"}
            </label>
            {value && (
              <button onClick={onRemove} className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



function AccordionHeader({
  label,
  section,
  openSection,
  onToggle,
}: {
  label: string;
  section: string;
  openSection: string | null;
  onToggle: (s: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(section)}
      className="flex items-center w-full px-4 py-4 gap-3"
    >
      <span className="flex-1 text-left text-sm font-bold" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <ChevronDown
        size={18}
        className="transition-transform duration-200"
        style={{
          color: "var(--text-tertiary)",
          transform: openSection === section ? "rotate(180deg)" : "rotate(0deg)",
        }}
      />
    </button>
  );
}

interface ShopData {
  shop_name: string;
  city: string;
  owner_name: string;
  digital_fee_rate: number;
  header_logo_url: string | null;
  sidebar_logo_url: string | null;
  phone: string;
  whatsapp: string;
  email: string;
  maps_url: string;
  address: string;
}

interface BarberData {
  id: string;
  name: string;
  acuity_calendar_key: string | null;
  employment_type: EmploymentType;
  commission_rate: number | null;
  retention_rate: number | null;
  weekly_salary: number | null;
  bonus_threshold_cents: number;
  is_active: boolean;
  is_bookable: boolean;
  avatar_url: string | null;
  phone_2fa: string;
  email: string;
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  ig_photos: string[]; // length always 9 in UI; stored as text[] in DB
  _isNew?: boolean;
  _invited?: boolean;
}

export default function Settings() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();

  const [shop, setShop] = useState<ShopData>({
    shop_name: "",
    city: "",
    owner_name: "",
    digital_fee_rate: 0.1,
    header_logo_url: null,
    sidebar_logo_url: null,
    phone: "",
    whatsapp: "",
    email: "",
    maps_url: "",
    address: "",
  });
  const [shopId, setShopId] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<BarberData[]>([]);
  // Open accordion section persists in URL (?section=shop|barbers|expenses|recurring)
  // so refresh, back nav, and Safari app-switch restore the same expanded panel.
  const [searchParams, setSearchParams] = useSearchParams();
  const openSection = searchParams.get("section");
  const setOpenSection = useCallback(
    (s: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (s) next.set("section", s);
      else next.delete("section");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const [saving, setSaving] = useState(false);

  // Recurring consolidation
  const [consolidating, setConsolidating] = useState(false);
  const [consolidatePreview, setConsolidatePreview] = useState<any | null>(null);

  const runConsolidate = useCallback(async (dryRun: boolean) => {
    setConsolidating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("consolidate-recurring", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { dryRun, horizonDays: 365 },
      });
      if (error) throw error;
      if (dryRun) {
        setConsolidatePreview(data);
      } else {
        toast.success(
          `Consolidación lista: ${data.cancelledAppointments} citas canceladas, ${data.deletedBlocks} bloques eliminados`
        );
        setConsolidatePreview(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Error en consolidación");
    } finally {
      setConsolidating(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // SECURITY: Sensitive payroll columns (ssn_last4, weekly_salary, commission_rate, retention_rate,
    // bonus_threshold_cents, employee_id) are fetched via SECURITY DEFINER RPC. Other columns come
    // from the regular barbers table.
    const [shopPubRes, shopFinRes, barbersBaseRes, barbersPayrollRes, profilesRes] = await Promise.all([
      supabase.from("shop_settings_public" as any).select("*").limit(1).maybeSingle(),
      (supabase.rpc as any)("get_shop_financial_config"),
      supabase.from("barbers").select("id,name,color,description,timezone,email,is_active,is_bookable,is_default_checkout_barber,show_in_checkout,avatar_url,created_at,acuity_calendar_id,acuity_calendar_key,employment_type,social_facebook,social_instagram,social_tiktok,ig_photos").eq("is_active", true).order("name"),
      (supabase.rpc as any)("get_barbers_payroll"),
      supabase.from("profiles").select("barber_id, phone"),
    ]);
    const shopRes = {
      data: shopPubRes.data
        ? { ...(shopPubRes.data as object), ...(((shopFinRes?.data as any[]) || [])[0] || {}) }
        : null,
    } as any;
    // Merge payroll fields into barber rows by id
    const payrollMap = new Map<string, any>(((barbersPayrollRes?.data as any[]) || []).map((p: any) => [p.id, p]));
    const barbersRes = {
      data: (barbersBaseRes.data || []).map((b: any) => ({ ...b, ...(payrollMap.get(b.id) || {}) })),
      error: barbersBaseRes.error,
    };

    const phoneMap = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => {
      if (p.barber_id && p.phone) phoneMap.set(p.barber_id, p.phone);
    });

    if (shopRes.data) {
      setShopId(shopRes.data.id);
      setShop({
        shop_name: shopRes.data.shop_name,
        city: shopRes.data.city,
        owner_name: shopRes.data.owner_name,
        digital_fee_rate: shopRes.data.digital_fee_rate,
        header_logo_url: shopRes.data.header_logo_url ?? null,
        sidebar_logo_url: shopRes.data.sidebar_logo_url ?? null,
        phone: shopRes.data.phone ?? "",
        whatsapp: shopRes.data.whatsapp ?? "",
        email: shopRes.data.email ?? "",
        maps_url: shopRes.data.maps_url ?? "",
        address: shopRes.data.address ?? "",
      });
    }
    setBarbers(
      (barbersRes.data || []).map((b: any) => {
        const photos: string[] = Array.isArray(b.ig_photos) ? b.ig_photos : [];
        const padded = [...photos];
        while (padded.length < 9) padded.push("");
        return {
          id: b.id,
          name: b.name,
          acuity_calendar_key: b.acuity_calendar_key,
          employment_type: b.employment_type,
          commission_rate: b.commission_rate,
          retention_rate: b.retention_rate,
          weekly_salary: b.weekly_salary,
          bonus_threshold_cents: b.bonus_threshold_cents || 0,
          is_active: b.is_active,
          is_bookable: b.is_bookable !== false, // default true
          avatar_url: b.avatar_url || null,
          phone_2fa: phoneMap.get(b.id) || "",
          email: b.email || "",
          social_facebook: b.social_facebook || "",
          social_instagram: b.social_instagram || "",
          social_tiktok: b.social_tiktok || "",
          ig_photos: padded.slice(0, 9),
        } as BarberData;
      })
    );

  };

  const toggleSection = (s: string) => setOpenSection(openSection === s ? null : s);

  const handleLogoUpload = useCallback(
    async (slot: "header_logo_url" | "sidebar_logo_url", file: File) => {
      if (!shopId) return;
      if (file.size > 2 * 1024 * 1024) {
        toast.error(language === "es" ? "Max 2MB" : "Max 2MB");
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const key = slot === "header_logo_url" ? "header" : "sidebar";
      const path = `brand/${key}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("email-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("email-assets").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("shop_settings")
        .update({ [slot]: url } as any)
        .eq("id", shopId);
      if (updErr) {
        toast.error(updErr.message);
        return;
      }
      setShop((s) => ({ ...s, [slot]: url }));
      notifyBrandLogosUpdated();
      toast.success(language === "es" ? "Logo actualizado" : "Logo updated");
    },
    [shopId, language]
  );

  const handleLogoRemove = useCallback(
    async (slot: "header_logo_url" | "sidebar_logo_url") => {
      if (!shopId) return;
      const { error } = await supabase
        .from("shop_settings")
        .update({ [slot]: null } as any)
        .eq("id", shopId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setShop((s) => ({ ...s, [slot]: null }));
      notifyBrandLogosUpdated();
    },
    [shopId]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Shop settings
      if (shopId) {
        await supabase.from("shop_settings").update(shop as any).eq("id", shopId);
      }

      // Barbers
      for (const b of barbers) {
        const trimmedEmail = b.email.trim().toLowerCase();
        const payload: any = {
          name: b.name,
          acuity_calendar_key: b.acuity_calendar_key,
          employment_type: b.employment_type,
          commission_rate: b.commission_rate,
          retention_rate: b.retention_rate,
          weekly_salary: b.weekly_salary,
          bonus_threshold_cents: b.bonus_threshold_cents,
          is_active: b.is_active,
          is_bookable: b.is_bookable,
          email: trimmedEmail || null,
          social_facebook: b.social_facebook.trim() || null,
          social_instagram: b.social_instagram.trim() || null,
          social_tiktok: b.social_tiktok.trim() || null,
          ig_photos: b.ig_photos.filter((u) => u && u.trim().length > 0),
        };
        let barberRowId = b.id;
        if (b._isNew) {
          const { data: inserted, error: insertErr } = await supabase
            .from("barbers")
            .insert({ ...payload })
            .select("id")
            .single();
          if (insertErr) throw insertErr;
          if (inserted?.id) barberRowId = inserted.id;
        } else {
          await supabase.from("barbers").update(payload).eq("id", b.id);
        }

        // Save 2FA phone to profiles
        if (b.phone_2fa) {
          const normalized = `+1${b.phone_2fa.replace(/\D/g, "")}`;
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("barber_id", barberRowId)
            .limit(1)
            .maybeSingle();

          if (existingProfile) {
            await supabase.from("profiles").update({ phone: normalized } as any).eq("id", existingProfile.id);
          }
        }

        // Auto-invite: when a barber row has an email, ensure auth user + barber role exist
        if (trimmedEmail && (b._isNew || !b._invited)) {
          try {
            const { data: invRes, error: invErr } = await supabase.functions.invoke("invite-barber", {
              body: { barber_id: barberRowId, email: trimmedEmail, full_name: b.name },
            });
            if (invErr) {
              console.error("invite-barber failed:", invErr);
              toast.error(
                language === "es"
                  ? `No se pudo invitar a ${b.name}: ${invErr.message}`
                  : `Could not invite ${b.name}: ${invErr.message}`
              );
            } else if (invRes?.created_auth_user) {
              toast.success(
                language === "es"
                  ? `Invitación enviada a ${trimmedEmail}`
                  : `Invitation sent to ${trimmedEmail}`
              );
            }
          } catch (e: any) {
            console.error("invite-barber exception:", e);
          }
        }
      }

      toast.success(t("settings.saved"));
      loadData();
    } catch {
      toast.error("Error");
    } finally {
      setSaving(false);
    }
  }, [shop, shopId, barbers, t]);

  const addBarber = () => {
    setBarbers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        acuity_calendar_key: null,
        employment_type: "commission" as EmploymentType,
        commission_rate: null,
        retention_rate: null,
        weekly_salary: null,
        bonus_threshold_cents: 0,
        is_active: true,
        is_bookable: true,
        avatar_url: null,
        phone_2fa: "",
        email: "",
        social_facebook: "",
        social_instagram: "",
        social_tiktok: "",
        ig_photos: ["", "", "", "", "", "", "", "", ""],
        _isNew: true,
      },
    ]);
  };

  const updateBarber = (idx: number, updates: Partial<BarberData>) => {
    setBarbers((prev) => prev.map((b, i) => (i === idx ? { ...b, ...updates } : b)));
  };

  const handleAvatarUpload = async (idx: number, file: File) => {
    const barber = barbers[idx];
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${barber.id}.${ext}`;
    const { error } = await supabase.storage.from("barber-avatars").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: urlData } = supabase.storage.from("barber-avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    updateBarber(idx, { avatar_url: avatarUrl });
    await supabase.from("barbers").update({ avatar_url: avatarUrl } as any).eq("id", barber.id);
    toast.success(language === "es" ? "Foto actualizada" : "Photo updated");
  };


  const typeBadge = (type: EmploymentType) => {
    const labels: Record<EmploymentType, string> = {
      commission: "Comisión",
      w2_fixed: "W-2 Fijo",
      w2_variable: "W-2 Variable",
    };
    return (
      <span
        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
        style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
      >
        {labels[type]}
      </span>
    );
  };

  // Field and AccordionHeader extracted outside component (see below)

  return (
    <div
      className="relative mx-auto w-full min-h-screen"
      style={{
        maxWidth: 430,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <SubpageHeader
        title={t("menu.settings")}
        sticky
        onBack={() => navigate("/admin?tab=menu")}
      />

      <div className="px-4 pb-28">
        {/* Notifications and Launch Control intentionally removed —
            both have their own dedicated tabs in the admin menu. */}

        {/* Galleries — dedicated page to manage barber + homepage photo grids */}
        <button
          onClick={() => navigate("/admin/galleries")}
          className="w-full flex items-center justify-between mb-3 px-4 py-4 rounded-xl card-elevated"
        >
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {language === "es" ? "Galerías" : "Galleries"}
          </span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {language === "es" ? "Editar fotos →" : "Edit photos →"}
          </span>
        </button>

        {/* Shop Info */}
        <div className="rounded-xl overflow-hidden mb-3 card-elevated">
          <AccordionHeader label={t("settings.shopInfo")} section="shop" openSection={openSection} onToggle={toggleSection} />
          {openSection === "shop" && (
            <div className="px-4 pb-4">
              <Field label={t("settings.shopName")} value={shop.shop_name} onChange={(v) => setShop((s) => ({ ...s, shop_name: v }))} />
              <Field label={t("settings.city")} value={shop.city} onChange={(v) => setShop((s) => ({ ...s, city: v }))} />
              <Field label={t("settings.ownerName")} value={shop.owner_name} onChange={(v) => setShop((s) => ({ ...s, owner_name: v }))} />
              <Field
                label={language === "es" ? "Dirección" : "Address"}
                value={shop.address}
                onChange={(v) => setShop((s) => ({ ...s, address: v }))}
                placeholder="PR-2 Km 93.3 Bo. Membrillo, Camuy 00627"
              />
              <Field
                label={language === "es" ? "Enlace de Google Maps" : "Google Maps link"}
                value={shop.maps_url}
                onChange={(v) => setShop((s) => ({ ...s, maps_url: v }))}
                placeholder="https://maps.app.goo.gl/..."
              />
              <Field
                label={language === "es" ? "Teléfono" : "Phone"}
                value={shop.phone}
                onChange={(v) => setShop((s) => ({ ...s, phone: v }))}
                placeholder="+1 (787) 555-1234"
              />
              <Field
                label="WhatsApp"
                value={shop.whatsapp}
                onChange={(v) => setShop((s) => ({ ...s, whatsapp: v }))}
                placeholder={language === "es" ? "Si difiere del teléfono" : "If different from phone"}
              />
              <Field
                label={language === "es" ? "Email (opcional)" : "Email (optional)"}
                value={shop.email}
                onChange={(v) => setShop((s) => ({ ...s, email: v }))}
                placeholder="hola@charliesbarbershop.co"
              />
              <Field
                label={t("settings.digitalFee")}
                value={Math.round(shop.digital_fee_rate * 100)}
                onChange={(v) => setShop((s) => ({ ...s, digital_fee_rate: (parseInt(v) || 0) / 100 }))}
                suffix="%"
                type="number"
              />

              <LogoUploader
                label={language === "es" ? "Logo del header" : "Header logo"}
                hint={language === "es" ? "Reemplaza el logo en cada pantalla del app." : "Replaces the logo on every app screen."}
                value={shop.header_logo_url}
                onUpload={(f) => handleLogoUpload("header_logo_url", f)}
                onRemove={() => handleLogoRemove("header_logo_url")}
              />
              <LogoUploader
                label={language === "es" ? "Logo del side panel" : "Side panel logo"}
                hint={language === "es" ? "Solo visible en la vista de escritorio del admin." : "Only visible on the desktop admin sidebar."}
                value={shop.sidebar_logo_url}
                onUpload={(f) => handleLogoUpload("sidebar_logo_url", f)}
                onRemove={() => handleLogoRemove("sidebar_logo_url")}
              />
            </div>
          )}
        </div>

        {/* Barbers */}
        <div className="rounded-xl overflow-hidden mb-3 card-elevated">
          <AccordionHeader label={t("menu.barbers")} section="barbers" openSection={openSection} onToggle={toggleSection} />
          {openSection === "barbers" && (
            <div className="px-4 pb-4 space-y-3">
              {barbers.map((b, idx) => (
                <div
                  key={b.id}
                  className="rounded-xl p-3"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <label className="relative cursor-pointer shrink-0">
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(idx, f); }} />
                      {b.avatar_url ? (
                        <img loading="lazy" decoding="async" src={b.avatar_url} alt={b.name}
                          className="w-14 h-14 rounded-full object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-full flex items-center justify-center"
                          style={{ background: "var(--bg-base)", border: "2px dashed var(--divider)" }}>
                          <Camera size={20} style={{ color: "var(--text-tertiary)" }} />
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "var(--accent-color)" }}>
                        <Camera size={10} color="#fff" />
                      </div>
                    </label>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold block" style={{ color: "var(--text-primary)" }}>
                        {b.name || t("settings.newBarber")}
                      </span>
                      {typeBadge(b.employment_type)}
                    </div>
                  </div>

                  <Field
                    label={t("settings.barberName")}
                    value={b.name}
                    onChange={(v) => updateBarber(idx, { name: v })}
                  />

                  {/* Email — used to provision auth account + barber role */}
                  <div className="mb-3">
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                      Email {language === "es" ? "(login del barbero)" : "(barber login)"}
                    </label>
                    <input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="barbero@ejemplo.com"
                      value={b.email}
                      onChange={(e) => updateBarber(idx, { email: e.target.value })}
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es"
                        ? "Al guardar, se creará la cuenta y se enviará un email para fijar contraseña."
                        : "On save, an account is created and a password-setup email is sent."}
                    </p>
                  </div>

                  {/* 2FA Phone */}
                  <div className="mb-3">
                    <label className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <Phone size={12} />
                      {language === "es" ? "Teléfono 2FA" : "2FA Phone"}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-tertiary)" }}>+1</span>
                      <input
                        type="tel"
                        placeholder="(787) 555-1234"
                        value={b.phone_2fa}
                        onChange={(e) => updateBarber(idx, { phone_2fa: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                        className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                        style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                      {t("settings.employmentType")}
                    </label>
                    <select
                      value={b.employment_type}
                      onChange={(e) => updateBarber(idx, { employment_type: e.target.value as EmploymentType })}
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                    >
                      <option value="commission">Comisión</option>
                      <option value="w2_fixed">W-2 Fijo</option>
                    </select>
                  </div>

                  {b.employment_type !== "w2_variable" && (
                    <Field
                      label={t("settings.acuityKeyword")}
                      value={b.acuity_calendar_key || ""}
                      onChange={(v) => updateBarber(idx, { acuity_calendar_key: v || null })}
                    />
                  )}

                  {b.employment_type === "w2_fixed" && (
                    <Field
                      label={t("settings.weeklySalary")}
                      value={((b.weekly_salary || 0) / 100).toFixed(2)}
                      onChange={(v) => updateBarber(idx, { weekly_salary: Math.round(parseFloat(v || "0") * 100) })}
                      prefix="$"
                      type="number"
                    />
                  )}

                  {b.employment_type === "commission" && (
                    <>
                      <Field
                        label={t("settings.commissionRate")}
                        value={Math.round((b.commission_rate || 0) * 100)}
                        onChange={(v) => updateBarber(idx, { commission_rate: (parseInt(v) || 0) / 100 })}
                        suffix="%"
                        type="number"
                      />
                      <Field
                        label={t("settings.retentionRate")}
                        value={Math.round((b.retention_rate || 0) * 100)}
                        onChange={(v) => updateBarber(idx, { retention_rate: (parseInt(v) || 0) / 100 })}
                        suffix="%"
                        type="number"
                      />
                      <Field
                        label={language === "es" ? "Umbral de Bonificación (+5%)" : "Bonus Threshold (+5%)"}
                        value={(b.bonus_threshold_cents / 100).toFixed(2)}
                        onChange={(v) => updateBarber(idx, { bonus_threshold_cents: Math.round(parseFloat(v || "0") * 100) })}
                        prefix="$"
                        type="number"
                      />
                      <p className="text-[11px] -mt-2 mb-3" style={{ color: "var(--text-tertiary)" }}>
                        {language === "es"
                          ? "Al alcanzar esta producción bruta semanal, su comisión sube +5% esa semana. 0 = desactivado."
                          : "When weekly gross production reaches this amount, commission bumps +5% that week. 0 = disabled."}
                      </p>
                    </>
                  )}

                  {/* Bookable toggle */}
                  <label className="flex items-center justify-between mt-2 mb-3 px-1">
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Reservable (aparece en booking)" : "Bookable (shown in booking)"}
                    </span>
                    <input
                      type="checkbox"
                      checked={b.is_bookable}
                      onChange={(e) => updateBarber(idx, { is_bookable: e.target.checked })}
                      className="w-4 h-4"
                      style={{ accentColor: "var(--accent-color)" }}
                    />
                  </label>

                  {/* Social links */}
                  <div className="mb-3">
                    <div className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Redes sociales" : "Social links"}
                    </div>
                    <Field
                      label="Facebook"
                      value={b.social_facebook}
                      onChange={(v) => updateBarber(idx, { social_facebook: v })}
                    />
                    <Field
                      label="Instagram"
                      value={b.social_instagram}
                      onChange={(v) => updateBarber(idx, { social_instagram: v })}
                    />
                    <Field
                      label="TikTok"
                      value={b.social_tiktok}
                      onChange={(v) => updateBarber(idx, { social_tiktok: v })}
                    />
                  </div>

                  {/* Gallery link → dedicated editor with reorder + uploads */}
                  {!b._isNew && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/galleries/barber/${b.id}`)}
                      className="w-full flex items-center justify-between mt-1 mb-1 px-3 py-2.5 rounded-lg"
                      style={{ background: "var(--bg-surface-2)" }}
                    >
                      <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                        {language === "es" ? "Galería Instagram" : "Instagram gallery"}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        {b.ig_photos.filter((u) => u && u.length).length} · {language === "es" ? "Editar →" : "Edit →"}
                      </span>
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={addBarber}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium"
                style={{ borderColor: "var(--divider)", color: "var(--text-secondary)" }}
              >
                <Plus size={16} /> {t("settings.addBarber")}
              </button>
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="rounded-xl overflow-hidden mb-3 card-elevated">
          <AccordionHeader label={t("menu.expenses")} section="expenses" openSection={openSection} onToggle={toggleSection} />
          {openSection === "expenses" && (
            <div className="px-4 pb-4 space-y-3">
              <OperationalExpensesManager es={language === "es"} />

            </div>
          )}
        </div>

          {/* ── Maintenance: Recurring consolidation ── */}
        <div className="rounded-xl overflow-hidden mb-3 card-elevated">
          <AccordionHeader
            label="Mantenimiento: citas recurrentes"
            section="recurring"
            openSection={openSection}
            onToggle={toggleSection}
          />
          {openSection === "recurring" && (
            <div className="px-4 pb-4">
              <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                Consolida citas recurrentes duplicadas (mismo nombre + barbero + hora) en los próximos 365 días y elimina bloqueos sombra que dupliquen una cita recurrente. Acción no reversible — corre primero la previsualización.
              </p>

              <button
                onClick={() => runConsolidate(true)}
                disabled={consolidating}
                className="w-full py-2.5 rounded-xl text-sm font-medium mb-2 disabled:opacity-50"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
              >
                {consolidating && !consolidatePreview ? "Analizando…" : "Previsualizar"}
              </button>

              {consolidatePreview && (
                <div
                  className="rounded-xl p-3 mb-2 text-xs space-y-1"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                >
                  <div>Citas futuras escaneadas: <b>{consolidatePreview.totalFutureAppts}</b></div>
                  <div>Grupos duplicados: <b>{consolidatePreview.duplicateGroups}</b></div>
                  <div>Citas a cancelar: <b>{consolidatePreview.appointmentsToCancel}</b></div>
                  <div>Bloques sombra a eliminar: <b>{consolidatePreview.shadowBlocksToDelete}</b></div>
                  {consolidatePreview.sampleCancellations?.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                        Ver muestras
                      </summary>
                      <pre className="text-[10px] mt-2 overflow-x-auto" style={{ color: "var(--text-tertiary)" }}>
                        {JSON.stringify(consolidatePreview.sampleCancellations, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {consolidatePreview &&
                (consolidatePreview.appointmentsToCancel > 0 ||
                  consolidatePreview.shadowBlocksToDelete > 0) && (
                  <button
                    onClick={() => {
                      if (confirm("¿Ejecutar consolidación? Esta acción cancelará citas en Acuity y eliminará bloques. No se puede deshacer.")) {
                        runConsolidate(false);
                      }
                    }}
                    disabled={consolidating}
                    className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                    style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
                  >
                    {consolidating ? "Ejecutando…" : "Ejecutar consolidación"}
                  </button>
                )}
            </div>
          )}

        </div>
      </div>

      {/* Sticky Save CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3"
        style={{ background: "linear-gradient(transparent, var(--bg-base) 30%)" }}
      >
        <div className="mx-auto" style={{ maxWidth: 430 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {saving ? t("common.loading") : t("settings.saveChanges")}
          </button>
        </div>
      </div>

      
    </div>
  );
}
