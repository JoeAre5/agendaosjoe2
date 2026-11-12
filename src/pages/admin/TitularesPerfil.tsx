/**
 * Admin → Headlines → Author Profile (publication settings)
 *
 * Single-row config: avatar, name, bio (ES/EN), role (ES/EN), social links,
 * and which share buttons appear under each post.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Upload, Check } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { usePublicationSettings, type PublicationSettings } from "@/hooks/usePublicationSettings";
import { toast } from "sonner";

const SOCIAL_FIELDS: Array<{ key: keyof PublicationSettings; label: string; placeholder: string }> = [
  { key: "social_whatsapp", label: "WhatsApp", placeholder: "17875551234 (dígitos con código de país)" },
  { key: "social_facebook", label: "Facebook", placeholder: "https://facebook.com/charliesbarbershop" },
  { key: "social_instagram", label: "Instagram", placeholder: "https://instagram.com/charliesbarbershop" },
  { key: "social_youtube", label: "YouTube", placeholder: "https://youtube.com/@canal" },
  { key: "social_email", label: "Email", placeholder: "info@charliesbarbershop.co" },
];

// Note: Instagram & YouTube intentionally excluded — they have no web share
// endpoints. Readers share to those apps via the native share sheet (✈ button).
const SHARE_TOGGLES: Array<{ key: keyof PublicationSettings; label: string }> = [
  { key: "share_whatsapp_enabled", label: "WhatsApp" },
  { key: "share_facebook_enabled", label: "Facebook" },
  { key: "share_email_enabled", label: "Email" },
  { key: "share_copy_enabled", label: "Compartir nativo (✈)" },
];

export default function TitularesPerfil() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const { refresh } = usePublicationSettings();
  const [form, setForm] = useState<PublicationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Owner reads the full row (including social_email) directly.
    supabase
      .from("blog_publication_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!cancelled && row) setForm(row as PublicationSettings);
      });
    return () => { cancelled = true; };
  }, []);

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const set = <K extends keyof PublicationSettings>(k: K, v: PublicationSettings[K]) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  async function uploadAvatar(file: File) {
    if (!form) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${form.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("author-avatars").upload(path, file, { upsert: true });
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("author-avatars").getPublicUrl(path);
    set("author_avatar_url", publicUrl);
    setUploading(false);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const { id, ...patch } = form;
    const { error } = await supabase
      .from("blog_publication_settings")
      .update(patch as any)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(es ? "Guardado" : "Saved");
    await refresh();
  }

  return (
    <div className="min-h-screen mx-auto w-full pb-32" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        sticky
        title={es ? "Panel de autor" : "Admin panel"}
        onBack={() => navigate("/admin/titulares")}
        actions={
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="icon-bold" />}
            {es ? "Guardar" : "Save"}
          </button>
        }
      />

      <div className="px-4 space-y-5">
        {/* Personal info */}
        <Section title={es ? "Tu información" : "Your personal info"} subtitle={es ? "Aparece debajo del título de cada artículo." : "Shows below each article title."}>
          {/* Avatar */}
          <div className="mb-4">
            <label className="block">
              <div
                className="mx-auto rounded-full flex items-center justify-center overflow-hidden cursor-pointer relative"
                style={{ width: 160, height: 160, background: "var(--bg-surface-2)", border: "1.5px dashed var(--divider)" }}
              >
                {form.author_avatar_url ? (
                  <img loading="lazy" decoding="async" src={form.author_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload size={20} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-1" />
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Subir foto" : "Upload photo"}
                    </div>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                    <Loader2 size={20} className="animate-spin" style={{ color: "white" }} />
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
              />
            </label>
            <div className="text-[10px] mt-1.5 text-center" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Recomendado: 800x800 px (cuadrado, se recorta en círculo)" : "Recommended: 800x800 px (square, cropped to circle)"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Field label={es ? "Nombre" : "First name"} value={form.author_first_name} onChange={(v) => set("author_first_name", v)} />
            <Field label={es ? "Apellido" : "Last name"} value={form.author_last_name} onChange={(v) => set("author_last_name", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Field label={es ? "Rol (ES)" : "Role (ES)"} value={form.author_role_es} onChange={(v) => set("author_role_es", v)} placeholder="Owner & Master Barber" />
            <Field label={es ? "Rol (EN)" : "Role (EN)"} value={form.author_role_en} onChange={(v) => set("author_role_en", v)} placeholder="Owner & Master Barber" />
          </div>
          <Field label="Bio (ES)" value={form.author_bio_es} onChange={(v) => set("author_bio_es", v)} multiline placeholder={es ? "Breve descripción del autor." : "Brief author bio."} />
          <Field label="Bio (EN)" value={form.author_bio_en} onChange={(v) => set("author_bio_en", v)} multiline placeholder="Brief author bio." />
        </Section>

        {/* Social */}
        <Section title={es ? "Tus redes sociales" : "Your social links"} subtitle={es ? "Aparecen en tu página de autor." : "Shown on your author page."}>
          <div className="space-y-2.5">
            {SOCIAL_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={form[f.key] as string | null}
                onChange={(v) => set(f.key, v as any)}
                placeholder={f.placeholder}
              />
            ))}
          </div>
        </Section>

        {/* Share toggles */}
        <Section title={es ? "Botones de compartir" : "Share buttons"} subtitle={es ? "Decide cuáles aparecen al final de cada artículo." : "Pick which appear at the end of each article."}>
          <div className="space-y-1.5">
            {SHARE_TOGGLES.map((t) => (
              <label
                key={t.key}
                className="flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer"
                style={{ background: "var(--bg-surface-2)" }}
              >
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</span>
                <input
                  type="checkbox"
                  checked={!!form[t.key]}
                  onChange={(e) => set(t.key, e.target.checked as any)}
                  className="w-5 h-5"
                  style={{ accentColor: "var(--accent-color)" }}
                />
              </label>
            ))}
          </div>
        </Section>

        {/* Categories manager */}
        <CategoriesManager es={es} />
      </div>
    </div>
  );
}

/* ─────────────── Categories manager ─────────────── */
function CategoriesManager({ es }: { es: boolean }) {
  const [cats, setCats] = useState<Array<{ slug: string; label_es: string; label_en: string; is_active: boolean }>>([]);
  const [newEs, setNewEs] = useState("");
  const [newEn, setNewEn] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("blog_categories")
      .select("slug, label_es, label_en, is_active")
      .order("sort_order");
    setCats((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

  const add = async () => {
    if (!newEs.trim()) return;
    setBusy(true);
    const slug = slugify(newEs);
    const { error } = await supabase.from("blog_categories").insert({
      slug, label_es: newEs.trim(), label_en: (newEn || newEs).trim(), is_active: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewEs(""); setNewEn(""); load();
  };

  const rename = async (slug: string, field: "label_es" | "label_en", value: string) => {
    setCats((c) => c.map((x) => x.slug === slug ? { ...x, [field]: value } : x));
    const patch: any = { [field]: value };
    await supabase.from("blog_categories").update(patch).eq("slug", slug);
  };

  const toggle = async (slug: string, is_active: boolean) => {
    setCats((c) => c.map((x) => x.slug === slug ? { ...x, is_active } : x));
    await supabase.from("blog_categories").update({ is_active }).eq("slug", slug);
  };

  return (
    <Section
      title={es ? "Categorías" : "Categories"}
      subtitle={es ? "Renombra o agrega categorías para tus artículos." : "Rename or add categories used by your posts."}
    >
      <div className="space-y-2 mb-3">
        {cats.map((c) => (
          <div key={c.slug} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
            <input
              value={c.label_es}
              onChange={(e) => rename(c.slug, "label_es", e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
            <input
              value={c.label_en}
              onChange={(e) => rename(c.slug, "label_en", e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-secondary)" }}
            />
            <input
              type="checkbox"
              checked={c.is_active}
              onChange={(e) => toggle(c.slug, e.target.checked)}
              className="w-4 h-4"
              style={{ accentColor: "var(--accent-color)" }}
              aria-label={es ? "Activa" : "Active"}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newEs}
          onChange={(e) => setNewEs(e.target.value)}
          placeholder={es ? "Nueva (ES)" : "New (ES)"}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        />
        <input
          value={newEn}
          onChange={(e) => setNewEn(e.target.value)}
          placeholder="New (EN)"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        />
        <button
          onClick={add}
          disabled={busy || !newEs.trim()}
          className="px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
        >
          {es ? "Añadir" : "Add"}
        </button>
      </div>
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 card-elevated">
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{title}</h2>
      {subtitle && <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const Cmp: any = multiline ? "textarea" : "input";
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <Cmp
        value={value || ""}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
        style={{
          background: "var(--bg-surface-2)",
          color: "var(--text-primary)",
          border: "1px solid var(--divider)",
        }}
      />
    </label>
  );
}
