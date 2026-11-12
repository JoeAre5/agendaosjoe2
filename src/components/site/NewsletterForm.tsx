import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Loader2, Mail, AlertCircle } from "lucide-react";
import { AnimatePresence } from "motion/react";
import NewsletterConfirmationPopup from "./NewsletterConfirmationPopup";

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  terms: z.literal(true, { errorMap: () => ({ message: "Requerido" }) }),
});

export function NewsletterForm() {
  const { language } = useTranslation();
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAlreadySubscribed(false);
    const result = schema.safeParse({ email, terms });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => { fieldErrors[String(i.path[0])] = i.message; });
      setErrors(fieldErrors);
      return;
    }

    setSending(true);
    try {
      // Native edge function:
      //  1) match this email to an existing client (preserving their name + phone), or
      //  2) create a guest subscriber row if no match.
      // Either way, the Suscriptores admin will see all known fields.
      const { data, error } = await supabase.functions.invoke("inbox-submit", {
        body: {
          source: "newsletter",
          language,
          email,
        },
      });
      // Treat as success only if the subscriber was actually persisted.
      const subscriberOk = (data as { subscriber?: { ok?: boolean } } | null)?.subscriber?.ok === true;
      const subscriberMode = (data as { subscriber?: { mode?: string } } | null)?.subscriber?.mode;
      if (error || !subscriberOk) {
        setErrors({ form: language === "es" ? "Error al enviar" : "Submission error" });
      } else if (subscriberMode === "already_subscribed") {
        setAlreadySubscribed(true);
      } else {
        setSent(true);
      }
    } catch {
      setErrors({ form: language === "es" ? "Error al enviar" : "Submission error" });
    } finally {
      setSending(false);
    }
  };

  const popup = (
    <AnimatePresence>
      {sent && (
        <NewsletterConfirmationPopup
          isEs={language === "es"}
          email={email}
          onClose={() => {
            setSent(false);
            setEmail("");
            setTerms(false);
          }}
        />
      )}
    </AnimatePresence>
  );

  return (
    <>
    {popup}
    <form onSubmit={handleSubmit} className="space-y-3">
      <div
        className="flex items-center gap-2 px-4 rounded-full"
        style={{
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Mail size={16} style={{ color: "var(--text-tertiary)" }} />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={language === "es" ? "tu@email.com" : "you@email.com"}
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (alreadySubscribed) setAlreadySubscribed(false); }}
          className="flex-1 min-w-0 bg-transparent py-3 outline-none"
          style={{
            color: "var(--text-primary)",
            // Shrink as the email grows so the full address stays visible.
            // 14px up to ~22 chars, then linearly down to 11px around 38+ chars.
            fontSize: `${Math.max(11, Math.min(14, 14 - Math.max(0, email.length - 22) * 0.2))}px`,
            textOverflow: "ellipsis",
          }}
        />
        <button
          type="submit"
          disabled={sending}
          className="my-1 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2 active:scale-95 transition-transform"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
        >
          {sending && <Loader2 size={12} className="animate-spin" />}
          {language === "es" ? "Suscribir" : "Subscribe"}
        </button>
      </div>
      {errors.email && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.email}</p>}

      {alreadySubscribed && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
          }}
        >
          <AlertCircle size={14} style={{ color: "#ef4444", marginTop: 1, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>
              {language === "es" ? "Ya estás suscrito" : "You're already subscribed"}
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {language === "es"
                ? "Este email ya está en nuestra lista. ¡Gracias por tu interés!"
                : "This email is already on our list. Thanks for your interest!"}
            </p>
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          className="mt-1"
          style={{ accentColor: "var(--accent-color)" }}
        />
        <span className="text-[10px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {language === "es"
            ? "Acepto recibir el newsletter y comunicaciones ocasionales por email."
            : "I agree to receive the newsletter and occasional email communications."}
        </span>
      </label>
      {errors.terms && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.terms}</p>}
      {errors.form && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.form}</p>}

      <p className="text-center text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        <Link to="/privacidad" className="underline" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Privacidad" : "Privacy"}
        </Link>{" "}
        |{" "}
        <Link to="/terminos" className="underline" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Términos" : "Terms"}
        </Link>
      </p>
    </form>
    </>
  );
}
