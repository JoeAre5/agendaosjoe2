/**
 * /bienvenido — Referred-client onboarding (PWA-first).
 *
 * Flow (one page, step machine):
 *   0  splash       — Charlie's wordmark while we look up the referrer
 *   1  welcome      — "Fuiste referido por <Nombre>" + CTA
 *   2  install      — Install instructions (hard block until standalone)
 *   3  account      — Full name + phone + email + password (single step,
 *                     becomes the first step of onboarding for referrals)
 *
 * After account creation: navigate to /app/cliente — the existing
 * ClientOnboarding component takes over from there because the new client
 * row has onboarding_completed = false. We DO NOT duplicate barber/DOB/
 * payment/push steps here.
 *
 * State persists in localStorage so when the user installs the PWA and
 * relaunches from the home icon, they resume at the step they were on
 * with the referral code intact.
 */
import { Helmet } from "react-helmet-async";
import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Check, MoreHorizontal, Plus, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { isIOS, isStandalone } from "@/lib/push";
import { normalizePhone10, formatPhoneDisplay } from "@/lib/phone";
import { validatePassword, explainAuthError } from "@/lib/passwordValidator";
import PasswordStrengthMeter, { isPasswordStrong } from "@/components/ui/PasswordStrengthMeter";
import { captureRefFromUrl, getStoredRef, recordReferralConversion } from "@/lib/referral";
import LanguageToggle from "@/components/LanguageToggle";
import { SplashScreen } from "@/components/SplashScreen";
import { useTranslation } from "@/hooks/useTranslation";

/* ──────────────────────────── Copy ──────────────────────────── */

const COPY = {
  es: {
    title: "Bienvenido · Charlie's Barbershop",
    brand: "CHARLIE'S BARBERSHOP",
    referredBy: "Fuiste referido por",
    welcomeCta: "Empezar",
    // Install
    installEyebrow: "Instalación",
    installTitle: "Instala Charlie's en tu pantalla",
    installSubIos: "Antes de crear tu cuenta, guarda la app en tu iPhone. Sigue estos pasos en Safari.",
    installSubAndroid: "Antes de crear tu cuenta, guarda la app en tu teléfono. Sigue estos pasos en Chrome.",
    iosSteps: [
      { Icon: Share, text: "Tap el botón Compartir abajo en Safari" },
      { Icon: Plus, text: "Elige “Agregar a pantalla principal”" },
      { Icon: Check, text: "Confirma con “Agregar”" },
      { Icon: Smartphone, text: "Abre Charlie's desde el ícono nuevo" },
    ],
    androidSteps: [
      { Icon: MoreHorizontal, text: "Tap los tres puntos arriba en Chrome" },
      { Icon: Plus, text: "Elige “Añadir a pantalla principal”" },
      { Icon: Check, text: "Confirma con “Añadir”" },
      { Icon: Smartphone, text: "Abre Charlie's desde el ícono nuevo" },
    ],
    installConfirmBtn: "Ya la instalé",
    installNotYet: "Aún no detectamos la app instalada. Asegúrate de abrirla desde el ícono en tu pantalla principal.",
    // Account (Paso 1 de 5 — los pasos 2-5 viven en ClientOnboarding)
    accountEyebrow: "Paso 1 de 5",
    accountTitle: "Crea tu perfil",
    accountSub: "Solo unos datos para empezar a acumular beneficios.",
    firstNameLabel: "Nombre",
    lastNameLabel: "Apellido",
    firstNamePh: "Charlie",
    lastNamePh: "Corchado",
    phoneLabel: "Teléfono",
    emailLabel: "Email",
    phonePh: "787-555-1234",
    emailPh: "tu@email.com",
    pwLabel: "Contraseña",
    pwShow: "Mostrar",
    pwHide: "Ocultar",
    btnContinue: "Crear perfil",
    btnCreating: "Creando tu cuenta…",
    errName: "Ingresa tu nombre.",
    errPhone: "Ingresa un teléfono de 10 dígitos.",
    errEmail: "Ingresa un email válido.",
    errPwWeak: "Tu contraseña aún no cumple todos los criterios.",
    errAlreadyExists: "Ya existe una cuenta con ese email o teléfono. Inicia sesión.",
    errHasAccount: "Ya tienes una cuenta con ese email. Inicia sesión.",
    errIdentity: "Ese email ya está en nuestro sistema con otro teléfono. Usa el teléfono que diste en la barbería o escríbenos por WhatsApp.",
    errUnexpected: "Error inesperado. Intenta de nuevo.",
    signInLink: "Ya tengo cuenta",
  },
  en: {
    title: "Welcome · Charlie's Barbershop",
    brand: "CHARLIE'S BARBERSHOP",
    referredBy: "You were referred by",
    welcomeCta: "Get started",
    installEyebrow: "Installation",
    installTitle: "Install Charlie's on your phone",
    installSubIos: "Before creating your account, save the app to your iPhone. Follow these steps in Safari.",
    installSubAndroid: "Before creating your account, save the app to your phone. Follow these steps in Chrome.",
    iosSteps: [
      { Icon: Share, text: "Tap the Share button at the bottom of Safari" },
      { Icon: Plus, text: "Pick \u201cAdd to Home Screen\u201d" },
      { Icon: Check, text: "Confirm with \u201cAdd\u201d" },
      { Icon: Smartphone, text: "Open Charlie's from the new icon" },
    ],
    androidSteps: [
      { Icon: MoreHorizontal, text: "Tap the three dots at the top in Chrome" },
      { Icon: Plus, text: "Pick \u201cAdd to Home Screen\u201d" },
      { Icon: Check, text: "Confirm with \u201cAdd\u201d" },
      { Icon: Smartphone, text: "Open Charlie's from the new icon" },
    ],
    installConfirmBtn: "I installed it",
    installNotYet: "We don't see the installed app yet. Make sure to open it from the icon on your home screen.",
    accountEyebrow: "Step 1 of 5",
    accountTitle: "Create your profile",
    accountSub: "Just a few details to start earning rewards.",
    firstNameLabel: "First name",
    lastNameLabel: "Last name",
    firstNamePh: "Charlie",
    lastNamePh: "Corchado",
    phoneLabel: "Phone",
    emailLabel: "Email",
    phonePh: "787-555-1234",
    emailPh: "you@email.com",
    pwLabel: "Password",
    pwShow: "Show",
    pwHide: "Hide",
    btnContinue: "Create profile",
    btnCreating: "Creating your account…",
    errName: "Enter your name.",
    errPhone: "Enter a 10-digit phone number.",
    errEmail: "Enter a valid email.",
    errPwWeak: "Your password doesn't meet all the criteria yet.",
    errAlreadyExists: "An account with that email or phone already exists. Sign in.",
    errHasAccount: "You already have an account with that email. Sign in.",
    errIdentity: "That email is on file with a different phone. Use the phone you gave the shop, or message us on WhatsApp.",
    errUnexpected: "Unexpected error. Try again.",
    signInLink: "I already have an account",
  },
};

type Step = "splash" | "welcome" | "install" | "account";

const STATE_KEY = "welcome:state:v2";

interface PersistedState {
  step: Step;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  refCode: string;
}

function loadPersisted(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function savePersisted(s: Partial<PersistedState>) {
  try {
    const prev = loadPersisted();
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...prev, ...s }));
  } catch {}
}
function clearPersisted() {
  try { localStorage.removeItem(STATE_KEY); } catch {}
}

/* ──────────────────────────── Page ──────────────────────────── */

export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { language } = useTranslation();
  const t = COPY[language === "en" ? "en" : "es"];

  // Capture ?ref= immediately into cookie+localStorage and our local state.
  useEffect(() => { captureRefFromUrl(); }, []);

  const urlRef = (params.get("ref") || "").toLowerCase().trim();
  const persisted = useMemo(() => loadPersisted(), []);
  const refCode = (urlRef || getStoredRef()?.code || persisted.refCode || "").toLowerCase().trim();

  const [step, setStep] = useState<Step>(() => {
    if (params.get("signup") === "1") return "account";
    if (urlRef && params.get("resume") !== "1" && !isStandalone()) return "splash";
    return (persisted.step as Step) || "splash";
  });
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(persisted.firstName || "");
  const [lastName, setLastName] = useState(persisted.lastName || "");
  const [phone, setPhone] = useState(persisted.phone || "");
  const [email, setEmail] = useState(persisted.email || params.get("email") || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwStrong, setPwStrong] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gate render until we know whether a session exists. Prevents the
  // "welcome flashes for a split second before redirecting to /admin"
  // when the PWA (start_url=/bienvenido) is relaunched by a signed-in user.
  const [authChecked, setAuthChecked] = useState(false);

  // Persist progress
  useEffect(() => {
    savePersisted({ step, firstName, lastName, phone, email, refCode });
  }, [step, firstName, lastName, phone, email, refCode]);

  // /bienvenido is the PWA manifest start_url. If the user is already signed
  // in (owner/barber/client), skip the signup flow and route them by role.
  // Otherwise, if there's no referral, bounce to login/home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        if (cancelled) return;
        const list = (roles || []).map((r) => r.role as string);
        const priority = ["owner", "barber", "client"];
        const role = priority.find((p) => list.includes(p)) || list[0];
        if (role === "owner" || role === "barber") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/app/cliente", { replace: true });
        }
        // Leave authChecked=false so we render nothing while navigating away.
        return;
      }
      // ?signup=1: direct "Crear perfil" entry from /citas/acceso (no referral needed).
      if (refCode || params.get("signup") === "1") {
        setAuthChecked(true);
        return;
      }
      navigate(isStandalone() ? "/app/cliente" : "/", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [refCode, navigate, params]);


  // Resolve referrer FIRST NAME ONLY for the welcome screen.
  useEffect(() => {
    if (!refCode) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("referral_owners")
        .select("display_name")
        .eq("slug", refCode)
        .eq("active", true)
        .maybeSingle();
      if (!cancelled && data?.display_name) {
        const first = data.display_name.trim().split(/\s+/)[0];
        setReferrerName(first || data.display_name);
      }
    })();
    return () => { cancelled = true; };
  }, [refCode]);

  // Splash auto-advance
  useEffect(() => {
    if (step !== "splash") return;
    const tm = setTimeout(() => setStep("welcome"), 1200);
    return () => clearTimeout(tm);
  }, [step]);

  // Hard-block: install step won't let user past until standalone
  const goAfterInstall = useCallback(() => {
    if (!isStandalone()) {
      toast.error(t.installNotYet);
      return;
    }
    setStep("account");
  }, [t.installNotYet]);

  // From welcome → install (skip install if already standalone)
  const advanceFromWelcome = useCallback(() => {
    setStep(isStandalone() ? "account" : "install");
  }, []);

  // Auto-skip install when relaunched from home-screen
  useEffect(() => {
    if (step === "install" && isStandalone()) setStep("account");
  }, [step]);

  /* ──────── account creation ──────── */
  const handleCreateAccount = useCallback(async () => {
    setError(null);
    const fname = firstName.trim();
    const lname = lastName.trim();
    const em = email.trim().toLowerCase();
    const ph = normalizePhone10(phone);

    if (!fname) { setError(t.errName); return; }
    if (ph.length !== 10) { setError(t.errPhone); return; }
    if (!em || !em.includes("@")) { setError(t.errEmail); return; }
    if (!isPasswordStrong(password, em, fname)) { setError(t.errPwWeak); return; }
    const pwCheck = validatePassword(password, language === "en" ? "en" : "es", em);
    if (!pwCheck.ok) { setError((pwCheck as { ok: false; message: string }).message); return; }

    setSubmitting(true);
    try {
      // Bulletproof server-side signup:
      //   - Uses admin API with email_confirm:true (independent of project
      //     auto_confirm setting → "Email not confirmed" can never appear).
      //   - Collapses pre-check + create into a single round-trip.
      //   - Returns { status: "has_account" } if the email already has a PWA login.
      const { data: signupRes, error: fnErr } = await supabase.functions.invoke(
        "pwa-signup",
        {
          body: {
            email: em,
            password,
            first_name: fname,
            last_name: lname,
            phone: ph,
          },
        },
      );

      if (fnErr) {
        console.error("[welcome] pwa-signup invoke failed", fnErr);
        setError(t.errUnexpected);
        setSubmitting(false);
        return;
      }

      const status = (signupRes as { status?: string; error?: string } | null)?.status;
      const errCode = (signupRes as { error?: string } | null)?.error;

      if (status === "has_account") {
        setError(t.errHasAccount);
        setSubmitting(false);
        setTimeout(() => navigate("/login"), 1400);
        return;
      }
      if (errCode === "identity_mismatch") { setError(t.errIdentity); setSubmitting(false); return; }
      if (errCode === "weak_password") { setError(t.errPwWeak); setSubmitting(false); return; }
      if (errCode === "invalid_email") { setError(t.errEmail); setSubmitting(false); return; }
      if (errCode === "invalid_phone") { setError(t.errPhone); setSubmitting(false); return; }
      if (errCode === "missing_first_name") { setError(t.errName); setSubmitting(false); return; }
      if (status !== "created") {
        console.error("[welcome] pwa-signup unexpected response", signupRes);
        setError(t.errUnexpected);
        setSubmitting(false);
        return;
      }

      // Sign in to obtain a session. Retry with short backoff in the extremely
      // unlikely case the auth backend hasn't propagated the new user yet, and
      // NEVER surface "not confirmed" — the user IS confirmed server-side.
      let signedIn = false;
      let lastSignInErr: string | null = null;
      for (let attempt = 0; attempt < 3 && !signedIn; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: em,
          password,
        });
        if (!signInErr) { signedIn = true; break; }
        lastSignInErr = signInErr.message || "";
      }
      if (!signedIn) {
        console.error("[welcome] post-signup signin failed", lastSignInErr);
        setError(t.errUnexpected);
        setSubmitting(false);
        return;
      }



      // Link to existing client (legacy guests) or create a new row.
      const { data: linkData, error: linkErr } = await (supabase.rpc as any)(
        "link_or_create_client_for_signup",
        {
          _email: em,
          _first_name: fname,
          _last_name: lname || null,
          _phone: ph,
          _booking_source: "referral",
        },
      );
      if (linkErr) {
        const msg = /duplicate|unique/i.test(linkErr.message || "")
          ? t.errAlreadyExists
          : t.errUnexpected;
        setError(msg);
        setSubmitting(false);
        return;
      }
      const clientId = (linkData as any)?.client_id as string | undefined;
      if (!clientId) { setError(t.errUnexpected); setSubmitting(false); return; }

      // Make sure latest info wins
      await supabase.from("clients").update({
        first_name: fname,
        last_name: lname || null,
        phone: ph,
        booking_source: "referral",
      }).eq("id", clientId);

      // Referral attribution + matching-points pending row
      try {
        await recordReferralConversion("signup", clientId);
        if (refCode) {
          await (supabase.rpc as any)("create_referral_pending_match", {
            _referred_client_id: clientId,
            _ref_slug: refCode,
          });
        }
      } catch (e) {
        console.warn("[welcome] attribution failed", e);
      }

      // Hand off to existing ClientOnboarding (mounted by ClientPortalV2
      // whenever clients.onboarding_completed = false).
      try { sessionStorage.setItem("agendaos.force_onboarding", "1"); } catch { /* noop */ }
      try { localStorage.setItem("agendaos.force_onboarding", "1"); } catch { /* noop */ }
      clearPersisted();
      navigate("/app/cliente", { replace: true });
    } catch (err: any) {
      setError(err?.message || t.errUnexpected);
    } finally {
      setSubmitting(false);
    }
  }, [firstName, lastName, phone, email, password, language, refCode, t, navigate]);

  /* ──────── render ──────── */
  if (!authChecked) {
    // Reuse the canonical SplashScreen (same wordmark animation used during
    // auth bootstrap and lazy-route loading) so PWA relaunches feel like a
    // consistent app boot instead of a flash of the signup screen.
    return <SplashScreen />;
  }

  return (
    <>
      <Helmet>
        <title>{t.title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main
        className="fixed inset-0 w-full flex flex-col items-center overflow-hidden"
        style={{
          background: "#000000",
          color: "#fff",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="w-full max-w-[430px] h-full flex flex-col relative px-5 overflow-hidden">
          {/* top bar */}
          <header className="flex items-center justify-between pt-3 pb-2 shrink-0">
            <div className="flex items-center gap-1" style={{ lineHeight: 1.15 }}>
              <span
                className="font-black tracking-tight"
                style={{ fontSize: 11, color: "#fff", letterSpacing: "-0.3px" }}
              >
                CHARLIE'S
              </span>
              <span
                className="font-light"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}
              >
                BARBERSHOP
              </span>
            </div>
            <LanguageToggle />
          </header>


          <div className="flex-1 min-h-0 flex flex-col">
            <AnimatePresence mode="wait">
              {step === "splash" && <SplashView key="splash" />}

              {step === "welcome" && (
                <StepShell key="welcome" paddedBottom>
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <span
                      className="text-[12px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                    >
                      {t.referredBy}
                    </span>
                    <h1
                      className="mt-4 font-black tracking-tight"
                      style={{
                        fontSize: "clamp(32px, 9vw, 44px)",
                        letterSpacing: "-1px",
                        color: "#CEB79E",
                        lineHeight: 1.05,
                      }}
                    >
                      {referrerName || "\u00A0"}
                    </h1>
                  </div>
                  <PrimaryButton onClick={advanceFromWelcome}>{t.welcomeCta}</PrimaryButton>
                </StepShell>
              )}

              {step === "install" && (
                <StepShell key="install" paddedBottom>
                  <Eyebrow>{t.installEyebrow}</Eyebrow>
                  <Headline a={t.installTitle} compact />
                  <p className="text-sm leading-snug mt-2" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {isIOS() ? t.installSubIos : t.installSubAndroid}
                  </p>
                  <ol className="mt-4 space-y-2">
                    {(isIOS() ? t.iosSteps : t.androidSteps).map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded-xl px-3 py-3"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <span
                          className="flex items-center justify-center rounded-full text-[11px] font-bold"
                          style={{ width: 22, height: 22, background: "#CEB79E", color: "#1a1208" }}
                        >
                          {i + 1}
                        </span>
                        <s.Icon size={16} strokeWidth={1.75} style={{ color: "rgba(255,255,255,0.65)" }} />
                        <span className="text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>{s.text}</span>
                      </li>
                    ))}
                  </ol>
                  <Spacer />
                  <PrimaryButton onClick={goAfterInstall}>{t.installConfirmBtn}</PrimaryButton>
                </StepShell>
              )}

              {step === "account" && (
                <StepShell key="account" paddedBottom>
                  <Eyebrow>{t.accountEyebrow}</Eyebrow>
                  <Headline a={t.accountTitle} />
                  <ProgressDots total={5} current={0} />
                  <p className="text-sm leading-snug mt-2" style={{ color: "rgba(255,255,255,0.7)" }}>{t.accountSub}</p>

                  <form
                    className="mt-4 flex min-h-0 flex-1 flex-col"
                    onSubmit={(e: FormEvent) => { e.preventDefault(); void handleCreateAccount(); }}
                  >
                    <div className="min-h-0 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label={t.firstNameLabel}
                          value={firstName}
                          onChange={setFirstName}
                          placeholder={t.firstNamePh}
                          autoComplete="given-name"
                          autoFocus
                        />
                        <Field
                          label={t.lastNameLabel}
                          value={lastName}
                          onChange={setLastName}
                          placeholder={t.lastNamePh}
                          autoComplete="family-name"
                        />
                      </div>
                      <Field
                        label={t.phoneLabel}
                        value={formatPhoneDisplay(phone) || phone}
                        onChange={(v) => setPhone(v)}
                        placeholder={t.phonePh}
                        inputMode="tel"
                        autoComplete="tel"
                      />
                      <Field
                        label={t.emailLabel}
                        value={email}
                        onChange={(v) => setEmail(v)}
                        placeholder={t.emailPh}
                        inputMode="email"
                        autoComplete="email"
                        type="email"
                      />

                      <div className="relative">
                        <Field
                          label={t.pwLabel}
                          value={password}
                          onChange={setPassword}
                          placeholder="••••••••"
                          type={showPw ? "text" : "password"}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute right-3 top-8 text-[12px] font-semibold"
                          style={{ color: "#CEB79E" }}
                        >
                          {showPw ? t.pwHide : t.pwShow}
                        </button>
                      </div>

                      <PasswordStrengthMeter
                        password={password}
                        locale={language === "en" ? "en" : "es"}
                        email={email}
                        firstName={firstName}
                        onChange={setPwStrong}
                        compact
                      />

                      {error && <ErrorText>{error}</ErrorText>}
                    </div>

                    <div className="mt-auto pt-3 shrink-0">
                      <PrimaryButton type="submit" disabled={!pwStrong || submitting} loading={submitting}>
                        {submitting ? t.btnCreating : t.btnContinue}
                      </PrimaryButton>
                      <div className="text-center mt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try { sessionStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
                            try { localStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
                            try { await supabase.auth.signOut(); } catch { /* noop */ }
                            const q = email.trim() ? `?email=${encodeURIComponent(email.trim())}` : "";
                            navigate(`/login${q}`, { replace: true });
                          }}
                          className="text-[12px] font-semibold"
                          style={{ color: "rgba(255,255,255,0.55)" }}
                        >
                          {t.signInLink}
                        </button>

                      </div>
                    </div>
                  </form>
                </StepShell>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </>
  );
}

/* ──────────────────────────── Primitives ──────────────────────────── */

function SplashView() {
  return (
    <motion.div
      key="splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col items-center justify-center"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        className="text-center"
      >
        <div className="text-[18px] font-black tracking-tight">
          <span style={{ color: "#fff" }}>CHARLIE'S</span>
          <span style={{ color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>BARBERSHOP</span>
        </div>
        <div className="mt-3 flex justify-center gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
              style={{ width: 5, height: 5, borderRadius: 99, background: "#CEB79E", display: "inline-block" }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StepShell({ children, compact = false, paddedBottom = false }: { children: React.ReactNode; compact?: boolean; paddedBottom?: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22 }}
      className={`flex-1 min-h-0 flex flex-col ${compact ? "pb-2" : paddedBottom ? "pb-4" : "pb-6"}`}
    >
      {children}
    </motion.section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="self-start text-xs font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-md mb-2"
      style={{ background: "rgba(206,183,158,0.12)", color: "#CEB79E" }}
    >
      {children}
    </span>
  );
}

function Headline({ a, b, compact = false }: { a: string; b?: string; compact?: boolean }) {
  return (
    <h1 className={`${compact ? "text-[24px]" : "text-[32px]"} font-black tracking-tight leading-[1.05]`} style={{ letterSpacing: "-0.5px" }}>
      <span style={{ color: "#fff" }}>{a}</span>
      {b ? (
        <>
          <br />
          <span style={{ color: "rgba(255,255,255,0.55)" }}>{b}</span>
        </>
      ) : null}
    </h1>
  );
}

function Spacer() { return <div className="flex-1 min-h-[20px]" />; }

/**
 * ProgressDots — matches the dots used in ClientOnboarding so the account
 * creation step looks like "Paso 1 de 5" of one continuous flow.
 */
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-2 mb-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full transition-all"
          style={{
            width: i === current ? 22 : 6,
            height: 6,
            background: i === current ? "#CEB79E" : "rgba(255,255,255,0.22)",
          }}
        />
      ))}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] mt-2" style={{ color: "#fca5a5" }}>
      {children}
    </p>
  );
}

function PrimaryButton({
  children, onClick, type = "button", disabled, loading,
}: {
  children: React.ReactNode; onClick?: () => void;
  type?: "button" | "submit"; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all"
      style={{
        background: disabled ? "rgba(255,255,255,0.08)" : "#fff",
        color: disabled ? "rgba(255,255,255,0.35)" : "#0a0a0a",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {children}
      {!loading && !disabled ? <ArrowRight size={15} strokeWidth={2.5} /> : null}
    </button>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
  autoComplete, autoFocus, inputMode, compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "tel" | "email" | "numeric";
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span
        className={`${compact ? "mb-1 text-xs" : "mb-2 text-xs"} block font-bold uppercase tracking-[0.14em]`}
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        className={`${compact ? "px-3 py-2 !text-[12px] rounded-lg" : "px-3.5 py-3 !text-[14px] rounded-xl"} w-full outline-none transition-all`}
        style={{
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.1)",
        }}

      />
    </label>
  );
}
