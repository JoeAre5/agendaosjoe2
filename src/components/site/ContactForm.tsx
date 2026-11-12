import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Loader2, Check } from "lucide-react";
const schema = z.object({
  first_name: z.string().min(1, "Requerido").max(100),
  last_name: z.string().min(1, "Requerido").max(100),
  phone: z.string().min(7, "Requerido").max(20),
  email: z.string().email("Email inválido").max(255),
  message: z.string().max(2000).optional(),
  terms: z.literal(true, { errorMap: () => ({ message: "Requerido" }) }),
});

export function ContactForm() {
  const { language } = useTranslation();
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", message: "" });
  const [terms, setTerms] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = schema.safeParse({ ...form, terms });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => { fieldErrors[String(i.path[0])] = i.message; });
      setErrors(fieldErrors);
      return;
    }

    setSending(true);
    try {
      await supabase.functions.invoke("inbox-submit", {
        body: {
          source: "contact",
          language,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          email: form.email,
          message: form.message,
        },
      });
      setSent(true);
    } catch {
      setErrors({ form: language === "es" ? "Error al enviar" : "Submission error" });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div
          >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--accent-color)" }}>
            <div
              >
              <Check className="icon-extrabold" size={28} style={{ color: "var(--cta-fg)" }} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "¡Mensaje enviado!" : "Message sent!"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "Te responderemos pronto." : "We'll get back to you soon."}
        </p>
      </div>
    );
  }

  const inputStyle = {
    background: "var(--bg-surface-2)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <input
            type="text"
            placeholder={language === "es" ? "Nombre *" : "First Name *"}
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle} />
          {errors.first_name && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.first_name}</p>}
        </div>
        <div>
          <input
            type="text"
            placeholder={language === "es" ? "Apellido *" : "Last Name *"}
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle} />
          {errors.last_name && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.last_name}</p>}
        </div>
      </div>
      <div>
        <input
          type="tel"
          placeholder={language === "es" ? "Teléfono *" : "Phone *"}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={inputStyle} />
        {errors.phone && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.phone}</p>}
      </div>
      <div>
        <input
          type="email"
          placeholder={language === "es" ? "Correo electrónico *" : "Email *"}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={inputStyle} />
        {errors.email && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.email}</p>}
      </div>
      <div>
        <textarea
          placeholder={language === "es" ? "¿En qué podemos ayudarte?" : "How can we help you?"}
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={inputStyle} />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          className="mt-1 accent-current"
          style={{ accentColor: "var(--accent-color)" }} />
        <span className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? (
            <>Acepto la <Link to="/privacidad" className="underline" style={{ color: "var(--accent-color)" }}>política de privacidad</Link> y los <Link to="/terminos" className="underline" style={{ color: "var(--accent-color)" }}>términos y condiciones</Link>. Al proporcionar mi número de teléfono, acepto recibir mensajes de texto de la empresa.</>
          ) : (
            <>I accept the <Link to="/privacidad" className="underline" style={{ color: "var(--accent-color)" }}>privacy policy</Link> and <Link to="/terminos" className="underline" style={{ color: "var(--accent-color)" }}>terms and conditions</Link>. By providing my phone number, I agree to receive text messages from the company.</>
          )}
        </span>
      </label>
      {errors.terms && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.terms}</p>}
      {errors.form && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.form}</p>}
      <button
        type="submit"
        disabled={sending}
        className="w-full py-3 rounded-full text-sm font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
        {sending && <Loader2 size={14} className="animate-spin" />}
        {language === "es" ? "Enviar" : "Send"}
      </button>
    </form>
  );
}
