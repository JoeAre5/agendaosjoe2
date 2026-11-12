// Owner-only "Difusión" composer — creates a broadcast row, uploads the optional
// hero image to the broadcast-images bucket, then invokes send-broadcast.
//
// Live preview on the right reuses the exact <BroadcastModal /> aesthetic so
// what the owner sees is what every client gets.
import { useState, useRef, useEffect } from "react";
import { Loader2, ImagePlus, Send, Trash2, Image as ImageIcon, Save, Bell, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersistentState } from "@/lib/persistentState";
import { BroadcastAssetStudio } from "./BroadcastAssetStudio";
import { BroadcastAudienceSheet } from "./BroadcastAudienceSheet";
import { fetchPushSubscribers, groupByClient } from "@/lib/pushSubscribers";
import { noTestDevicesMessage, prepareCurrentDeviceForPushTest, pushTestSetupMessage } from "@/lib/testNotifications";

export interface BroadcastDraftPrefill {
  pillEs?: string; pillEn?: string;
  titleEs?: string; titleEn?: string;
  bodyEs?: string; bodyEn?: string;
  ctaLabelEs?: string; ctaLabelEn?: string;
  ctaCustomUrl?: string;
}

interface Props {
  onSent: () => void;
  /** If set, edits an existing draft instead of creating a new row. */
  draftId?: string;
  /** Prefill fields (e.g. from Filho AI generation). Applied once on mount. */
  prefill?: BroadcastDraftPrefill;
  /** Called after a successful Save as Draft. */
  onDraftSaved?: (id: string) => void;
}

export function BroadcastComposer({ onSent, draftId, prefill, onDraftSaved }: Props) {
  const { language } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  // Draft fields are persisted to localStorage so a half-composed broadcast
  // survives Safari app-switching, refresh, and back navigation. Cleared on send.
  const [pillEs, setPillEs] = usePersistentState("broadcast.draft.pillEs", "");
  const [pillEn, setPillEn] = usePersistentState("broadcast.draft.pillEn", "");
  const [titleEs, setTitleEs] = usePersistentState("broadcast.draft.titleEs", "");
  const [titleEn, setTitleEn] = usePersistentState("broadcast.draft.titleEn", "");
  const [bodyEs, setBodyEs] = usePersistentState("broadcast.draft.bodyEs", "");
  const [bodyEn, setBodyEn] = usePersistentState("broadcast.draft.bodyEn", "");
  const [ctaLabelEs, setCtaLabelEs] = usePersistentState("broadcast.draft.ctaLabelEs", "");
  const [ctaLabelEn, setCtaLabelEn] = usePersistentState("broadcast.draft.ctaLabelEn", "");
  // Smart destination: preset key OR "custom" for free-form URL.
  // Default = "home" so the notification ALWAYS opens somewhere valid.
  const [ctaDestination, setCtaDestination] = usePersistentState<string>("broadcast.draft.ctaDestination", "home");
  const [ctaCustomUrl, setCtaCustomUrl] = usePersistentState("broadcast.draft.ctaCustomUrl", "");
  const [imageUrl, setImageUrl] = usePersistentState<string | null>("broadcast.draft.imageUrl", null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [testing, setTesting] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);

  // Live audience size — refreshes on mount and whenever the sheet opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchPushSubscribers();
        if (!cancelled) setAudienceCount(groupByClient(rows).length);
      } catch { /* silent — chip just stays as "…" */ }
    })();
    return () => { cancelled = true; };
  }, [audienceOpen]);

  const t = (es: string, en: string) => (language === "es" ? es : en);

  // Apply AI prefill once.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!prefill || prefilledRef.current) return;
    prefilledRef.current = true;
    if (prefill.pillEs !== undefined) setPillEs(prefill.pillEs);
    if (prefill.pillEn !== undefined) setPillEn(prefill.pillEn);
    if (prefill.titleEs !== undefined) setTitleEs(prefill.titleEs);
    if (prefill.titleEn !== undefined) setTitleEn(prefill.titleEn);
    if (prefill.bodyEs !== undefined) setBodyEs(prefill.bodyEs);
    if (prefill.bodyEn !== undefined) setBodyEn(prefill.bodyEn);
    if (prefill.ctaLabelEs !== undefined) setCtaLabelEs(prefill.ctaLabelEs);
    if (prefill.ctaLabelEn !== undefined) setCtaLabelEn(prefill.ctaLabelEn);
    if (prefill.ctaCustomUrl) {
      setCtaDestination("custom");
      setCtaCustomUrl(prefill.ctaCustomUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Load existing draft if draftId provided.
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setPillEs(data.pill_es ?? ""); setPillEn(data.pill_en ?? "");
      setTitleEs(data.title_es ?? ""); setTitleEn(data.title_en ?? "");
      setBodyEs(data.body_es ?? ""); setBodyEn(data.body_en ?? "");
      setCtaLabelEs(data.cta_label_es ?? ""); setCtaLabelEn(data.cta_label_en ?? "");
      const url = data.cta_url ?? "";
      const preset = DESTINATIONS.find((d) => d.url === url && d.key !== "custom");
      if (preset) { setCtaDestination(preset.key); setCtaCustomUrl(""); }
      else if (url) { setCtaDestination("custom"); setCtaCustomUrl(url); }
      setImageUrl(data.hero_image_url ?? null);
      setCurrentDraftId(data.id);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Smart destinations — curated list of valid in-app routes.
  // Each preset has bilingual default labels so the owner doesn't have to think.
  const DESTINATIONS: Array<{
    key: string;
    url: string;
    labelEs: string;
    labelEn: string;
    ctaEs: string;
    ctaEn: string;
  }> = [
    { key: "home",        url: "/app/cliente",                 labelEs: "Inicio",         labelEn: "Home",          ctaEs: "Abrir app",   ctaEn: "Open app" },
    { key: "book",        url: "/app/cliente/nueva-cita",      labelEs: "Reservar cita",  labelEn: "Book appointment", ctaEs: "Reservar",  ctaEn: "Book Now" },
    { key: "appointments",url: "/app/cliente?tab=citas",       labelEs: "Mis citas",      labelEn: "My appointments", ctaEs: "Ver citas", ctaEn: "View appointments" },
    { key: "benefits",    url: "/app/cliente?tab=beneficios",  labelEs: "Beneficios",     labelEn: "Benefits",      ctaEs: "Ver beneficios", ctaEn: "See benefits" },
    { key: "profile",     url: "/app/cliente?tab=perfil",      labelEs: "Perfil",         labelEn: "Profile",       ctaEs: "Abrir perfil", ctaEn: "Open profile" },
    { key: "contact",     url: "/app/cliente?tab=contacto",    labelEs: "Contacto",       labelEn: "Contact",       ctaEs: "Contactar",   ctaEn: "Contact us" },
    { key: "custom",      url: "",                             labelEs: "Otro (URL)",     labelEn: "Other (URL)",   ctaEs: "",            ctaEn: "" },
  ];

  const selectedDest = DESTINATIONS.find((d) => d.key === ctaDestination) ?? DESTINATIONS[0];
  const resolvedCtaUrl = ctaDestination === "custom" ? ctaCustomUrl.trim() : selectedDest.url;

  // When picking a preset, auto-fill labels if owner hasn't typed their own.
  const pickDestination = (key: string) => {
    setCtaDestination(key);
    const d = DESTINATIONS.find((x) => x.key === key);
    if (!d || key === "custom") return;
    if (!ctaLabelEs.trim()) setCtaLabelEs(d.ctaEs);
    if (!ctaLabelEn.trim()) setCtaLabelEn(d.ctaEn);
  };

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("Imagen demasiado grande (máx 5MB)", "Image too large (max 5MB)"));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("broadcast-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("broadcast-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (e: any) {
      toast.error(e.message || t("Error al subir imagen", "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setPillEs(""); setPillEn("");
    setTitleEs(""); setTitleEn("");
    setBodyEs(""); setBodyEn("");
    setCtaLabelEs(""); setCtaLabelEn("");
    setCtaDestination("home");
    setCtaCustomUrl("");
    setImageUrl(null);
  };

  const buildPayload = () => ({
    pill_es: pillEs.trim() || null,
    pill_en: pillEn.trim() || null,
    title_es: titleEs.trim(),
    title_en: titleEn.trim(),
    body_es: bodyEs.trim(),
    body_en: bodyEn.trim(),
    hero_image_url: imageUrl,
    cta_label_es: ctaLabelEs.trim() || null,
    cta_label_en: ctaLabelEn.trim() || null,
    cta_url: resolvedCtaUrl || null,
    status: "draft" as const,
  });

  const handleSaveDraft = async () => {
    if (!titleEs.trim() && !titleEn.trim() && !bodyEs.trim() && !bodyEn.trim()) {
      toast.error(t("Escribe algo antes de guardar.", "Write something before saving."));
      return;
    }
    // For drafts we relax bilingual requirement — allow incomplete content.
    const payload = {
      ...buildPayload(),
      title_es: titleEs.trim() || titleEn.trim() || "(sin título)",
      title_en: titleEn.trim() || titleEs.trim() || "(untitled)",
      body_es: bodyEs.trim() || bodyEn.trim() || "—",
      body_en: bodyEn.trim() || bodyEs.trim() || "—",
    };
    setSavingDraft(true);
    try {
      let id = currentDraftId;
      if (id) {
        const { error } = await supabase.from("broadcasts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("broadcasts").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
        setCurrentDraftId(id);
      }
      toast.success(t("Borrador guardado", "Draft saved"));
      onDraftSaved?.(id!);
    } catch (e: any) {
      toast.error(e.message || t("Error al guardar borrador", "Failed to save draft"));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendTest = async () => {
    if (!titleEs.trim() && !titleEn.trim()) {
      toast.error(t("Escribe un título antes de probar.", "Write a title before testing."));
      return;
    }
    setTesting(true);
    try {
      const prep = await prepareCurrentDeviceForPushTest(language);
      if (!prep.ok) toast.warning(pushTestSetupMessage(prep.reason, language), { duration: 5000 });
      const payload = buildPayload();
      const { data, error } = await supabase.functions.invoke("broadcast-test-send", {
        body: {
          pill_es: payload.pill_es,
          pill_en: payload.pill_en,
          title_es: titleEs.trim() || titleEn.trim(),
          title_en: titleEn.trim() || titleEs.trim(),
          body_es: bodyEs.trim() || bodyEn.trim() || "—",
          body_en: bodyEn.trim() || bodyEs.trim() || "—",
          hero_image_url: payload.hero_image_url,
          cta_label_es: payload.cta_label_es,
          cta_label_en: payload.cta_label_en,
          cta_url: payload.cta_url,
        },
      });
      if (error) throw error;
      const r = data as { sent?: number; devices?: number; skipped?: string };
      if (r?.skipped === "no_subscriptions" || r?.skipped === "no_client_row" || (r?.devices ?? 0) === 0) {
        toast.error(noTestDevicesMessage(language), { duration: 6000 });
        return;
      }
      toast.success(
        t(`Push de prueba enviado (${r?.sent ?? 0}/${r?.devices ?? 0} dispositivos)`,
          `Test push sent (${r?.sent ?? 0}/${r?.devices ?? 0} devices)`)
      );
    } catch (e: any) {
      toast.error(e.message || t("Error al enviar prueba", "Test send failed"));
    } finally {
      setTesting(false);
    }
  };

  const handleSend = async (targetClientIds?: string[], skipConfirm = false): Promise<boolean> => {
    if (!titleEs.trim() || !titleEn.trim() || !bodyEs.trim() || !bodyEn.trim()) {
      toast.error(t("Título y cuerpo son requeridos (ES + EN)", "Title and body required (ES + EN)"));
      return false;
    }
    // Use the same audience as the visible chip so the confirm count never
    // disagrees with what the owner just inspected in the sheet.
    let count = audienceCount;
    if (count === null) {
      try {
        const rows = await fetchPushSubscribers();
        count = groupByClient(rows).length;
        setAudienceCount(count);
      } catch {
        count = 0;
      }
    }

    const targetCount = targetClientIds?.length ?? count;
    if (!skipConfirm && !confirm(
      t(
        `¿Enviar a ${targetCount} cliente${targetCount === 1 ? "" : "s"} con notificaciones activas?`,
        `Send to ${targetCount} client${targetCount === 1 ? "" : "s"} with notifications enabled?`
      )
    )) return false;

    setSending(true);
    try {
      let id = currentDraftId;
      if (id) {
        const { error } = await supabase.from("broadcasts").update(buildPayload()).eq("id", id);
        if (error) throw error;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("broadcasts").insert(buildPayload()).select("id").single();
        if (insertErr) throw insertErr;
        id = inserted.id;
      }

      const { data: result, error: sendErr } = await supabase.functions.invoke("send-broadcast", {
        body: { broadcast_id: id, client_ids: targetClientIds?.length ? targetClientIds : undefined },
      });
      if (sendErr) throw sendErr;
      const r = result as { delivered: number; audience: number };
      const clientWord = r.audience === 1 ? "cliente" : "clientes";
      const deviceWordEs = r.delivered === 1 ? "dispositivo" : "dispositivos";
      const deviceWordEn = r.delivered === 1 ? "device" : "devices";
      toast.success(
        t(
          `Enviado a ${r.audience} ${clientWord} (${r.delivered} ${deviceWordEs})`,
          `Sent to ${r.audience} ${r.audience === 1 ? "client" : "clients"} (${r.delivered} ${deviceWordEn})`
        )
      );
      reset();
      setCurrentDraftId(null);
      onSent();
      return true;
    } catch (e: any) {
      toast.error(e.message || t("Error al enviar", "Send failed"));
      return false;
    } finally {
      setSending(false);
    }
  };

  // ─── Live preview ─────────────────────────────────────────────────────────
  const previewPill = language === "es" ? pillEs : pillEn;
  const previewTitle = (language === "es" ? titleEs : titleEn) || t("TÍTULO AQUÍ", "TITLE HERE");
  const previewBody = (language === "es" ? bodyEs : bodyEn) || t(
    "El cuerpo de tu mensaje aparecerá aquí.",
    "Your message body will appear here."
  );
  const previewCta = language === "es" ? ctaLabelEs : ctaLabelEn;

  return (
    <div className="space-y-5">
      {/* Live preview — sticky so it stays visible while editing fields below */}
      <div
        className="sticky z-20 -mx-4 px-4 pt-2 pb-3"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 116px)",
          background: "var(--bg-base)",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}>
            {t("Vista previa en vivo", "Live preview")}
          </h3>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}>
            {t("Actualiza al escribir", "Updates as you type")}
          </span>
        </div>
        <div className="rounded-2xl p-3 flex justify-center"
          style={{ background: "var(--bg-surface-2)" }}>
          <div className="w-full max-w-[280px] rounded-[20px] overflow-hidden transition-all"
            style={{ background: "var(--bg-surface)" }}>
            {imageUrl && (
              <div className="px-2.5 pt-2.5">
                <div className="rounded-lg overflow-hidden" style={{ aspectRatio: "3 / 2" }}>
                  <img loading="lazy" decoding="async" src={imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
            <div className="px-4 pt-3 pb-4 text-center">
              {previewPill && (
                <div className="flex justify-center mb-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{
                      background: "var(--accent-tint, hsl(var(--accent) / 0.15))",
                      color: "var(--accent-color, hsl(var(--accent)))",
                    }}>
                    {previewPill}
                  </span>
                </div>
              )}
              <h2 className="text-[17px] leading-[1.1] mb-1.5"
                style={{ fontWeight: 900, letterSpacing: "-0.4px", textTransform: "uppercase" }}>
                {previewTitle}
              </h2>
              <p className="text-[11px] leading-[1.4] mb-3" style={{ color: "var(--text-secondary)" }}>
                {previewBody}
              </p>
              {previewCta && (
                <span className="inline-block px-5 py-1.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: "var(--cta-bg, hsl(var(--foreground)))",
                    color: "var(--cta-fg, hsl(var(--background)))",
                  }}>
                  {previewCta}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hero image */}
      <Field label={t("Imagen (3:2)", "Image (3:2)")}>
        {imageUrl ? (
          <div className="flex items-center gap-3">
            <img loading="lazy" decoding="async" src={imageUrl} alt="" className="w-16 h-16 object-cover rounded-lg" />
            <button
              onClick={() => setImageUrl(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
            >
              <Trash2 size={12} /> {t("Quitar", "Remove")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {uploading ? t("Subiendo…", "Uploading…") : t("Subir imagen", "Upload image")}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </Field>

      {/* Bilingual fields */}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Pill (ES)" value={pillEs} onChange={setPillEs}
          placeholder="What's New - April 2026" />
        <TextField label="Pill (EN)" value={pillEn} onChange={setPillEn}
          placeholder="What's New - April 2026" />
        <TextField label="Título (ES)*" value={titleEs} onChange={setTitleEs}
          placeholder="SEEDANCE 2.0 ESTÁ AQUÍ" />
        <TextField label="Title (EN)*" value={titleEn} onChange={setTitleEn}
          placeholder="SEEDANCE 2.0 IS HERE" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextArea label="Cuerpo (ES)*" value={bodyEs} onChange={setBodyEs} />
        <TextArea label="Body (EN)*" value={bodyEn} onChange={setBodyEn} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="CTA Label (ES)" value={ctaLabelEs} onChange={setCtaLabelEs}
          placeholder="Reservar" />
        <TextField label="CTA Label (EN)" value={ctaLabelEn} onChange={setCtaLabelEn}
          placeholder="Book Now" />
      </div>
      {/* Smart destination picker — replaces free-form URL field.
          Default = Home so the notification ALWAYS opens somewhere valid. */}
      <Field label={t("¿A dónde lleva el botón?", "Where does the button go?")}>
        <div className="grid grid-cols-2 gap-2">
          {DESTINATIONS.map((d) => {
            const active = ctaDestination === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => pickDestination(d.key)}
                className="px-3 py-2.5 rounded-lg text-[12px] font-semibold text-left transition-all"
                style={{
                  background: active ? "hsl(var(--foreground))" : "var(--bg-surface)",
                  color: active ? "hsl(var(--background))" : "var(--text-primary)",
                  border: `1px solid ${active ? "hsl(var(--foreground))" : "var(--divider)"}`,
                }}
              >
                {language === "es" ? d.labelEs : d.labelEn}
              </button>
            );
          })}
        </div>
        {ctaDestination === "custom" ? (
          <input
            value={ctaCustomUrl}
            onChange={(e) => setCtaCustomUrl(e.target.value)}
            placeholder="/app/cliente/nueva-cita"
            className="mt-2 w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--divider)",
            }}
          />
        ) : (
          <p className="mt-1.5 px-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {t("Se abre en:", "Opens at:")} <span className="font-mono">{selectedDest.url}</span>
          </p>
        )}
      </Field>

      {/* Audience chip — opens a sheet listing every client with push enabled.
          The whole chip is tappable. Mirrors the "Sent to clients" affordance. */}
      <button
        type="button"
        onClick={() => setAudienceOpen(true)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left active:scale-[0.99] transition-transform"
        style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-surface-2)" }}>
          <Users size={14} className="icon-bold" style={{ color: "var(--text-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
            {audienceCount === null
              ? t("Calculando audiencia…", "Calculating audience…")
              : t(
                  `Enviar a ${audienceCount} cliente${audienceCount === 1 ? "" : "s"} con notificaciones`,
                  `Send to ${audienceCount} client${audienceCount === 1 ? "" : "s"} with notifications`
                )}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {t("Toca para ver la lista de dispositivos", "Tap to view the device list")}
          </div>
        </div>
      </button>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSendTest}
          disabled={testing}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          {testing ? t("Probando…", "Testing…") : t("Enviar prueba", "Send test")}
        </button>
        <button
          onClick={() => void handleSend()}
          disabled={sending}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "hsl(var(--foreground))",
            color: "hsl(var(--background))",
          }}
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? t("Enviando…", "Sending…") : t("Enviar a todos", "Send to all")}
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        >
          {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {savingDraft
            ? t("Guardando…", "Saving…")
            : currentDraftId
              ? t("Actualizar borrador", "Update draft")
              : t("Guardar borrador", "Save as draft")}
        </button>
        {/* Asset Studio — generate downloadable PNG marketing material from
            the live draft. Disabled until there's at least a title to render. */}
        <button
          type="button"
          onClick={() => setStudioOpen(true)}
          disabled={!titleEs.trim() && !titleEn.trim()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        >
          <ImageIcon size={14} />
          {t("Generar asset", "Generate asset")}
        </button>
      </div>

      {studioOpen && (
        <BroadcastAssetStudio
          payload={{
            pillEs, pillEn,
            titleEs: titleEs || t("TÍTULO AQUÍ", "TITLE HERE"),
            titleEn: titleEn || t("TÍTULO AQUÍ", "TITLE HERE"),
            bodyEs: bodyEs || t("El cuerpo de tu mensaje aparecerá aquí.", "Your message body will appear here."),
            bodyEn: bodyEn || t("El cuerpo de tu mensaje aparecerá aquí.", "Your message body will appear here."),
            ctaLabelEs: ctaLabelEs,
            ctaLabelEn: ctaLabelEn,
            imageUrl,
          }}
          slug={(titleEs || titleEn || "broadcast").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}
          onClose={() => setStudioOpen(false)}
        />
      )}

      <BroadcastAudienceSheet
        open={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        es={language === "es"}
        sending={sending}
        onSendSelected={(clientIds) => handleSend(clientIds, true)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 px-1"
        style={{ color: "var(--text-tertiary)" }}>{label}</label>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
        style={{
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--divider)",
        }}
      />
    </Field>
  );
}

function TextArea({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none resize-none"
        style={{
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--divider)",
        }}
      />
    </Field>
  );
}
