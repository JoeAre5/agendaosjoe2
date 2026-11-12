// /citas/acceso — post-booking landing for first-time public clients.
//
// Entry points:
//   1. "Ver citas" CTA on the /citas/confirmando popup (committed state)
//   2. Tapping outside that same popup
//
// UX (per reference Maneja_tus_citas.png):
//   - Single unified flow (no login/signup toggle)
//   - Email + password + confirm password always shown
//   - One "Continuar" CTA: tries sign-in first; if credentials invalid AND
//     passwords match (≥8 chars), creates the account.
//   - Either path ends in the client portal.
//
// Public route, no auth guard. After successful auth, navigate to /app/cliente;
// onboarding auto-triggers from ClientPortalV2 when onboarding_completed=false.
import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Eye, EyeOff, ArrowLeft, MoreHorizontal, Share, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import { isIOS, isStandalone } from "@/lib/push";
import { tapFeedback } from "@/lib/feedback";
import LanguageToggle from "@/components/LanguageToggle";
import { checkRateLimit, recordAttempt, formatRemainingTime } from "@/lib/rateLimiter";
import { validatePassword, explainAuthError } from "@/lib/passwordValidator";

const PWA_TITLE = "Barbershop";
const ACCENT = "#ceb79e";

export default function PostBookingLogin() {
  const { signIn, session, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useTranslation();
  const { resolvedTheme } = usePreferences();
  const isEs = language === "es";
  const isDark = resolvedTheme === "dark";

  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ios = useMemo(() => isIOS(), []);
  const standalone = useMemo(() => isStandalone(), []);
  const didLogin = useRef(false);

  // Set document title so iOS "Add to Home Screen" suggests "Barbershop".
  useEffect(() => {
    const prev = document.title;
    document.title = PWA_TITLE;
    let metaTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const created = !metaTitle;
    if (!metaTitle) {
      metaTitle = document.createElement("meta");
      metaTitle.name = "apple-mobile-web-app-title";
      document.head.appendChild(metaTitle);
    }
    const prevContent = metaTitle.content;
    metaTitle.content = PWA_TITLE;
    return () => {
      document.title = prev;
      if (created) metaTitle?.remove();
      else if (metaTitle) metaTitle.content = prevContent;
    };
  }, []);

  // If already authenticated → forward to portal (onboarding triggers there).
  useEffect(() => {
    if (authLoading) return;
    if (!session || !role) return;
    if (role === "client") navigate("/app/cliente", { replace: true });
    else if (role === "owner" || role === "barber") navigate("/admin", { replace: true });
  }, [authLoading, session, role, navigate]);

  const enforce = (key: "login" | "signup") => {
    const { allowed, remainingMs } = checkRateLimit(`auth_${key}`, 10);
    if (!allowed) {
      setError(
        isEs
          ? `Demasiados intentos. Intenta de nuevo en ${formatRemainingTime(remainingMs, "es")}.`
          : `Too many attempts. Try again in ${formatRemainingTime(remainingMs, "en")}.`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    tapFeedback();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(isEs ? "Completa todos los campos" : "Please fill in all fields");
      return;
    }
    if (!enforce("login")) return;
    setSubmitting(true);
    recordAttempt("auth_login");

    // 1) Try sign-in first — covers existing clients who booked with this email.
    const { error: signInError } = await signIn(trimmedEmail, password);
    if (!signInError) {
      didLogin.current = true;
      setSubmitting(false);
      return;
    }

    // Sign-in only: new clients create their profile via /bienvenido (name + phone required).
    setError(isEs
      ? "Correo o contraseña incorrectos. Si eres nuevo, toca Crear perfil."
      : "Wrong email or password. New here? Tap Create profile.");
    setSubmitting(false);
  };

  // ───── Tokens (match ClientLogin) ─────
  const bg = isDark ? "#080808" : "#FFFFFF";
  const fg = isDark ? "#E8E2DA" : "#111111";
  const mutedFg = isDark ? "rgba(232,226,218,0.45)" : "rgba(17,17,17,0.45)";
  const inputBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.12)";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const ctaBg = isDark ? ACCENT : "#111111";
  const ctaFg = isDark ? "#080808" : "#FFFFFF";
  const microColor = isDark ? "rgba(232,226,218,0.85)" : "#111111";

  const cardStepsStyle: React.CSSProperties = isDark
    ? { background: "rgba(206,183,158,0.08)", border: `1px solid ${ACCENT}`, color: fg }
    : { background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.12)", color: "#111111" };

  const stepsCopy = isEs
    ? [
        "Busca tu botón de Compartir.",
        "Selecciona “Añadir a inicio”.",
        "Confirma el nombre como “Barbershop”.",
        "Listo. Abre la app desde tu pantalla de inicio.",
      ]
    : [
        "Find your Share button.",
        "Select “Add to Home Screen”.",
        "Confirm the name as “Barbershop”.",
        "Done. Open the app from your home screen.",
      ];

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: bg,
        color: fg,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
          aria-label={isEs ? "Atrás" : "Back"}
        >
          <ArrowLeft size={18} />
          <span>{isEs ? "Atrás" : "Back"}</span>
        </button>
        <LanguageToggle />
      </div>

      <div className="flex-1 w-full max-w-[430px] mx-auto px-6 pt-20 pb-32 flex flex-col">
        {/* ─── HEADER ─── */}
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="self-center text-[10px] font-light tracking-[0.28em] uppercase"
          style={{ color: microColor, fontFamily: "'Montserrat', system-ui, sans-serif" }}
        >
          {isEs ? "Maneja tus citas" : "Manage your bookings"}
        </motion.span>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-baseline justify-center gap-2 mt-3"
        >
          <span
            style={{
              fontFamily: "'Montserrat', system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-1.2px",
              color: fg,
            }}
          >
            CHARLIE'S
          </span>
          <span
            style={{
              fontFamily: "'Montserrat', system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 300,
              letterSpacing: "-1.2px",
              color: mutedFg,
            }}
          >
            BARBERSHOP
          </span>
        </motion.div>

        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="self-center mt-3 text-[11px] font-semibold tracking-[0.22em] uppercase"
          style={{ color: ACCENT, fontFamily: "'Montserrat', system-ui, sans-serif" }}
        >
          {isEs ? "Inicia sesión para continuar" : "Sign in to continue"}
        </motion.span>

        {/* ─── UNIFIED FORM ─── */}
        <form
          onSubmit={handleSubmit}
          className="mt-7 flex flex-col gap-3.5"
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={isEs ? "Correo" : "Email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-3.5 text-sm outline-none"
            style={{
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: "var(--radius-input)",
              color: fg,
            }}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder={isEs ? "Contraseña" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3.5 pr-12 text-sm outline-none"
              style={{
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                borderRadius: "var(--radius-input)",
                color: fg,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: mutedFg }}
              aria-label={showPassword ? "Hide" : "Show"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-center py-1" style={{ color: isDark ? "#f87171" : "#b91c1c" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 text-sm font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: ctaBg, color: ctaFg, borderRadius: "var(--radius-control)" }}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {isEs ? "Iniciar sesión" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) {
                setError(isEs ? "Escribe tu correo primero" : "Enter your email first");
                return;
              }
              const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (!error) {
                setError(isEs ? "Te enviamos un enlace para reiniciar tu contraseña." : "We sent you a reset link.");
              }
            }}
            className="text-[12px] font-semibold mt-1 self-center"
            style={{ color: ACCENT }}
          >
            {isEs ? "Olvidé mi contraseña" : "Forgot password"}
          </button>

          <button
            type="button"
            onClick={() => navigate(`/bienvenido?signup=1${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ""}`)}
            className="w-full py-3.5 text-sm font-bold mt-2"
            style={{ border: `1px solid ${inputBorder}`, color: fg, borderRadius: "var(--radius-control)" }}
          >
            {isEs ? "Crear perfil" : "Create profile"}
          </button>
        </form>

        {/* ─── INSTALL CARD ─── */}
        {!standalone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 rounded-2xl p-5"
            style={cardStepsStyle}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] block mb-2" style={{ color: fg, opacity: 0.85 }}>
              {isEs ? "Instala la app" : "Install the app"}
            </span>
            <h2 className="font-bold text-[16px] leading-tight mb-4 whitespace-nowrap" style={{ color: fg }}>
              {isEs ? "Añade nuestra app a tu inicio" : "Add our app to your home screen"}
            </h2>

            {/* Three possible Share/Menu buttons across iOS/Android */}
            <div className="flex items-center justify-center gap-5 mb-5">
              {[MoreHorizontal, Share, Share2].map((Icon, i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.06)" : "#F1EFEC",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"}`,
                    boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                  aria-hidden="true"
                >
                  <Icon size={20} strokeWidth={1.75} style={{ color: fg, opacity: 0.85 }} />
                </div>
              ))}
            </div>

            <ol className="flex flex-col gap-3.5">
              {stepsCopy.map((text, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: isDark ? ACCENT : "#000000",
                      color: isDark ? "#000000" : "#ffffff",
                    }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-[13px] leading-snug flex-1" style={{ color: fg }}>{text}</p>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </div>
    </div>
  );
}
