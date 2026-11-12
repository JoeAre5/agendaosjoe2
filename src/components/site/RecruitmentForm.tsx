import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Loader2, Check } from "lucide-react";
const schema = z.object({
  contact_name: z.string().min(1, "Requerido").max(120),
  email: z.string().email("Email inválido").max(255),
  phone: z.string().min(7, "Requerido").max(20),
  workplace: z.string().max(200).optional(),
  social: z.string().max(200).optional(),
  experience: z.string().max(200).optional(),
  passion: z.string().min(1, "Requerido").max(2000),
  message: z.string().max(2000).optional(),
});

const EXPERIENCE_OPTIONS = [
  { value: "Menos de un año", es: "Menos de un año", en: "Less than a year" },
  { value: "+1 año", es: "+1 año", en: "+1 year" },
  { value: "+5 años", es: "+5 años", en: "+5 years" },
];

export function RecruitmentForm() {
  const { language } = useTranslation();
  const [form, setForm] = useState({
    contact_name: "",
    email: "",
    phone: "",
    workplace: "",
    social: "",
    experience: "",
    passion: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = schema.safeParse(form);
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
          source: "recruitment",
          language,
          contact_name: form.contact_name,
          email: form.email,
          phone: form.phone,
          workplace: form.workplace,
          social: form.social,
          experience: form.experience,
          passion: form.passion,
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
          {language === "es" ? "¡Solicitud enviada!" : "Application sent!"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "Nos comunicaremos contigo pronto." : "We'll be in touch soon."}
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
      <div>
        <input
          type="text"
          placeholder={language === "es" ? "Nombre completo *" : "Full name *"}
          value={form.contact_name}
          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={inputStyle} />
        {errors.contact_name && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.contact_name}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <input
            type="tel"
            placeholder={language === "es" ? "Teléfono *" : "Phone *"}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle} />
          {errors.phone && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.phone}</p>}
        </div>
      </div>
      <div>
        <input
          type="text"
          placeholder={language === "es" ? "Lugar de trabajo actual" : "Current workplace"}
          value={form.workplace}
          onChange={(e) => setForm({ ...form, workplace: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={inputStyle} />
      </div>
      <div>
        <input
          type="text"
          placeholder={language === "es" ? "Usuario en redes sociales" : "Social media username"}
          value={form.social}
          onChange={(e) => setForm({ ...form, social: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={inputStyle} />
      </div>
      <div>
        <select
          value={form.experience}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none appearance-none"
          style={inputStyle}>
          <option value="">
            {language === "es" ? "¿Cuánta experiencia tienes? (opcional)" : "How much experience do you have? (optional)"}
          </option>
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {language === "es" ? o.es : o.en}
            </option>
          ))}
        </select>
      </div>
      <div>
        <textarea
          placeholder={language === "es" ? "¿Qué es lo más que te gusta de ser barbero? *" : "What do you love most about being a barber? *"}
          rows={3}
          value={form.passion}
          onChange={(e) => setForm({ ...form, passion: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={inputStyle} />
        {errors.passion && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.passion}</p>}
      </div>
      <div>
        <textarea
          placeholder={language === "es" ? "Escríbenos algo más (opcional)" : "Tell us more (optional)"}
          rows={3}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={inputStyle} />
      </div>
      <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        {language === "es" ? (
          <>Al enviar este formulario, aceptas nuestra <Link to="/privacidad" className="underline" style={{ color: "var(--accent-color)" }}>política de privacidad</Link>.</>
        ) : (
          <>By submitting this form, you accept our <Link to="/privacidad" className="underline" style={{ color: "var(--accent-color)" }}>privacy policy</Link>.</>
        )}
      </p>
      {errors.form && <p className="text-xs" style={{ color: "#ef4444" }}>{errors.form}</p>}
      <button
        type="submit"
        disabled={sending}
        className="w-full py-3 rounded-full text-sm font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
        {sending && <Loader2 size={14} className="animate-spin" />}
        {language === "es" ? "Enviar" : "Submit"}
      </button>
    </form>
  );
}
