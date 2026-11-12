import { useState, useEffect, FormEvent, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import LanguageToggle from "@/components/LanguageToggle";
import { checkRateLimit, recordAttempt, formatRemainingTime } from "@/lib/rateLimiter";

const AUTH_LIMITS = { login: 10, signup: 5, reset: 3 };

export default function ClientLogin() {
  const { signIn, role, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const didLogin = useRef(false);
  const { t, language } = useTranslation();
  const { resolvedTheme } = usePreferences();
  const [sessionCleared, setSessionCleared] = useState(false);

  const initialEmail = searchParams.get("email") || "";

  const [step, setStep] = useState<1 | 2>(initialEmail ? 2 : 1);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  

  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const isOAuthCallback = searchParams.has("code") || window.location.hash.includes("access_token");
    if (isOAuthCallback) {
      setSessionCleared(true);
      return;
    }
    // SAFARI BFCACHE FIX: Do NOT sign out an existing session on mount.
    // Previously this page always called signOut() to prevent stale role
    // bleed. Problem: if RoleGuard transiently redirects an authenticated
    // client here (e.g. role auto-provision had a network blip on Safari
    // bfcache restore), the unconditional signOut would log them out.
    // We only need to clear the *local* session if a stale one exists AND
    // no auth event is going to redirect away. The role-redirect effect
    // below handles the happy path; just mark cleared so it can run.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await supabase.auth.signOut().catch(() => {});
      }
      setSessionCleared(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Role-based redirect — fires whenever we have a valid session+role.
  // This handles BOTH cases:
  //  1) User just submitted login form (didLogin.current = true)
  //  2) PWA cold-start / app resume with persisted session — user lands on
  //     /login but is already authenticated. Without this they'd be stuck
  //     staring at the login form even though signed in.
  useEffect(() => {
    if (!authLoading && session && sessionCleared && role) {
      if (role === "owner" || role === "barber") {
        navigate(redirectTo || "/admin", { replace: true });
      } else if (role === "client") {
        navigate(redirectTo || "/app/cliente", { replace: true });
      }
    }
  }, [authLoading, session, role, navigate, sessionCleared, redirectTo]);

  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setStep(2);
  };

  const enforceLimit = (action: keyof typeof AUTH_LIMITS): boolean => {
    const limit = AUTH_LIMITS[action];
    const { allowed, remainingMs } = checkRateLimit(`auth_${action}`, limit);
    if (!allowed) {
      const wait = formatRemainingTime(remainingMs, language);
      setError(
        language === "es"
          ? `Demasiados intentos. Intenta de nuevo en ${wait}.`
          : `Too many attempts. Try again in ${wait}.`
      );
      return false;
    }
    return true;
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(language === "es" ? "La contraseña debe tener al menos 8 caracteres" : "Password must be at least 8 characters");
      return;
    }

    if (!enforceLimit("login")) return;
    setSubmitting(true);
    recordAttempt("auth_login");

    const { error: signInError } = await signIn(email.trim(), password);
    if (!signInError) {
      didLogin.current = true;
      setSubmitting(false);
      return;
    }

    const msg = String(signInError).toLowerCase();
    if (msg.includes("invalid") || msg.includes("credentials")) {
      setError(
        language === "es"
          ? "Contraseña incorrecta. Intenta de nuevo o usa '¿Olvidaste tu contraseña?'."
          : "Incorrect password. Try again or use 'Forgot your password?'."
      );
    } else {
      setError(String(signInError));
    }
    setSubmitting(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) return;
    if (!enforceLimit("reset")) return;
    recordAttempt("auth_reset");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (!error) {
      toast.success(
        language === "es"
          ? "Revisa tu email para restablecer tu contraseña."
          : "Check your email to reset your password."
      );
    }
  };

  const bg = isDark ? "#080808" : "#FFFFFF";
  const fg = isDark ? "#E8E2DA" : "#111111";
  const inputBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.12)";
  const ctaBg = isDark ? "#ceb79e" : "#111111";
  const ctaFg = isDark ? "#080808" : "#FFFFFF";
  const mutedFg = isDark ? "rgba(232,226,218,0.45)" : "rgba(17,17,17,0.45)";
  const accentColor = "#ceb79e";
  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  if (!sessionCleared) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: bg }}>
        <Loader2 size={32} className="animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }


  const resetToStep1 = () => {
    setStep(1);
    setError(null);
    setPassword("");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center mx-auto w-full px-6"
      style={{ maxWidth: 430, background: bg, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-1px", color: fg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            CHARLIE'S
          </span>
          <span style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-1px", color: mutedFg, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
            BARBERSHOP
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: accentColor, textTransform: "uppercase", marginTop: 6, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
          {language === "es" ? "Inicia sesión para continuar" : "Sign in to continue"}
        </span>
      </div>

      <div className="w-full" style={{ maxWidth: 360 }}>
        {step === 1 ? (
          <>
            <h2 className="text-sm font-semibold text-center mb-5" style={{ color: fg }}>
              {language === "es" ? "Iniciar Sesión" : "Sign In"}
            </h2>

            <form onSubmit={handleContinue} className="flex flex-col gap-3.5">
              <input type="email" required autoComplete="email" placeholder={t("auth.email")}
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="login-input w-full px-5 py-3.5 text-sm outline-none"
                style={{ background: "transparent", color: fg, border: `1px solid ${inputBorder}`, borderRadius: "var(--radius-input)" }} />

              {error && <p className="text-xs text-center py-1" style={{ color: isDark ? "#f87171" : "#b91c1c" }}>{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full py-3.5 text-sm font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: ctaBg, color: ctaFg, borderRadius: "var(--radius-control)" }}>
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {language === "es" ? "Continuar" : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Step 2 — Email Password / Sign up */}
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={resetToStep1} style={{ color: mutedFg }}>
                <ArrowLeft size={18} />
              </button>
              <span className="text-sm" style={{ color: mutedFg }}>{email}</span>
            </div>

            <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required
                  autoComplete="current-password" autoFocus
                  placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="login-input w-full px-5 py-3.5 pr-12 text-sm outline-none"
                  style={{ background: "transparent", color: fg, border: `1px solid ${inputBorder}`, borderRadius: "var(--radius-input)" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: mutedFg }} tabIndex={-1}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && <p className="text-xs text-center py-1" style={{ color: isDark ? "#f87171" : "#b91c1c" }}>{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full py-3.5 text-sm font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: ctaBg, color: ctaFg, borderRadius: "var(--radius-control)" }}>
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {language === "es" ? "Iniciar Sesión" : "Sign In"}
              </button>
            </form>

            <div className="flex flex-col items-center gap-2 mt-4">
              <button type="button" onClick={handleForgotPassword} className="text-xs font-medium py-1" style={{ color: mutedFg }}>
                {language === "es" ? "¿Olvidaste tu contraseña?" : "Forgot your password?"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-12 flex justify-center"><LanguageToggle /></div>
    </div>
  );
}
