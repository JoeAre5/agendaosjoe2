// FilhoPublicModal — anonymous chat popup for the public site.
// Filho NO orquesta booking. Cuando detecta intención de reservar, devuelve
// uiHint.openBookingFlow y aquí renderizamos un botón que abre el
// PublicBookingFlow oficial (mismo componente que el sitio público).
// Eso reusa todos los pasos: barbero → servicio → complementos → productos →
// fecha/hora → datos → pago. Filho solo conversa e informa.
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X, MapPin, Phone, CalendarDays, ThumbsUp, ThumbsDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useBooking } from "@/contexts/BookingContext";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";

type Msg = { role: "user" | "assistant"; content: string; uiHint?: any; feedback?: "up" | "down" };

const SS_KEY = "filho.public.messages";
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/filho-agent`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function FilhoPublicModal({ onClose }: { onClose: () => void }) {
  const { language } = useTranslation();
  const { openBooking } = useBooking();
  const es = language === "es";
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) return JSON.parse(raw) as Msg[];
    } catch { /* noop */ }
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Primary CTA = booking. Secondary actions stack below.
  const PRIMARY_STARTER = es ? "Reservar cita" : "Book appointment";
  const SECONDARY_STARTERS = es
    ? ["Ver servicios y precios", "Ubicación", "Hablar con barbero"]
    : ["See services & prices", "Location", "Talk to barber"];

  const sendFeedback = async (idx: number, value: "up" | "down") => {
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, feedback: value } : m)));
    if (!conversationId) return;
    try {
      await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ action: "feedback", conversation_id: conversationId, feedback: value }),
      });
    } catch { /* silent */ }
  };

  useEffect(() => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(messages)); } catch {}
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleClose = () => {
    try { sessionStorage.removeItem(SS_KEY); } catch {}
    onClose();
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    if (textOverride === undefined) setInput("");
    setLoading(true);
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          history: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          locale: es ? "es" : "en",
        }),
      });
      const data = await resp.json();
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const reply = (data?.message as string) || (es ? "Algo salió mal." : "Something went wrong.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply, uiHint: data?.uiHint }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: es ? "Error de conexión." : "Connection error." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBooking = () => {
    // Cerramos el chat (sessionStorage se preserva si vuelve) y abrimos el
    // flow público oficial SIEMPRE en el primer paso, sin preselecciones.
    onClose();
    setTimeout(() => openBooking(), 50);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={handleClose} />
      <div
        
        
        className="fixed inset-x-3 z-[61] flex flex-col"
        style={{
          top: "max(24px, env(safe-area-inset-top, 0px))",
          bottom: "max(24px, env(safe-area-inset-bottom, 0px))",
          maxWidth: 420,
          marginInline: "auto",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          borderRadius: 24,
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 divider-hairline-b">
          <div className="flex items-center gap-2.5">
            <AnimatedOrbNavIcon size={28} />
            <div>
              <div className="text-[15px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>Filho</div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Tu asistente virtual" : "Your virtual assistant"}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label={es ? "Cerrar" : "Close"}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition"
            style={{
              background: "var(--bg-surface-2)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-strong)",
            }}>
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center pt-8 px-4 space-y-4">
              <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                {es
                  ? "¡Hola! Soy Filho. ¿En qué te ayudo hoy?"
                  : "Hi! I'm Filho. How can I help today?"}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void send(PRIMARY_STARTER)}
                  className="w-full px-4 py-3 rounded-2xl text-[14px] font-semibold active:scale-[0.98] transition"
                  style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                  {PRIMARY_STARTER}
                </button>
                {SECONDARY_STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="w-full px-4 py-2.5 rounded-2xl text-[13px] font-medium active:scale-[0.98] transition"
                    style={{
                      background: "var(--bg-surface-2, rgba(0,0,0,0.05))",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border, rgba(0,0,0,0.08))",
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            const hint = m.uiHint;
            const showWhatsApp = !!hint?.showWhatsAppHandoff && hint.href;
            const showDirections = !!hint?.showDirections && hint.href;
            const showCall = !!hint?.showCallButton && hint.href;
            const showOpenBooking = !!hint?.openBookingFlow;
            const chips: Array<{ label_es?: string; label_en?: string; send_es?: string; send_en?: string }> | undefined =
              Array.isArray(hint?.chips) ? hint.chips : undefined;
            const priceList: { barberName?: string; services?: Array<{ name: string; duration_minutes: number; price_usd: number }> } | undefined =
              hint?.showBarberPriceList ? { barberName: hint.barberName, services: hint.services } : undefined;
            return (
              <div key={i} className="space-y-2">
                <MessageBubble m={m} es={es} />
                {priceList?.services && priceList.services.length > 0 && (
                  <div
                    className="rounded-2xl p-3 space-y-2"
                    style={{
                      background: "var(--bg-surface-2, rgba(0,0,0,0.05))",
                      border: "1px solid var(--border, rgba(0,0,0,0.08))",
                    }}>
                    <div className="text-[12px] font-semibold uppercase tracking-wide opacity-70">
                      {priceList.barberName}
                    </div>
                    {priceList.services.map((s) => (
                      <div key={s.name} className="flex items-baseline justify-between text-[13px]">
                        <span style={{ color: "var(--text-primary)" }}>
                          {s.name}
                          <span className="opacity-60 text-[11px] ml-2">{s.duration_minutes} min</span>
                        </span>
                        <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                          ${s.price_usd.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {chips && chips.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {chips.map((c, ci) => {
                      const label = (es ? c.label_es : c.label_en) || c.label_es || c.label_en || "";
                      const sendText = (es ? c.send_es : c.send_en) || c.send_es || c.send_en || label;
                      if (!label) return null;
                      return (
                        <button
                          key={`${i}-chip-${ci}`}
                          onClick={() => void send(sendText)}
                          disabled={loading}
                          className="px-3 py-2 rounded-full text-[12px] font-medium active:scale-95 transition"
                          style={{
                            background: "var(--bg-surface-2, rgba(0,0,0,0.05))",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border, rgba(0,0,0,0.08))",
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {showOpenBooking && (
                  <button
                    onClick={() => handleOpenBooking()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
                    style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                    <CalendarDays size={14} />
                    {es ? (hint.label_es || "Abrir reserva") : (hint.label_en || "Open booking")}
                  </button>
                )}
                {showWhatsApp && (
                  <a
                    href={hint.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
                    style={{ background: "#25D366", color: "#fff" }}>
                    <span aria-hidden>💬</span>
                    {es ? (hint.label_es || "Hablar por WhatsApp") : (hint.label_en || "Talk on WhatsApp")}
                  </a>
                )}
                {showDirections && (
                  <a
                    href={hint.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
                    style={{ background: "#1A73E8", color: "#fff" }}>
                    <MapPin size={14} />
                    {es ? (hint.label_es || "Abrir en Maps") : (hint.label_en || "Open in Maps")}
                  </a>
                )}
                {showCall && (
                  <a
                    href={hint.href}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
                    style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                    <Phone size={14} />
                    {es ? (hint.label_es || "Llamar") : (hint.label_en || "Call")}
                    {hint.phoneDisplay && <span className="opacity-80">· {hint.phoneDisplay}</span>}
                  </a>
                )}
                {m.role === "assistant" && conversationId && (
                  <div className="flex items-center gap-1 pl-1 opacity-70">
                    <button
                      onClick={() => void sendFeedback(i, "up")}
                      aria-label={es ? "Útil" : "Helpful"}
                      className={`w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition ${m.feedback === "up" ? "opacity-100" : "opacity-50 hover:opacity-100"}`}
                      style={{ color: m.feedback === "up" ? "#22c55e" : "var(--text-tertiary)" }}
                      disabled={!!m.feedback}>
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      onClick={() => void sendFeedback(i, "down")}
                      aria-label={es ? "No útil" : "Not helpful"}
                      className={`w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition ${m.feedback === "down" ? "opacity-100" : "opacity-50 hover:opacity-100"}`}
                      style={{ color: m.feedback === "down" ? "#ef4444" : "var(--text-tertiary)" }}
                      disabled={!!m.feedback}>
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              <Loader2 size={14} className="animate-spin" />
              {es ? "Filho está escribiendo…" : "Filho is typing…"}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 divider-hairline">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={es ? "Escribe un mensaje…" : "Type a message…"}
              className="flex-1 resize-none rounded-2xl px-3 py-2 text-[14px] focus:outline-none placeholder:text-[var(--text-tertiary)]"
              style={{
                background: "var(--bg-surface-2, rgba(255,255,255,0.06))",
                color: "var(--text-primary)",
                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                maxHeight: 120,
              }} />
            {(() => {
              const canSend = !!input.trim() && !loading;
              return (
                <button
                  onClick={() => void send()}
                  disabled={!canSend}
                  aria-label={es ? "Enviar" : "Send"}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 ease-out"
                  style={{
                    background: canSend ? "var(--cta-bg)" : "var(--bg-surface-2)",
                    color: canSend ? "var(--cta-fg)" : "var(--text-tertiary)",
                    border: canSend ? "none" : "1px solid var(--border-strong)",
                    cursor: canSend ? "pointer" : "default",
                  }}>
                  <Send size={16} />
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m, es }: { m: Msg; es: boolean }) {
  const isUser = m.role === "user";
  const showLogin = !isUser && !!m.uiHint?.loginSuggestion;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[80%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap " +
          (isUser
            ? "bg-black text-white dark:bg-[rgba(160,128,96,1)] dark:text-white"
            : "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white")
        }>
        {m.content}
        {showLogin && (
          <div className="mt-2">
            <Link
              to="/login"
              className="inline-flex items-center justify-center px-3 py-2 rounded-full text-[12px] font-semibold"
              style={{ background: "#fff", color: "rgba(160,128,96,1)" }}>
              {es ? "Iniciar sesión" : "Sign in"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
