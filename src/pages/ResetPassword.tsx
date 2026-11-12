import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import LanguageToggle from "@/components/LanguageToggle";

type Phase = "checking" | "invalid" | "form" | "success";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const [phase, setPhase] = useState<Phase>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase recovery links can arrive in three shapes:
  //  1. Implicit flow:  #access_token=...&type=recovery
  //  2. PKCE flow:      ?code=<one-time-code>           → exchangeCodeForSession
  //  3. Failure:        ?error=...&error_code=otp_expired&error_description=...
  //                     or the same in the URL hash.
  // The PASSWORD_RECOVERY auth event fires once the SDK finishes processing the
  // hash so we listen for it as a safety net.
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setPhase("form");
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));

        // 1) Surface explicit errors first (expired/used links).
        const errCode = url.searchParams.get("error_code") || hash.get("error_code");
        const errDesc = url.searchParams.get("error_description") || hash.get("error_description");
        if (errCode || errDesc) {
          setLinkError(decodeURIComponent(errDesc || errCode || ""));
          setPhase("invalid");
          return;
        }

        // 2) PKCE flow: trade ?code=... for a session.
        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) {
            setLinkError(exchErr.message);
            setPhase("invalid");
            return;
          }
          // Clean the URL so a refresh doesn't try to reuse the code.
          window.history.replaceState({}, "", "/reset-password");
          if (!cancelled) setPhase("form");
          return;
        }

        // 3) Implicit flow: hash carries the recovery tokens.
        if (hash.get("type") === "recovery" || hash.get("access_token")) {
          // The SDK auto-processes the hash; PASSWORD_RECOVERY listener will fire.
          // Give it a short grace period before declaring the link invalid.
          await new Promise((r) => setTimeout(r, 250));
          const { data } = await supabase.auth.getSession();
          if (!cancelled) setPhase(data.session ? "form" : "invalid");
          return;
        }

        // 4) Already authenticated (e.g. user reopened the tab) → allow change.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setPhase(data.session ? "form" : "invalid");
      } catch (err) {
        if (!cancelled) {
          setLinkError(err instanceof Error ? err.message : String(err));
          setPhase("invalid");
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(language === "es" ? "Mínimo 8 caracteres." : "Minimum 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError(language === "es" ? "Las contraseñas no coinciden." : "Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPhase("success");
    toast.success(language === "es" ? "Contraseña actualizada" : "Password updated");
    setTimeout(() => navigate("/app/cliente", { replace: true }), 1400);
  };

  // Theme tokens (mirror ClientLogin)
  const bg = isDark ? "#000000" : "#F5F1EB";
  const fg = isDark ? "#E8E2DA" : "#111111";
  const inputBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.12)";
  const ctaBg = isDark ? "#ceb79e" : "#111111";
  const ctaFg = isDark ? "#080808" : "#FFFFFF";
  const mutedFg = isDark ? "rgba(232,226,218,0.45)" : "rgba(17,17,17,0.45)";
  const accentColor = "#ceb79e";
  const errorColor = isDark ? "#f87171" : "#b91c1c";
  const successColor = isDark ? "#86efac" : "#15803d";

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: bg }}>
        <Loader2 size={32} className="animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center mx-auto w-full px-6"
      style={{ maxWidth: 430, background: bg, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
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
          {language === "es" ? "Restablecer contraseña" : "Reset password"}
        </span>
      </div>

      <div className="w-full" style={{ maxWidth: 360 }}>
        {phase === "invalid" && (
          <div className="text-center flex flex-col items-center gap-4">
            <AlertCircle size={36} style={{ color: errorColor }} />
            <p className="text-sm" style={{ color: fg }}>
              {language === "es"
                ? "Este enlace de recuperación no es válido o expiró."
                : "This recovery link is invalid or has expired."}
            </p>
            {linkError && (
              <p className="text-xs" style={{ color: mutedFg }}>{linkError}</p>
            )}
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full py-3.5 text-sm font-bold"
              style={{ background: ctaBg, color: ctaFg, borderRadius: "var(--radius-control)" }}
            >
              {language === "es" ? "Volver a iniciar sesión" : "Back to sign in"}
            </button>
          </div>
        )}

        {phase === "success" && (
          <div className="text-center flex flex-col items-center gap-4">
            <CheckCircle2 size={40} style={{ color: successColor }} />
            <p className="text-sm font-semibold" style={{ color: fg }}>
              {language === "es" ? "Contraseña actualizada" : "Password updated"}
            </p>
            <p className="text-xs" style={{ color: mutedFg }}>
              {language === "es" ? "Redirigiendo a tu cuenta…" : "Redirecting to your account…"}
            </p>
          </div>
        )}

        {phase === "form" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <h2 className="text-sm font-semibold text-center mb-2" style={{ color: fg }}>
              {language === "es" ? "Crea una nueva contraseña" : "Create a new password"}
            </h2>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                autoFocus
                placeholder={language === "es" ? "Nueva contraseña" : "New password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input w-full px-5 py-3.5 pr-12 text-sm outline-none"
                style={{ background: "transparent", color: fg, border: `1px solid ${inputBorder}`, borderRadius: "var(--radius-input)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color: mutedFg }}
                tabIndex={-1}
                aria-label={showPassword ? (language === "es" ? "Ocultar contraseña" : "Hide password") : (language === "es" ? "Mostrar contraseña" : "Show password")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder={language === "es" ? "Confirmar contraseña" : "Confirm password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-input w-full px-5 py-3.5 text-sm outline-none"
              style={{ background: "transparent", color: fg, border: `1px solid ${inputBorder}`, borderRadius: "var(--radius-input)" }}
            />

            <p className="text-[11px] text-center" style={{ color: mutedFg }}>
              {language === "es" ? "Mínimo 8 caracteres." : "Minimum 8 characters."}
            </p>

            {error && (
              <p className="text-xs text-center py-1" style={{ color: errorColor }}>
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
              {language === "es" ? "Actualizar contraseña" : "Update password"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-12 flex justify-center"><LanguageToggle /></div>
    </div>
  );
}
