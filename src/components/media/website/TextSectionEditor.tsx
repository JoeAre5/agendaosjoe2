/**
 * Schema-driven editor for a single section of site_content.
 *
 * - Loads `shop_settings.site_content[sectionKey]` (live) and
 *   `draft_site_content[sectionKey]` (draft) and merges with defaults.
 * - Renders inputs based on the SectionSchema.
 * - "Guardar" writes the section into `draft_site_content` (jsonb_set).
 * - "Revertir sección" removes that key from `draft_site_content`.
 *
 * The Live Preview above the editor reads the same draft via
 * <SiteContentProvider value={draft}>, so changes appear instantly without
 * touching the public site.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SITE_CONTENT, mergeSiteContent, type SiteContent } from "@/lib/siteContent";
import { loadWebsiteDraftAssets } from "@/lib/websiteDraftAssets";

export type FieldType = "text" | "textarea" | "link";

export type Field =
  | { kind: "bilingual"; path: string; label: string; type?: FieldType }
  | { kind: "scalar"; path: string; label: string; type?: FieldType }
  | { kind: "tabs"; path: string; label: string } // bilingual list of { es, en }
  | { kind: "faq"; path: string; label: string }; // bilingual list of { q:{es,en}, a:{es,en} }

export type SectionSchema = {
  /** Top-level key inside site_content. */
  key: keyof SiteContent;
  /** Spanish + English titles for the form header (already shown by parent). */
  fields: Field[];
};

/** Get nested value at a dotted path within an object. */
function getAt(obj: any, path: string): any {
  return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
}
function setAt(obj: any, path: string, value: any): any {
  const keys = path.split(".");
  const next = { ...obj };
  let cursor: any = next;
  for (let i = 0; i < keys.length - 1; i++) {
    cursor[keys[i]] = { ...(cursor[keys[i]] ?? {}) };
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}

export function TextSectionEditor({
  schema,
  es,
  onSaved,
  onDraftChange,
}: {
  schema: SectionSchema;
  es: boolean;
  onSaved?: () => void;
  onDraftChange?: (next: any) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Current section value as the user is editing it (draft or live or default). */
  const [value, setValue] = useState<any>(null);
  /** Original value (live ?? default), used to detect dirty state. */
  const [baseline, setBaseline] = useState<any>(null);
  /** Whether there's an existing draft for this section. */
  const [hasDraft, setHasDraft] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const row = await loadWebsiteDraftAssets();
    setShopId(row?.id || null);

    const live = row?.site_content?.[schema.key];
    const draft = row?.draft_site_content?.[schema.key];
    const merged = mergeSiteContent({ [schema.key]: draft ?? live }) as any;
    const sectionVal = merged[schema.key];
    setValue(sectionVal);
    setBaseline(mergeSiteContent({ [schema.key]: live })[schema.key]);
    setHasDraft(draft !== undefined);
    onDraftChange?.(sectionVal);
    setLoading(false);
  }, [schema.key, onDraftChange]);

  useEffect(() => { void load(); }, [load]);

  const update = (next: any) => {
    setValue(next);
    onDraftChange?.(next);
  };

  const dirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(baseline), [value, baseline]);

  const save = async () => {
    if (!shopId) return;
    setBusy(true);
    try {
      // Merge new section into draft_site_content (preserve other sections).
      const data = await loadWebsiteDraftAssets();
      const existing = data?.draft_site_content || {};
      const next = { ...existing, [schema.key]: value };
      const { error } = await supabase.from("shop_settings")
        .update({ draft_site_content: next } as any).eq("id", shopId);
      if (error) throw error;
      setHasDraft(true);
      toast.success(es ? "Borrador guardado" : "Draft saved");
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally { setBusy(false); }
  };

  const revert = async () => {
    if (!shopId) return;
    setBusy(true);
    try {
      const data = await loadWebsiteDraftAssets();
      const existing = data?.draft_site_content || {};
      const next = { ...existing };
      delete next[schema.key];
      const draftValue = Object.keys(next).length === 0 ? null : next;
      const { error } = await supabase.from("shop_settings")
        .update({ draft_site_content: draftValue } as any).eq("id", shopId);
      if (error) throw error;
      await load();
      toast.success(es ? "Sección revertida" : "Section reverted");
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Revert failed");
    } finally { setBusy(false); }
  };

  if (loading || !value) {
    return <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={16} style={{ color: "var(--accent-color)" }} /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {schema.fields.map((f, idx) => (
          <FieldRow key={idx} field={f} value={value} es={es} onChange={update} />
        ))}
      </div>

      <div className="flex gap-2 sticky bottom-0 pt-2" style={{ background: "var(--bg-base)" }}>
        {hasDraft && (
          <button onClick={revert} disabled={busy}
                  className="px-3 py-2 rounded-lg text-[11px] font-bold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
            {es ? "Revertir sección" : "Revert section"}
          </button>
        )}
        <button onClick={save} disabled={busy || !dirty}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent-color)", color: "var(--cta-fg)", opacity: !dirty ? 0.5 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {es ? "Guardar borrador" : "Save draft"}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Field renderer ───────────────────────── */

function FieldRow({
  field, value, es, onChange,
}: {
  field: Field; value: any; es: boolean; onChange: (next: any) => void;
}) {
  if (field.kind === "bilingual") {
    const v = getAt(value, field.path) || { es: "", en: "" };
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        <BilingualInput
          value={v}
          type={field.type || "text"}
          onChange={(next) => onChange(setAt(value, field.path, next))}
        />
      </div>
    );
  }

  if (field.kind === "scalar") {
    const v = getAt(value, field.path) ?? "";
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        {field.type === "textarea" ? (
          <Textarea value={v} onChange={(e) => onChange(setAt(value, field.path, e.target.value))} />
        ) : (
          <Input value={v} onChange={(e) => onChange(setAt(value, field.path, e.target.value))}
                 placeholder={field.type === "link" ? "/citas or https://..." : undefined} />
        )}
      </div>
    );
  }

  if (field.kind === "tabs") {
    const list: { es: string; en: string }[] = getAt(value, field.path) || [];
    const setList = (next: { es: string; en: string }[]) =>
      onChange(setAt(value, field.path, next));
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        {list.map((item, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <Input value={item.es} placeholder="ES"
                   onChange={(e) => { const n = [...list]; n[i] = { ...n[i], es: e.target.value }; setList(n); }} />
            <Input value={item.en} placeholder="EN"
                   onChange={(e) => { const n = [...list]; n[i] = { ...n[i], en: e.target.value }; setList(n); }} />
            <button onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="p-2 rounded-md" style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button onClick={() => setList([...list, { es: "", en: "" }])}
                className="text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <Plus size={12} /> {es ? "Añadir" : "Add"}
        </button>
      </div>
    );
  }

  if (field.kind === "faq") {
    const items: { q: { es: string; en: string }; a: { es: string; en: string } }[] = getAt(value, field.path) || [];
    const setItems = (next: any[]) => onChange(setAt(value, field.path, next));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir; if (j < 0 || j >= items.length) return;
      const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n);
    };
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        {items.map((it, i) => (
          <div key={i} className="rounded-lg p-2.5 space-y-1.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold flex-1" style={{ color: "var(--text-tertiary)" }}>#{i + 1}</span>
              <button onClick={() => move(i, -1)} className="p-1.5 rounded" style={{ background: "var(--bg-surface-2)" }}><ChevronUp size={12} /></button>
              <button onClick={() => move(i, 1)}  className="p-1.5 rounded" style={{ background: "var(--bg-surface-2)" }}><ChevronDown size={12} /></button>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                      className="p-1.5 rounded" style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}><Trash2 size={12} /></button>
            </div>
            <Input value={it.q.es} placeholder={es ? "Pregunta (ES)" : "Question (ES)"}
                   onChange={(e) => { const n = [...items]; n[i] = { ...n[i], q: { ...n[i].q, es: e.target.value } }; setItems(n); }} />
            <Input value={it.q.en} placeholder={es ? "Pregunta (EN)" : "Question (EN)"}
                   onChange={(e) => { const n = [...items]; n[i] = { ...n[i], q: { ...n[i].q, en: e.target.value } }; setItems(n); }} />
            <Textarea value={it.a.es} placeholder={es ? "Respuesta (ES)" : "Answer (ES)"}
                      onChange={(e) => { const n = [...items]; n[i] = { ...n[i], a: { ...n[i].a, es: e.target.value } }; setItems(n); }} />
            <Textarea value={it.a.en} placeholder={es ? "Respuesta (EN)" : "Answer (EN)"}
                      onChange={(e) => { const n = [...items]; n[i] = { ...n[i], a: { ...n[i].a, en: e.target.value } }; setItems(n); }} />
          </div>
        ))}
        <button onClick={() => setItems([...items, { q: { es: "", en: "" }, a: { es: "", en: "" } }])}
                className="text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <Plus size={12} /> {es ? "Añadir pregunta" : "Add question"}
        </button>
      </div>
    );
  }

  return null;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{children}</div>;
}

function BilingualInput({
  value, type, onChange,
}: {
  value: { es: string; en: string }; type: FieldType;
  onChange: (next: { es: string; en: string }) => void;
}) {
  if (type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Textarea value={value.es} placeholder="ES" onChange={(e) => onChange({ ...value, es: e.target.value })} />
        <Textarea value={value.en} placeholder="EN" onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Input value={value.es} placeholder="ES" onChange={(e) => onChange({ ...value, es: e.target.value })} />
      <Input value={value.en} placeholder="EN" onChange={(e) => onChange({ ...value, en: e.target.value })} />
    </div>
  );
}

/* ───────────────────────── Per-section schemas ───────────────────────── */

export const SECTION_SCHEMAS: Partial<Record<keyof SiteContent, SectionSchema>> = {
  header: {
    key: "header",
    fields: [
      { kind: "scalar",    path: "brand_top",        label: "Brand top",        type: "text" },
      { kind: "scalar",    path: "brand_bottom",     label: "Brand bottom",     type: "text" },
      { kind: "bilingual", path: "sign_in",          label: "Sign-in (desktop)" },
      { kind: "bilingual", path: "sign_in_mobile",   label: "Sign-in (mobile)" },
    ],
  },
  hero: {
    key: "hero",
    fields: [
      { kind: "bilingual", path: "title",            label: "Title",         type: "textarea" },
      { kind: "bilingual", path: "subtitle",         label: "Subtitle",      type: "textarea" },
      { kind: "bilingual", path: "rating_label",     label: "Rating label" },
      { kind: "scalar",    path: "rating_value",     label: "Rating value",  type: "text" },
      { kind: "bilingual", path: "primary_cta",      label: "Primary CTA" },
      { kind: "scalar",    path: "primary_cta_link", label: "Primary CTA link", type: "link" },
    ],
  },
  reviews: {
    key: "reviews",
    fields: [{ kind: "bilingual", path: "eyebrow", label: "Eyebrow / title" }],
  },
  services: {
    key: "services",
    fields: [
      { kind: "bilingual", path: "eyebrow",    label: "Eyebrow / title" },
      { kind: "bilingual", path: "disclaimer", label: "Disclaimer",       type: "textarea" },
      { kind: "tabs",      path: "tabs",       label: "Category tabs" },
    ],
  },
  team: {
    key: "team",
    fields: [
      { kind: "bilingual", path: "eyebrow",    label: "Eyebrow / title" },
      { kind: "bilingual", path: "book_label", label: "Per-barber CTA label" },
    ],
  },
  install: {
    key: "install",
    fields: [
      { kind: "bilingual", path: "eyebrow",   label: "Eyebrow (micro)" },
      { kind: "bilingual", path: "title",     label: "Title" },
      { kind: "bilingual", path: "subtitle",  label: "Subtitle" },
      { kind: "bilingual", path: "paragraph", label: "Paragraph", type: "textarea" },
      { kind: "bilingual", path: "cta",       label: "CTA label" },
      { kind: "bilingual", path: "helper",    label: "Helper microcopy" },
    ],
  },
  blog: {
    key: "blog",
    fields: [
      { kind: "bilingual", path: "eyebrow",        label: "Eyebrow / title" },
      { kind: "bilingual", path: "view_all_label", label: "View all label" },
    ],
  },
  grid: {
    key: "grid",
    fields: [{ kind: "bilingual", path: "eyebrow", label: "Eyebrow / title" }],
  },
  faq: {
    key: "faq",
    fields: [
      { kind: "bilingual", path: "eyebrow", label: "Eyebrow / title" },
      { kind: "faq",       path: "items",  label: "FAQ items" },
    ],
  },
  instagram: {
    key: "instagram",
    fields: [{ kind: "bilingual", path: "eyebrow", label: "Eyebrow / title" }],
  },
  cta: {
    key: "cta",
    fields: [
      { kind: "bilingual", path: "title",            label: "Title" },
      { kind: "bilingual", path: "subtitle",         label: "Subtitle", type: "textarea" },
      { kind: "bilingual", path: "primary_label",    label: "Primary button" },
      { kind: "scalar",    path: "primary_link",     label: "Primary link",   type: "link" },
      { kind: "bilingual", path: "secondary_label",  label: "Secondary button" },
      { kind: "scalar",    path: "secondary_link",   label: "Secondary link", type: "link" },
    ],
  },
  footer: {
    key: "footer",
    fields: [
      { kind: "scalar",    path: "brand",            label: "Brand", type: "text" },
      { kind: "bilingual", path: "tagline",          label: "Tagline" },
      { kind: "bilingual", path: "links_heading",    label: "Links heading" },
      { kind: "bilingual", path: "legal_heading",    label: "Legal heading" },
      { kind: "bilingual", path: "contact_heading",  label: "Contact heading" },
      { kind: "scalar",    path: "address_line1",    label: "Address line 1", type: "text" },
      { kind: "scalar",    path: "address_line2",    label: "Address line 2", type: "text" },
      { kind: "scalar",    path: "phone",            label: "Phone",          type: "text" },
      { kind: "bilingual", path: "hours",            label: "Hours line" },
      { kind: "scalar",    path: "copyright_entity", label: "Copyright entity", type: "text" },
      { kind: "bilingual", path: "rights",           label: "Rights label" },
    ],
  },
};

// Re-export defaults for callers building a fresh override.
export { DEFAULT_SITE_CONTENT };
