/**
 * Client wrappers for the Titulares AI edge functions.
 *
 * These call:
 *  - blog-snapshot-generate → 3-5 TL;DR bullets
 *  - blog-seo-generate     → SEO title + description
 *  - blog-translate        → translate fields between es ↔ en
 *
 * All three return user-facing toast errors when the gateway is rate-limited
 * (429) or out of credits (402). Owners only (server enforces).
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lang = "es" | "en";

function handleEdgeError(err: any, language: Lang) {
  const es = language === "es";
  // Edge functions return { error: "rate_limited" | "credits_exhausted" | ... }
  // supabase-js puts the function's body in err.context (when status !== 2xx).
  const code = err?.context?.body?.error || err?.message || "";
  if (String(code).includes("rate_limited") || err?.context?.status === 429) {
    toast.error(es ? "Muchas solicitudes. Intenta en un momento." : "Too many requests. Try again shortly.");
    return;
  }
  if (String(code).includes("credits_exhausted") || err?.context?.status === 402) {
    toast.error(es ? "Créditos de IA agotados. Añade fondos." : "AI credits exhausted. Add funds.");
    return;
  }
  toast.error(es ? "La IA no respondió. Intenta de nuevo." : "AI failed. Try again.");
}

export async function generateSnapshot(args: {
  language: Lang;
  title: string;
  body: string;
}): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-snapshot-generate", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return Array.isArray(data?.bullets) ? data.bullets : [];
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

export async function generateSeo(args: {
  language: Lang;
  title: string;
  excerpt: string;
  body: string;
}): Promise<{ seo_title: string; seo_description: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-seo-generate", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return {
      seo_title: data?.seo_title || "",
      seo_description: data?.seo_description || "",
    };
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

export interface TranslateFields {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  snapshot?: string[] | null;
}

export interface WizardPost {
  title_es: string; excerpt_es: string; body_es: string;
  title_en: string; excerpt_en: string; body_en: string;
  snapshot_es: string[]; snapshot_en: string[];
  seo_title_es: string; seo_description_es: string;
  seo_title_en: string; seo_description_en: string;
  cover_icon: string; cover_icon_secondary: string | null; cover_bg_preset: string;
}

export async function suggestCover(args: {
  language: Lang;
  title: string;
  excerpt?: string;
  body?: string;
}): Promise<{ icon: string; icon_secondary: string | null; bg_preset: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-cover-suggest", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return {
      icon: data?.icon || "",
      icon_secondary: data?.icon_secondary ?? null,
      bg_preset: data?.bg_preset || "primary-gradient",
    };
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

export async function generateWizardPost(args: {
  topic: string;
  category?: string | null;
  language: Lang;
}): Promise<WizardPost | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-wizard-generate", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return (data?.post || null) as WizardPost | null;
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

// ---- Studio (chatbot) ----
export type StudioAudience = "clients" | "barbers";
export interface StudioQA { q: string; a: string }

export interface StudioPost extends WizardPost {
  faq_es: { q: string; a: string }[];
  faq_en: { q: string; a: string }[];
}

export async function suggestStudioStep(args: {
  stage: "pain_points" | "angles" | "question";
  audience?: StudioAudience | null;
  painPoint?: string | null;
  angle?: string | null;
  qa?: StudioQA[];
  askedCount?: number;
  language: Lang;
}): Promise<any | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-studio-suggest", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return data;
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

export async function generateStudioPost(args: {
  audience: StudioAudience;
  painPoint: string;
  angle: string;
  qa: StudioQA[];
  category?: string | null;
  language: Lang;
}): Promise<StudioPost | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-studio-generate", { body: args });
    if (error) { handleEdgeError(error, args.language); return null; }
    return (data?.post || null) as StudioPost | null;
  } catch (e) { handleEdgeError(e, args.language); return null; }
}

export async function translatePost(args: {
  from: Lang;
  to: Lang;
  fields: TranslateFields;
}): Promise<TranslateFields | null> {
  try {
    const { data, error } = await supabase.functions.invoke("blog-translate", { body: args });
    if (error) { handleEdgeError(error, args.from); return null; }
    return (data?.translated || {}) as TranslateFields;
  } catch (e) { handleEdgeError(e, args.from); return null; }
}
