/**
 * AiStudioModal — guided chatbot for the Titulares article generator.
 *
 * Flow: audience → pain point → angle → context Q&A (max 5) → generate.
 * Mobile-first 430px, full-height sheet, message bubbles, quick-reply chips.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import {
  suggestStudioStep,
  generateStudioPost,
  type StudioAudience,
  type StudioQA,
} from "@/lib/blog/aiClient";
import { htmlToTiptap } from "@/lib/blog/htmlToTiptap";

type Category = { slug: string; label_es: string; label_en: string };
type Lang = "es" | "en";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  es: boolean;
}

type Stage = "audience" | "pain" | "angle" | "qa" | "generating";

interface ChatMsg {
  role: "ai" | "user";
  text: string;
  chips?: { label: string; value: string; hint?: string }[];
  freeText?: boolean;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);

const ROTATING_LOADERS_ES = [
  "Optimizando para Google...",
  "Añadiendo señales para ChatGPT y Perplexity...",
  "Tejiendo SEO local de Camuy...",
  "Traduciendo al inglés...",
  "Generando preguntas frecuentes...",
];
const ROTATING_LOADERS_EN = [
  "Optimizing for Google...",
  "Adding signals for ChatGPT and Perplexity...",
  "Weaving local Camuy SEO...",
  "Translating to Spanish...",
  "Generating FAQs...",
];

// Filho's "play-by-play" — surfaced as toast slideshow while the article
// is being drafted, so the writer sees Filho understood the assignment.
const FILO_NARRATION_ES = [
  "Filho entendió tu audiencia.",
  "Filho está investigando el ángulo.",
  "Filho está estructurando los encabezados (H2/H3).",
  "Filho está redactando el lead que engancha.",
  "Filho está añadiendo el toque local de Camuy.",
  "Filho está afinando el tono para tu marca.",
  "Filho está optimizando para búsquedas en Google.",
  "Filho está preparando señales para ChatGPT y Perplexity.",
  "Filho está creando el snapshot rápido.",
  "Filho está traduciendo al inglés.",
  "Filho está revisando legibilidad y ritmo.",
];
const FILO_NARRATION_EN = [
  "Filho understood your audience.",
  "Filho is researching the angle.",
  "Filho is outlining the headings (H2/H3).",
  "Filho is drafting an opening that hooks.",
  "Filho is adding the local Camuy touch.",
  "Filho is tuning the voice to your brand.",
  "Filho is optimizing for Google search.",
  "Filho is wiring signals for ChatGPT and Perplexity.",
  "Filho is crafting the snapshot.",
  "Filho is translating to Spanish.",
  "Filho is reviewing readability and rhythm.",
];

export function AiStudioModal({ open, onClose, categories, es }: Props) {
  const navigate = useNavigate();
  const language: Lang = es ? "es" : "en";

  const [stage, setStage] = useState<Stage>("audience");
  const [audience, setAudience] = useState<StudioAudience | null>(null);
  const [painPoint, setPainPoint] = useState<string>("");
  const [angle, setAngle] = useState<string>("");
  const [qa, setQa] = useState<StudioQA[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [postLanguage, setPostLanguage] = useState<Lang>(language);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string>("");
  const [askedCount, setAskedCount] = useState(0);
  const [loaderIdx, setLoaderIdx] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset every time modal opens
  useEffect(() => {
    if (!open) return;
    setStage("audience");
    setAudience(null);
    setPainPoint("");
    setAngle("");
    setQa([]);
    setCategory(null);
    setPostLanguage(language);
    setComposerInput("");
    setPendingQuestion("");
    setAskedCount(0);
    setMessages([{
      role: "ai",
      text: es
        ? "¡Hola! Soy tu estratega de contenido. Vamos a crear un artículo que rankee en Google y que ChatGPT cite. Primero, ¿para quién escribimos hoy?"
        : "Hi! I'm your content strategist. Let's craft an article that ranks on Google and gets cited by ChatGPT. First — who are we writing for today?",
      chips: [
        { label: es ? "Mis clientes" : "My clients", value: "clients", hint: es ? "Hombres en PR buscando grooming" : "Men in PR seeking grooming" },
        { label: es ? "Otros barberos" : "Fellow barbers", value: "barbers", hint: es ? "Dueños que quieren escalar" : "Owners wanting to scale" },
      ],
    }]);
  }, [open, es, language]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Rotating loader text
  useEffect(() => {
    if (stage !== "generating") return;
    const id = setInterval(() => setLoaderIdx((i) => i + 1), 2200);
    return () => clearInterval(id);
  }, [stage]);

  // Filho narration slideshow — surface a sequence of toasts while drafting
  // so the writer sees Filho internalizing the assignment in real time.
  useEffect(() => {
    if (stage !== "generating") return;
    const lines = es ? FILO_NARRATION_ES : FILO_NARRATION_EN;
    const shuffled = [...lines].sort(() => Math.random() - 0.5).slice(0, 6);
    let i = 0;
    const fire = () => {
      if (i >= shuffled.length) return;
      toast(shuffled[i], { duration: 2400, position: "top-center" });
      i += 1;
    };
    fire();
    const id = setInterval(fire, 2600);
    return () => clearInterval(id);
  }, [stage, es]);

  if (!open) return null;

  const pushAi = (msg: Omit<ChatMsg, "role">) => setMessages((m) => [...m, { role: "ai", ...msg }]);
  const pushUser = (text: string) => setMessages((m) => [...m, { role: "user", text }]);

  // ===== Stage handlers =====

  async function handleAudience(value: StudioAudience, label: string) {
    setAudience(value);
    pushUser(label);
    setStage("pain");
    setBusy(true);
    const data = await suggestStudioStep({ stage: "pain_points", audience: value, language });
    setBusy(false);
    if (!data?.pain_points) return;
    pushAi({
      text: es
        ? "Perfecto. Estos son los dolores más buscados ahora mismo. Elige el que más resonancia tenga (o escribe el tuyo):"
        : "Perfect. These are the most-searched pain points right now. Pick the one that resonates (or type your own):",
      chips: data.pain_points.map((p: any) => ({ label: p.label, value: p.label, hint: p.hint })),
      freeText: true,
    });
  }

  async function handlePain(value: string) {
    setPainPoint(value);
    pushUser(value);
    setStage("angle");
    setBusy(true);
    const data = await suggestStudioStep({ stage: "angles", audience, painPoint: value, language });
    setBusy(false);
    if (!data?.angles) return;
    pushAi({
      text: es
        ? "Excelente. Aquí hay 3 ángulos para abordarlo. ¿Cuál prefieres?"
        : "Excellent. Here are 3 angles to approach it. Which do you prefer?",
      chips: data.angles.map((a: any) => ({ label: a.label, value: a.label, hint: a.description })),
      freeText: true,
    });
  }

  async function handleAngle(value: string) {
    setAngle(value);
    pushUser(value);
    setStage("qa");
    await askNextQuestion(value, []);
  }

  async function askNextQuestion(currentAngle: string, currentQa: StudioQA[]) {
    setBusy(true);
    const data = await suggestStudioStep({
      stage: "question",
      audience,
      painPoint,
      angle: currentAngle,
      qa: currentQa,
      askedCount: currentQa.length,
      language,
    });
    setBusy(false);
    if (!data) return;
    if (data.done || currentQa.length >= 5 || !data.question) {
      // Move to generation
      runGenerate(currentQa);
      return;
    }
    setPendingQuestion(data.question);
    setAskedCount(currentQa.length + 1);
    pushAi({
      text: data.question,
      chips: (data.quick_replies || []).map((q: string) => ({ label: q, value: q })),
      freeText: true,
    });
  }

  async function handleQaAnswer(value: string) {
    pushUser(value);
    const nextQa = [...qa, { q: pendingQuestion, a: value }];
    setQa(nextQa);
    setPendingQuestion("");
    await askNextQuestion(angle, nextQa);
  }

  async function handleSkip() {
    pushUser(es ? "(omitir)" : "(skip)");
    runGenerate(qa);
  }

  async function runGenerate(finalQa: StudioQA[]) {
    setStage("generating");
    pushAi({
      text: es
        ? "Listo. Generando tu artículo bilingüe optimizado para SEO + GEO..."
        : "Got it. Generating your bilingual SEO + GEO optimized article...",
    });

    const post = await generateStudioPost({
      audience: audience!,
      painPoint,
      angle,
      qa: finalQa,
      category,
      language: postLanguage,
    });

    if (!post) { setStage("qa"); return; }

    const blocksEs = htmlToTiptap(post.body_es);
    const blocksEn = htmlToTiptap(post.body_en);

    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        authoring_language: postLanguage,
        category,
        status: "draft",
        is_published: false,
        title: post.title_es,
        slug: slugify(post.title_es),
        excerpt: post.excerpt_es,
        body: post.body_es,
        body_blocks_es: blocksEs as any,
        seo_title_es: post.seo_title_es,
        seo_description_es: post.seo_description_es,
        title_en: post.title_en,
        slug_en: slugify(post.title_en),
        excerpt_en: post.excerpt_en,
        body_en: post.body_en,
        body_blocks_en: blocksEn as any,
        seo_title_en: post.seo_title_en,
        seo_description_en: post.seo_description_en,
        title_es_is_auto: postLanguage === "en",
        title_en_is_auto: postLanguage === "es",
        excerpt_es_is_auto: postLanguage === "en",
        excerpt_en_is_auto: postLanguage === "es",
        body_es_is_auto: postLanguage === "en",
        body_en_is_auto: postLanguage === "es",
        cover_icon: post.cover_icon,
        cover_icon_secondary: post.cover_icon_secondary ?? null,
        cover_bg_preset: post.cover_bg_preset,
        cover_icon_auto_suggested: true,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("[Studio] insert error", error);
      toast.error(error?.message || (es ? "No se pudo crear el borrador" : "Could not create draft"));
      setStage("qa");
      return;
    }
    toast.success(es ? "Borrador generado" : "Draft generated");
    onClose();
    navigate(`/admin/titulares/${data.id}`);
  }

  // ===== Composer submit =====
  function handleComposerSubmit() {
    const v = composerInput.trim();
    if (!v) return;
    setComposerInput("");
    if (stage === "pain") handlePain(v);
    else if (stage === "angle") handleAngle(v);
    else if (stage === "qa") handleQaAnswer(v);
  }

  function handleChipClick(value: string, label?: string) {
    const display = label || value;
    if (stage === "audience") handleAudience(value as StudioAudience, display);
    else if (stage === "pain") handlePain(value);
    else if (stage === "angle") handleAngle(value);
    else if (stage === "qa") handleQaAnswer(value);
  }

  const showComposer = stage === "pain" || stage === "angle" || stage === "qa";
  const lastMsg = messages[messages.length - 1];
  const composerPlaceholder =
    stage === "pain" ? (es ? "O escribe tu propio pain point..." : "Or type your own pain point...") :
    stage === "angle" ? (es ? "O escribe tu propio ángulo..." : "Or type your own angle...") :
    stage === "qa" ? (es ? "Tu respuesta..." : "Your answer...") : "";

  // Progress dots
  const stageIdx = ["audience", "pain", "angle", "qa", "generating"].indexOf(stage);

  const loaderText = (es ? ROTATING_LOADERS_ES : ROTATING_LOADERS_EN)[loaderIdx % 5];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(20px) saturate(1.4)", WebkitBackdropFilter: "blur(20px) saturate(1.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full mx-auto rounded-t-[24px] sm:rounded-[24px] flex flex-col"
        style={{
          maxWidth: 430,
          height: "92vh",
          maxHeight: 780,
          background: "var(--bg-surface)",
          border: "1px solid var(--divider)",
          boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="flex items-center gap-3">
            <AnimatedOrbNavIcon size={34} />
            <div>
              <h2 className="text-[15px] font-semibold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
                Filho
              </h2>
              <div className="flex items-center gap-1 mt-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="rounded-full transition-all duration-500"
                    style={{
                      width: i === stageIdx ? 16 : 4,
                      height: 3,
                      background: i <= stageIdx ? "var(--accent-color)" : "var(--divider)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPostLanguage(postLanguage === "es" ? "en" : "es")}
              disabled={busy || stage === "generating"}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider disabled:opacity-50"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
              aria-label={es ? "Idioma del artículo" : "Article language"}
            >
              {postLanguage.toUpperCase()}
            </button>
            <button onClick={onClose} className="p-1.5 -m-1" disabled={stage === "generating"}>
              <X size={20} style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>
        </div>

        {/* Optional category strip (compact) */}
        {categories.length > 0 && stage === "audience" && (
          <div className="px-5 pt-3.5 pb-1">
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Categoría (opcional)" : "Category (optional)"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const active = category === c.slug;
                return (
                  <button
                    key={c.slug}
                    onClick={() => setCategory(active ? null : c.slug)}
                    className="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: active ? "var(--accent-color)" : "transparent",
                      color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                      border: `1px solid ${active ? "var(--accent-color)" : "var(--divider)"}`,
                    }}
                  >
                    {es ? c.label_es : c.label_en}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat scroll area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-3.5">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[82%]`}>
                  <div
                    className="px-3.5 py-2.5 text-[13px]"
                    style={{
                      background: m.role === "user" ? "var(--accent-color)" : "var(--bg-surface-2)",
                      color: m.role === "user" ? "var(--cta-fg)" : "var(--text-primary)",
                      border: "none",
                      borderRadius: 18,
                      lineHeight: 1.55,
                      fontFeatureSettings: '"ss01"',
                    }}
                  >
                    {m.text}
                  </div>
                  {m.chips && m.chips.length > 0 && i === messages.length - 1 && !busy && stage !== "generating" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.chips.map((c, ci) => (
                        <button
                          key={ci}
                          onClick={() => handleChipClick(c.value, c.label)}
                          className="text-left px-3.5 py-2 rounded-2xl text-[12px] font-medium active:scale-[0.97] transition-all hover:border-[color:var(--accent-color)]"
                          style={{
                            background: "var(--bg-surface-2)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--divider)",
                          }}
                        >
                          <div>{c.label}</div>
                          {c.hint && (
                            <div className="text-[10.5px] font-normal mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {c.hint}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {busy && (
            <div className="flex items-center justify-start">
              <div
                className="px-3.5 py-2.5"
                style={{
                  background: "var(--bg-surface-2)",
                  borderRadius: 18,
                }}
              >
                <div className="ai-typing-dots" aria-label="typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {stage === "generating" && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <AnimatedOrbNavIcon size={76} />
              <motion.p
                key={loaderIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-medium tracking-[0.14em] uppercase text-center"
                style={{ color: "var(--text-tertiary)" }}
              >
                {loaderText}
              </motion.p>
            </div>
          )}
        </div>

        {/* Composer */}
        {showComposer && lastMsg?.freeText && !busy && (
          <div className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]" style={{ borderTop: "1px solid var(--divider)" }}>
            <div className="flex items-end gap-2">
              <textarea
                value={composerInput}
                onChange={(e) => setComposerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComposerSubmit();
                  }
                }}
                rows={1}
                placeholder={composerPlaceholder}
                className="flex-1 px-3.5 py-2.5 text-sm outline-none resize-none max-h-24 transition-colors focus:border-[color:var(--accent-color)]"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--divider)",
                  borderRadius: 14,
                }}
              />
              {stage === "qa" && qa.length >= 2 && (
                <button
                  onClick={handleSkip}
                  className="px-3.5 py-2.5 rounded-full text-xs font-medium"
                  style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
                >
                  {es ? "Generar" : "Generate"}
                </button>
              )}
              <button
                onClick={handleComposerSubmit}
                disabled={!composerInput.trim()}
                className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
              >
                <Send size={15} className="icon-bold" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
