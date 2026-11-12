// FilhoChat — full-page authenticated client chat with Filho.
// - Persists via filho-agent (sends Bearer JWT).
// - Renders saved-card 1-tap confirm card when uiHint.showSavedCardConfirm === true.
// - Charges via client-pay-saved-card edge function.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, Loader2, MapPin, Phone, RefreshCcw, Send, ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { SubpageHeader } from "@/components/SubpageHeader";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";

type Msg = {
  role: "user" | "assistant";
  content: string;
  uiHint?: any;
  feedback?: "up" | "down";
};

type PayState = "idle" | "loading" | "success" | "error";

export default function FilhoChat() {
  const { session } = useAuth();
  const { language } = useTranslation();
  const es = language === "es";
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [dismissedHints, setDismissedHints] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages, payState]);

  // Primary CTA = booking. Other actions stack below.
  const PRIMARY_STARTER = es ? "Reservar nueva cita" : "Book new appointment";
  const SECONDARY_STARTERS = es
    ? ["Mis citas", "Reagendar", "Cancelar cita", "Hablar con barbero"]
    : ["My appointments", "Reschedule", "Cancel appointment", "Talk to barber"];

  const sendFeedback = async (idx: number, value: "up" | "down") => {
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, feedback: value } : m)));
    if (!conversationId) return;
    try {
      await supabase.functions.invoke("filho-agent", {
        body: { action: "feedback", conversation_id: conversationId, feedback: value },
      });
    } catch { /* silent */ }
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("filho-agent", {
        body: {
          message: text,
          conversation_id: conversationId,
          locale: es ? "es" : "en",
        },
      });
      if (error) throw error;
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const reply = (data?.message as string) || (es ? "Algo salió mal." : "Something went wrong.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply, uiHint: data?.uiHint }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: es ? "Error de conexión." : "Connection error." }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (hint: any) => {
    setPayState("loading");
    setPayError(null);
    try {
      const { data, error } = await supabase.functions.invoke("client-pay-saved-card", {
        body: { appointment_id: hint.appointmentId, tip_cents: hint.tipCents || 0 },
      });
      if (error || data?.error) {
        setPayError(data?.error || error?.message || "error");
        setPayState("error");
        return;
      }
      setPayState("success");
      setTimeout(() => navigate("/app/cliente"), 2000);
    } catch (e) {
      setPayError((e as Error).message);
      setPayState("error");
    }
  };

  // Find latest non-dismissed payment hint
  const activePayIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].uiHint?.showSavedCardConfirm && !dismissedHints.has(i)) return i;
    }
    return -1;
  })();
  const activeHint = activePayIdx >= 0 ? messages[activePayIdx].uiHint : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* Header */}
      <SubpageHeader
        title="Filho"
        subtitle={es ? "Tu asistente virtual" : "Your virtual assistant"}
        onBack={() => navigate(-1)}
        sticky
        actions={<AnimatedOrbNavIcon size={26} />}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center pt-12 px-6 space-y-4">
            <p className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
              {es
                ? "¡Hola! Soy Filho. ¿En qué te ayudo hoy?"
                : "Hi! I'm Filho. How can I help today?"}
            </p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto">
              <button
                onClick={() => void send(PRIMARY_STARTER)}
                className="w-full px-4 py-3 rounded-2xl text-[14px] font-semibold active:scale-[0.98] transition"
                style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
              >
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
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <Bubble m={m} />
            {m.uiHint?.showBarberPriceList && Array.isArray(m.uiHint?.services) && m.uiHint.services.length > 0 && (
              <div
                className="rounded-2xl p-3 space-y-1.5"
                style={{
                  background: "var(--bg-surface-2, rgba(0,0,0,0.05))",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                }}
              >
                <div className="text-[12px] font-semibold uppercase tracking-wide opacity-70">
                  {m.uiHint.barberName}
                </div>
                {m.uiHint.services.map((s: any) => (
                  <div key={s.name} className="flex items-baseline justify-between text-[13px]">
                    <span style={{ color: "var(--text-primary)" }}>
                      {s.name}
                      <span className="opacity-60 text-[11px] ml-1.5">{s.duration_minutes} min</span>
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      ${Number(s.price_usd).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(m.uiHint?.chips) && m.uiHint.chips.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-1">
                {m.uiHint.chips.map((c: any, ci: number) => {
                  const label = (es ? c.label_es : c.label_en) || c.label_es || c.label_en || "";
                  const sendText = (es ? c.send_es : c.send_en) || c.send_es || c.send_en || label;
                  if (!label) return null;
                  return (
                    <button
                      key={`${i}-chip-${ci}`}
                      onClick={() => void send(sendText)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium active:scale-95 transition"
                      style={{
                        background: "var(--bg-surface-2, rgba(0,0,0,0.05))",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border, rgba(0,0,0,0.08))",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <HintButtons hint={m.uiHint} es={es} navigate={navigate} />
            {m.role === "assistant" && conversationId && (
              <div className="flex items-center gap-1 pl-1">
                <button
                  onClick={() => void sendFeedback(i, "up")}
                  aria-label={es ? "Útil" : "Helpful"}
                  className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition"
                  style={{ color: m.feedback === "up" ? "#22c55e" : "var(--text-tertiary)", opacity: m.feedback === "up" ? 1 : 0.5 }}
                  disabled={!!m.feedback}
                >
                  <ThumbsUp size={12} />
                </button>
                <button
                  onClick={() => void sendFeedback(i, "down")}
                  aria-label={es ? "No útil" : "Not helpful"}
                  className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition"
                  style={{ color: m.feedback === "down" ? "#ef4444" : "var(--text-tertiary)", opacity: m.feedback === "down" ? 1 : 0.5 }}
                  disabled={!!m.feedback}
                >
                  <ThumbsDown size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            <Loader2 size={14} className="animate-spin" />
            {es ? "Filho está escribiendo…" : "Filho is typing…"}
          </div>
        )}

        {/* Saved-card confirm */}
        {activeHint && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 mt-2"
            style={{
              background: "var(--surface-1, #fff)",
              border: "1px solid var(--divider-color, rgba(0,0,0,0.1))",
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            }}
          >
            {payState === "success" ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <CheckCircle2 size={40} style={{ color: "#22c55e" }} />
                <p className="text-[15px] font-bold">
                  {es ? "✅ Pago confirmado" : "✅ Payment confirmed"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {es ? "Redirigiendo…" : "Redirecting…"}
                </p>
              </div>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>
                  {es ? "Confirmar pago" : "Confirm payment"}
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {es ? "Total" : "Total"}
                  </span>
                  <span className="text-[18px] font-extrabold">
                    ${((activeHint.totalCents || 0) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {es ? "Tarjeta" : "Card"}
                  </span>
                  <span className="text-[13px] font-semibold uppercase">
                    {activeHint.cardBrand || "card"} •••• {activeHint.cardLast4 || "****"}
                  </span>
                </div>
                {payError && (
                  <p className="text-[12px] mb-2" style={{ color: "#ef4444" }}>
                    {payError}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => void handlePay(activeHint)}
                    disabled={payState === "loading"}
                    className="w-full h-11 rounded-full font-semibold text-[14px] active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
                  >
                    {payState === "loading" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {es ? "Procesando…" : "Processing…"}
                      </>
                    ) : (
                      <>{es ? "Pagar" : "Pay"} ${((activeHint.totalCents || 0) / 100).toFixed(2)}</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setDismissedHints((prev) => new Set(prev).add(activePayIdx));
                      setPayState("idle");
                      setPayError(null);
                    }}
                    disabled={payState === "loading"}
                    className="w-full h-11 rounded-full font-semibold text-[13px] active:scale-[0.98] transition"
                    style={{
                      background: "transparent",
                      color: "var(--text-primary)",
                      border: "1px solid var(--divider-color, rgba(0,0,0,0.15))",
                    }}
                  >
                    {es ? "Cancelar" : "Cancel"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div
        className="p-3 divider-hairline"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        }}
      >
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
              background: "var(--bg-surface-2)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              maxHeight: 120,
            }}
            disabled={!session}
          />
          {(() => {
            const canSend = !!input.trim() && !loading && !!session;
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
                }}
              >
                <Send size={16} />
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[80%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap " +
          (isUser
            ? "bg-black text-white dark:bg-[rgba(160,128,96,1)] dark:text-white"
            : "bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white")
        }
      >
        {m.content}
      </div>
    </div>
  );
}

// Renders action buttons for assistant uiHints (booking, reschedule, repeat,
// WhatsApp, directions, call). saved-card confirm is handled separately above.
function HintButtons({
  hint,
  es,
  navigate,
}: {
  hint: any;
  es: boolean;
  navigate: (path: string) => void;
}) {
  if (!hint) return null;
  const buttons: React.ReactNode[] = [];

  if (hint.openBookingFlow) {
    // Client portal Filho must keep clients inside the portal booking flow
    // (PWA five-star experience). Never bounce to the public /citas route.
    const path = hint.barberSlug
      ? `/app/cliente/nueva-cita?barber=${encodeURIComponent(hint.barberSlug)}`
      : "/app/cliente/nueva-cita";
    buttons.push(
      <button
        key="book"
        onClick={() => navigate(path)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
        style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
      >
        <CalendarDays size={14} />
        {hint.label_es && es ? hint.label_es : hint.label_en && !es ? hint.label_en : es ? "Abrir reserva" : "Open booking"}
      </button>
    );
  }
  if (hint.openReschedule && hint.href) {
    buttons.push(
      <button
        key="resch"
        onClick={() => navigate(String(hint.href))}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
        style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
      >
        <RefreshCcw size={14} />
        {es ? hint.label_es || "Reagendar cita" : hint.label_en || "Reschedule"}
        {hint.appointmentLabel && <span className="opacity-80">· {hint.appointmentLabel}</span>}
      </button>
    );
  }
  if (hint.showWhatsAppHandoff && hint.href) {
    buttons.push(
      <a
        key="wa"
        href={String(hint.href)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
        style={{ background: "#25D366", color: "#fff" }}
      >
        <span aria-hidden>💬</span>
        {es ? hint.label_es || "Hablar por WhatsApp" : hint.label_en || "Talk on WhatsApp"}
      </a>
    );
  }
  if (hint.showDirections && hint.href) {
    buttons.push(
      <a
        key="dir"
        href={String(hint.href)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
        style={{ background: "#1A73E8", color: "#fff" }}
      >
        <MapPin size={14} />
        {es ? hint.label_es || "Abrir en Maps" : hint.label_en || "Open in Maps"}
      </a>
    );
  }
  if (hint.showCallButton && hint.href) {
    buttons.push(
      <a
        key="call"
        href={String(hint.href)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold active:scale-[0.98] transition"
        style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
      >
        <Phone size={14} />
        {es ? hint.label_es || "Llamar" : hint.label_en || "Call"}
        {hint.phoneDisplay && <span className="opacity-80">· {hint.phoneDisplay}</span>}
      </a>
    );
  }
  if (buttons.length === 0) return null;
  return <div className="flex flex-wrap gap-2 pl-1">{buttons}</div>;
}
