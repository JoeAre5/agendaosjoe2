// /lista-exclusiva — public waitlist enrollment flow.
//
// Five screens, gated by PWA standalone-mode detection:
//   1. Splash         — benefits + start CTA
//   2. Install chat   — interactive chat-style PWA install instructions
//   3. Signup         — Name + Email + Phone + Password
//   4. Push activate  — request notification permission
//      4b. iOS retry  — full-screen 5-step settings instructions
//   5. Confirmation   — member # + welcome
//
// Theming: all colors are CSS variables defined on `.wl-root` (dark default)
// with overrides under `[data-theme="light"]` for the warm-beige light
// palette. ES/EN copy lives in WL_COPY and is threaded through props.
// Both toggles are driven by global usePreferences (also flips the rest of
// the site).
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isStandalone, isIOS, enablePush, getPushSupport } from "@/lib/push";
import { formatPhoneDisplay, normalizePhone10 } from "@/lib/phone";
import { validatePassword, explainAuthError } from "@/lib/passwordValidator";
import { usePreferences } from "@/hooks/usePreferences";
import { BrandToggles } from "@/components/site/BrandToggles";

import { Gift, Bell, Lock, MoreHorizontal, Plus, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import AnimatedCheckmark from "@/components/ui/AnimatedCheckmark";

// ──────────────────────────── Copy ────────────────────────────
const WL_COPY = {
  es: {
    metaTitle: "Lista exclusiva · Barbería",
    headerBrand: "CHARLIE'S BARBERSHOP",
    headerTag: "lista exclusiva",

    // Splash
    splashHeadlineA: "Sé el primero",
    splashHeadlineB: "en reservar.",
    splashSub: "Únete a la lista exclusiva y desbloquea beneficios que solo nuestros miembros tendrán.",
    benefits: [
      { title: "20% off tu primer corte", sub: "Válido por 30 días después del lanzamiento" },
      { title: "Notificación al instante", sub: "Te avisamos en cuanto abramos las reservas" },
      { title: "Acceso 24h antes", sub: "Reserva primero, antes que el público general" },
    ],
    iosInstall: [
      "Tap los tres puntos abajo en Safari",
      "Tap el botón Compartir",
      "Elige “Add to Home Screen”",
      "Confirma con “Add” y abre Barbería",
    ],
    androidInstall: [
      "Tap los tres puntos en Chrome",
      "Tap el ícono de Compartir",
      "Elige “Añadir a pantalla principal”",
      "Confirma y abre Barbería",
    ],
    instructionsEyebrow: "Instrucciones",
    instructionsTitle: "Antes de empezar, guarda Barbería en tu pantalla",
    splashCta: "Empezar registro",

    // Chat
    chatName: "Charlie",
    chatStatus: "en línea",
    chatFinalBtn: "He añadido Barbería a mi pantalla",
    chatNotInstalledToast: "Aún no estás en la app instalada. Cierra Safari y abre Barbería desde tu pantalla principal.",
    iosChat: [
      { charlie: "Ey 👋 Veo que entraste sin haber guardado Barbería en tu pantalla todavía. No pasa nada, esos 3 pasos del inicio son los que vamos a hacer ahora juntos. Tap abajo cuando estés listo.", userReply: "Dale, enséñame →" },
      { charlie: "Sin esto no puedo enviarte la notificación cuando abramos las reservas, así que es importante hacerlo ahora. Te llevo paso por paso, toma 30 segundos.", userReply: "Vamos →" },
      { charlie: "Paso 1, mira la barra de Safari abajo del todo. Tap el botón de los tres puntos (•••) abajo a la derecha. Es exactamente este:", userReply: "Lo encontré →", illustration: "ios-dots" as const },
      { charlie: "Paso 2, se abre un menú. Tap la primera opción, “Share”. Es exactamente esta:", userReply: "Tap Share →", illustration: "ios-share-row" as const },
      { charlie: "Paso 3, se abre la hoja de compartir con íconos de apps. Desliza hacia arriba con el dedo para ver más opciones (las que están debajo de Copy, Add to Bookmarks, etc.):", userReply: "Ya deslicé →", illustration: "ios-share-sheet" as const },
      { charlie: "Paso 4, sigue deslizando hasta que veas “Add to Home Screen”. Tap esa opción. Es exactamente esta:", userReply: "Tap Add to Home Screen →", illustration: "ios-addhome" as const },
      { charlie: "Paso 5, aparece una pantalla con el ícono y el nombre. Tap el botón azul “Add” arriba a la derecha. Es exactamente este:", userReply: "Tap Add →", illustration: "ios-add-btn" as const },
      { charlie: "Excelente. Ahora cierra Safari completamente. Busca el ícono “Barbería” en tu pantalla principal y ábrelo desde ahí. Te veo del otro lado 👋", userReply: "" },
    ],
    androidChat: [
      { charlie: "Ey 👋 Veo que entraste sin haber guardado Barbería en tu pantalla todavía. No pasa nada, esos 3 pasos del inicio son los que vamos a hacer ahora juntos. Tap abajo cuando estés listo.", userReply: "Dale, enséñame →" },
      { charlie: "Sin esto no puedo enviarte la notificación cuando abramos las reservas, así que es importante hacerlo ahora. Te llevo paso por paso.", userReply: "Vamos →" },
      { charlie: "Tap los tres puntos arriba a la derecha de Chrome.", userReply: "Lo veo →", illustration: "android-menu" as const },
      { charlie: "Tap “Añadir a pantalla principal”.", userReply: "Hecho →", illustration: "android-add" as const },
      { charlie: "Confirma con “Añadir”. Después abre “Barbería” desde tu pantalla principal.", userReply: "", illustration: "android-confirm" as const },
    ],
    illuLabels: {
      "ios-dots": "Botón ••• abajo a la derecha de Safari",
      "ios-share-row": "Opción Share en el menú",
      "ios-share-sheet": "Hoja de compartir, desliza hacia arriba",
      "ios-addhome": "Add to Home Screen",
      "ios-add-btn": "Botón Add azul arriba a la derecha",
      "android-menu": "Menú ⋮ de Chrome",
      "android-add": "Añadir a pantalla principal",
      "android-confirm": "Confirma con Añadir",
    } as Record<string, string>,

    // Signup
    signupHeadlineA: "Crea tu",
    signupHeadlineB: "cuenta.",
    signupSub: "Solo tomará 30 segundos.",
    fieldName: "Nombre",
    fieldEmail: "Email",
    fieldPhone: "Teléfono",
    fieldPassword: "Contraseña",
    placeholderName: "Charlie",
    placeholderEmail: "tu@email.com",
    placeholderPhone: "787-555-1234",
    placeholderPassword: "Mínimo 6 caracteres",
    pwShow: "Mostrar",
    pwHide: "Ocultar",
    pwShowAria: "Mostrar contraseña",
    pwHideAria: "Ocultar contraseña",
    btnContinue: "Continuar",
    btnCreating: "Creando cuenta…",
    errNameRequired: "Ingresa tu nombre.",
    errEmailInvalid: "Ingresa un email válido.",
    errPhoneInvalid: "Ingresa un teléfono de 10 dígitos.",
    errPasswordShort: "La contraseña debe tener al menos 6 caracteres.",
    errAlreadyRegistered: "Ese email ya está registrado. Inicia sesión y vuelve a esta página.",
    errAccountCreate: "No pudimos crear tu cuenta.",
    errEmailVerify: "La cuenta requiere verificación de email antes de continuar.",
    errProfileCreate: "No pudimos crear tu perfil. Intenta de nuevo.",
    errReserveSpot: "Tuvimos un problema reservando tu lugar. Vuelve a intentarlo en un momento.",
    errUnexpected: "Error inesperado.",

    // Push
    pushHeadlineA: "Un último",
    pushHeadlineB: (n: string) => `paso${n ? `, ${n}` : ""}.`,
    pushSub: "Activa las notificaciones para recibir tu código exclusivo el día del lanzamiento.",
    pushBtn: "Activar notificaciones",
    pushBtnLoading: "Activando…",
    errIosNeedsPwa: "Necesitas abrir esta página desde la app instalada en tu pantalla principal.",
    errPushUnsupported: "Tu navegador no soporta notificaciones. Intenta con otro navegador o dispositivo.",
    errPushDenied: "Permiso denegado. Activa las notificaciones en la configuración de tu navegador y vuelve a intentarlo.",
    errPushGeneric: "No pudimos activar las notificaciones.",

    // iOS retry
    iosRetryStatus: "ayuda rápida",
    iosRetryIntro: "No pude activarlas automáticamente. Sigue estos 5 pasos en tu iPhone:",
    iosRetrySteps: [
      "Abre Configuración en tu iPhone",
      "Desliza hasta encontrar Barbería",
      "Tap Notificaciones",
      "Activa Permitir notificaciones",
      "Vuelve aquí y tap el botón de abajo",
    ],
    iosRetryBtn: "Ya las activé",

    // Confirm
    welcomeWith: (n: string) => `¡Bienvenido, ${n}!`,
    welcomeWithoutName: "¡Bienvenido!",
    memberLine: (padded: string) => ({ a: "Eres miembro ", b: `#${padded}`, c: " de la lista exclusiva." }),
    accessLine: { a: "Tus notificaciones están activas. Tendrás ", b: "24 horas de acceso prioritario", c: " antes que el público general el día del lanzamiento." },
    backHome: "Volver al inicio",
    pushWelcomeTitleNamed: (n: string) => `¡Bienvenido, ${n}!`,
    pushWelcomeTitleAnon: "¡Bienvenido a Barbería!",
    pushWelcomeBody: (padded: string) => `Eres miembro #${padded} de la lista exclusiva. Te avisamos en cuanto abramos las reservas.`,
  },
  en: {
    metaTitle: "Exclusive list · Barbershop",
    headerBrand: "CHARLIE'S BARBERSHOP",
    headerTag: "exclusive list",

    splashHeadlineA: "Be the first",
    splashHeadlineB: "to book.",
    splashSub: "Join the exclusive list and unlock benefits only members will get.",
    benefits: [
      { title: "20% off your first cut", sub: "Valid for 30 days after launch" },
      { title: "Instant notification", sub: "We'll ping you the moment booking opens" },
      { title: "24h early access", sub: "Book before the general public does" },
    ],
    iosInstall: [
      "Tap the three dots at the bottom of Safari",
      "Tap the Share button",
      "Pick “Add to Home Screen”",
      "Confirm with “Add” and open Barbería",
    ],
    androidInstall: [
      "Tap the three dots in Chrome",
      "Tap the Share icon",
      "Pick “Add to Home Screen”",
      "Confirm and open Barbería",
    ],
    instructionsEyebrow: "Instructions",
    instructionsTitle: "Before we start, save Barbería to your home screen",
    splashCta: "Start signup",

    chatName: "Charlie",
    chatStatus: "online",
    chatFinalBtn: "I added Barbería to my home screen",
    chatNotInstalledToast: "You're not in the installed app yet. Close Safari and open Barbería from your home screen.",
    iosChat: [
      { charlie: "Hey 👋 I see you came in without saving Barbería to your home screen yet. No worries, those 3 starter steps are what we'll do together right now. Tap below when ready.", userReply: "Show me →" },
      { charlie: "Without this I can't send you the notification when booking opens, so it's important we do it now. I'll walk you through it, takes 30 seconds.", userReply: "Let's go →" },
      { charlie: "Step 1, look at the Safari bar at the very bottom. Tap the three-dots button (•••) at the bottom right. It's exactly this one:", userReply: "Found it →", illustration: "ios-dots" as const },
      { charlie: "Step 2, a menu opens. Tap the first option, “Share”. It's exactly this one:", userReply: "Tap Share →", illustration: "ios-share-row" as const },
      { charlie: "Step 3, the share sheet opens with app icons. Swipe up with your finger to see more options (below Copy, Add to Bookmarks, etc.):", userReply: "Swiped →", illustration: "ios-share-sheet" as const },
      { charlie: "Step 4, keep swiping until you see “Add to Home Screen”. Tap that option. It's exactly this one:", userReply: "Tap Add to Home Screen →", illustration: "ios-addhome" as const },
      { charlie: "Step 5, a screen appears with the icon and name. Tap the blue “Add” button at the top right. It's exactly this one:", userReply: "Tap Add →", illustration: "ios-add-btn" as const },
      { charlie: "Excellent. Now close Safari completely. Find the “Barbería” icon on your home screen and open it from there. See you on the other side 👋", userReply: "" },
    ],
    androidChat: [
      { charlie: "Hey 👋 I see you came in without saving Barbería to your home screen yet. No worries, those 3 starter steps are what we'll do together right now. Tap below when ready.", userReply: "Show me →" },
      { charlie: "Without this I can't send you the notification when booking opens, so it's important we do it now. I'll walk you through it.", userReply: "Let's go →" },
      { charlie: "Tap the three dots at the top right of Chrome.", userReply: "I see it →", illustration: "android-menu" as const },
      { charlie: "Tap “Add to Home Screen”.", userReply: "Done →", illustration: "android-add" as const },
      { charlie: "Confirm with “Add”. Then open “Barbería” from your home screen.", userReply: "", illustration: "android-confirm" as const },
    ],
    illuLabels: {
      "ios-dots": "••• button at the bottom right of Safari",
      "ios-share-row": "Share option in the menu",
      "ios-share-sheet": "Share sheet, swipe up",
      "ios-addhome": "Add to Home Screen",
      "ios-add-btn": "Blue Add button at the top right",
      "android-menu": "Chrome ⋮ menu",
      "android-add": "Add to Home Screen",
      "android-confirm": "Confirm with Add",
    } as Record<string, string>,

    signupHeadlineA: "Create your",
    signupHeadlineB: "account.",
    signupSub: "It only takes 30 seconds.",
    fieldName: "Name",
    fieldEmail: "Email",
    fieldPhone: "Phone",
    fieldPassword: "Password",
    placeholderName: "Charlie",
    placeholderEmail: "you@email.com",
    placeholderPhone: "787-555-1234",
    placeholderPassword: "At least 6 characters",
    pwShow: "Show",
    pwHide: "Hide",
    pwShowAria: "Show password",
    pwHideAria: "Hide password",
    btnContinue: "Continue",
    btnCreating: "Creating account…",
    errNameRequired: "Enter your name.",
    errEmailInvalid: "Enter a valid email.",
    errPhoneInvalid: "Enter a 10-digit phone number.",
    errPasswordShort: "Password must be at least 6 characters.",
    errAlreadyRegistered: "That email is already registered. Sign in and come back to this page.",
    errAccountCreate: "We couldn't create your account.",
    errEmailVerify: "The account needs email verification before continuing.",
    errProfileCreate: "We couldn't create your profile. Try again.",
    errReserveSpot: "We hit a snag reserving your spot. Try again in a moment.",
    errUnexpected: "Unexpected error.",

    pushHeadlineA: "One last",
    pushHeadlineB: (n: string) => `step${n ? `, ${n}` : ""}.`,
    pushSub: "Turn on notifications to get your exclusive code on launch day.",
    pushBtn: "Turn on notifications",
    pushBtnLoading: "Turning on…",
    errIosNeedsPwa: "You need to open this page from the installed app on your home screen.",
    errPushUnsupported: "Your browser doesn't support notifications. Try a different browser or device.",
    errPushDenied: "Permission denied. Turn on notifications in your browser settings and try again.",
    errPushGeneric: "We couldn't turn on notifications.",

    iosRetryStatus: "quick help",
    iosRetryIntro: "I couldn't enable them automatically. Follow these 5 steps on your iPhone:",
    iosRetrySteps: [
      "Open Settings on your iPhone",
      "Scroll until you find Barbería",
      "Tap Notifications",
      "Toggle on Allow Notifications",
      "Come back here and tap the button below",
    ],
    iosRetryBtn: "I turned them on",

    welcomeWith: (n: string) => `Welcome, ${n}!`,
    welcomeWithoutName: "Welcome!",
    memberLine: (padded: string) => ({ a: "You're member ", b: `#${padded}`, c: " of the exclusive list." }),
    accessLine: { a: "Your notifications are active. You'll get ", b: "24 hours of priority access", c: " before the general public on launch day." },
    backHome: "Back to home",
    pushWelcomeTitleNamed: (n: string) => `Welcome, ${n}!`,
    pushWelcomeTitleAnon: "Welcome to Barbería!",
    pushWelcomeBody: (padded: string) => `You're member #${padded} of the exclusive list. We'll ping you the moment booking opens.`,
  },
};

type Copy = typeof WL_COPY["es"];

// LocalStorage cache so re-opening the PWA shows the confirm screen instantly
const WAITLIST_CACHE_KEY = "waitlist:member";
function readCachedMember(): MemberRecord | null {
  try {
    const raw = localStorage.getItem(WAITLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.member_number === "number" && parsed.client_id) {
      return parsed as MemberRecord;
    }
  } catch {}
  return null;
}
function writeCachedMember(rec: MemberRecord) {
  try { localStorage.setItem(WAITLIST_CACHE_KEY, JSON.stringify(rec)); } catch {}
}

import iosDotsImg from "@/assets/waitlist/ios-dots.png";
import iosShareRowImg from "@/assets/waitlist/ios-share-row.png";
import iosShareSheetImg from "@/assets/waitlist/ios-share-sheet.png";
import iosAddHomeImg from "@/assets/waitlist/ios-addhome.png";
import iosAddBtnImg from "@/assets/waitlist/ios-add-btn.png";

type Step = "splash" | "chat" | "signup" | "push" | "ios-retry" | "confirm";

interface MemberRecord {
  member_number: number;
  code: string;
  first_name: string;
  client_id: string;
}

let _charlieAvatarCache: string | null | undefined = undefined;
function useCharlieAvatar(): string | null {
  const [src, setSrc] = useState<string | null>(_charlieAvatarCache ?? null);
  useEffect(() => {
    if (_charlieAvatarCache !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("barbers")
          .select("avatar_url")
          .ilike("name", "%charlie%")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        const url = (data?.avatar_url as string | null) || null;
        _charlieAvatarCache = url;
        if (!cancelled) setSrc(url);
      } catch {
        _charlieAvatarCache = null;
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return src;
}

// ──────────────────────────── Page ────────────────────────────
export default function Waitlist() {
  const { resolvedTheme, language, setTheme } = usePreferences();
  const t = WL_COPY[language === "en" ? "en" : "es"];

  // Public landing pages always follow the device's system theme.
  useEffect(() => { setTheme("system"); }, [setTheme]);

  const cached = useMemo(() => readCachedMember(), []);
  const [step, setStep] = useState<Step>(cached ? "confirm" : "splash");
  const [member, setMember] = useState<MemberRecord | null>(cached);
  const [bootChecked] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async (session: { user: { id: string } } | null) => {
      try {
        if (!session) return;
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id, first_name")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (!clientRow) return;
        const { data: existing } = await supabase
          .from("waitlist_members")
          .select("member_number, code")
          .eq("client_id", clientRow.id)
          .maybeSingle();
        if (existing && !cancelled) {
          const rec: MemberRecord = {
            member_number: existing.member_number,
            code: existing.code,
            first_name: clientRow.first_name || "",
            client_id: clientRow.id,
          };
          setMember(rec);
          setStep("confirm");
          writeCachedMember(rec);
        }
      } catch {}
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        try { localStorage.removeItem(WAITLIST_CACHE_KEY); } catch {}
        if (!cancelled) { setMember(null); setStep("splash"); }
        return;
      }
      void checkSession(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { void checkSession(session); });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const advanceFromSplash = () => {
    if (isStandalone()) setStep("signup");
    else setStep("chat");
  };

  return (
    <>
      <Helmet>
        <title>{t.metaTitle}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="wl-root" data-theme={resolvedTheme}>
        <BackgroundLayers />
        <Header t={t} />

        <div className="wl-stage">
          {!bootChecked ? null : step === "splash" ? (
            <SplashScreen t={t} onContinue={advanceFromSplash} />
          ) : step === "chat" ? (
            <ChatScreen t={t} onSimulatedStandalone={() => setStep("signup")} />
          ) : step === "signup" ? (
            <SignupScreen t={t} onSuccess={(rec) => { setMember(rec); writeCachedMember(rec); setStep("push"); }} />
          ) : step === "push" ? (
            <PushScreen
              t={t}
              language={language}
              firstName={member?.first_name || ""}
              onGranted={() => setStep("confirm")}
              onIOSRetry={() => setStep("ios-retry")}
            />
          ) : step === "ios-retry" ? (
            <IOSRetryScreen t={t} onRecheck={() => {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                setStep("confirm");
              }
            }} />
          ) : step === "confirm" && member ? (
            <ConfirmScreen t={t} member={member} />
          ) : null}
        </div>

        <SharedStyles />
      </main>
    </>
  );
}

// ──────────────────────────── Header ────────────────────────────
function Header({ t }: { t: Copy }) {
  return (
    <header className="wl-nav">
      <div className="wl-nav-inner">
        <span className="wl-brand">{t.headerBrand}</span>
        <div className="wl-nav-right">
          <span className="wl-build">{t.headerTag}</span>
          <BrandToggles />
        </div>
      </div>
    </header>
  );
}

// ──────────────────────────── Background ────────────────────────────
function BackgroundLayers() {
  return (
    <>
      <div className="wl-grid" aria-hidden="true" />
      <div className="wl-vignette" aria-hidden="true" />
      <div className="wl-glow" aria-hidden="true" />
    </>
  );
}

// Apple-style share icon
const AppleShareIcon: LucideIcon = (({ size = 24, color = "currentColor", strokeWidth = 1.75, ...rest }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth as number} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <line x1="12" y1="3" x2="12" y2="15" />
    <polyline points="8 7 12 3 16 7" />
    <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
)) as unknown as LucideIcon;

// ──────────────────────────── Screen 1: Splash ────────────────────────────
function SplashScreen({ t, onContinue }: { t: Copy; onContinue: () => void }) {
  const ios = useMemo(() => isIOS(), []);
  const benefitIcons: LucideIcon[] = [Gift, Bell, Lock];
  const benefits = t.benefits.map((b, i) => ({ Icon: benefitIcons[i], ...b }));

  const stepIcons: LucideIcon[] = [MoreHorizontal, AppleShareIcon, Plus, CheckCircle2];
  const stepTexts = ios ? t.iosInstall : t.androidInstall;
  const steps = stepTexts.map((text, i) => ({ Icon: stepIcons[i], text }));

  return (
    <section className="wl-screen">
      <h1 className="wl-headline">
        <span className="wl-line wl-line-1 font-extrabold">{t.splashHeadlineA}</span>
        <span className="wl-line wl-line-2 font-extrabold">{t.splashHeadlineB}</span>
      </h1>
      <p className="wl-sub">{t.splashSub}</p>

      <div className="wl-marquee" aria-label="Benefits">
        <div className="wl-marquee-track">
          {[...benefits, ...benefits, ...benefits].map((b, i) => (
            <div key={i} className="wl-marquee-item">
              <span className="wl-marquee-icon" aria-hidden="true">
                <b.Icon size={18} strokeWidth={1.75} color="var(--wl-accent)" />
              </span>
              <span className="wl-marquee-title">{b.title}</span>
              <span className="wl-marquee-sub">{b.sub}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wl-instructions" aria-label="Instructions">
        <div className="wl-instructions-header">
          <span className="wl-instructions-eyebrow">{t.instructionsEyebrow}</span>
          <span className="wl-instructions-title">{t.instructionsTitle}</span>
        </div>
        <ul className="wl-instructions-list">
          {steps.map((s, i) => (
            <li key={i} className="wl-instructions-item" style={{ animationDelay: `${600 + i * 90}ms` }}>
              <span className="wl-instructions-bullet" aria-hidden="true">
                <s.Icon size={16} strokeWidth={1.75} color="var(--wl-accent)" />
              </span>
              <span className="wl-instructions-text">{s.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onContinue} className="wl-btn wl-btn-primary wl-actions-block">
        {t.splashCta}
        <Arrow />
      </button>
    </section>
  );
}

// ──────────────────────────── Screen 2: Install Chat ────────────────────────────
type IllustrationKind =
  | "ios-dots" | "ios-share-row" | "ios-share-sheet" | "ios-addhome" | "ios-add-btn"
  | "android-menu" | "android-add" | "android-confirm";

type ChatMessage = { from: "charlie" | "user"; text: string; illustration?: IllustrationKind };

function ChatScreen({ t, onSimulatedStandalone }: { t: Copy; onSimulatedStandalone: () => void }) {
  const ios = useMemo(() => isIOS(), []);
  const charlieAvatar = useCharlieAvatar();
  const script = useMemo(
    () => (ios ? t.iosChat : t.androidChat) as ReadonlyArray<{ charlie: string; userReply: string; illustration?: IllustrationKind }>,
    [ios, t]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [typing, setTyping] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setStepIdx(0);
    setTyping(true);
    const timer = window.setTimeout(() => {
      setMessages([{ from: "charlie", text: script[0].charlie, illustration: script[0].illustration }]);
      setTyping(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [script]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scroll = (smooth: boolean) => el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    const r1 = requestAnimationFrame(() => {
      scroll(true);
      const r2 = requestAnimationFrame(() => scroll(true));
      (el as any).__r2 = r2;
    });
    const t1 = window.setTimeout(() => scroll(true), 180);
    const t2 = window.setTimeout(() => scroll(false), 420);
    return () => {
      cancelAnimationFrame(r1);
      if ((el as any).__r2) cancelAnimationFrame((el as any).__r2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [messages, typing]);

  const currentReply = script[stepIdx]?.userReply ?? "";
  const isLast = stepIdx >= script.length - 1;

  const handleSend = () => {
    if (!currentReply || typing) return;
    setMessages((prev) => [...prev, { from: "user", text: currentReply }]);
    const nextIdx = stepIdx + 1;
    if (nextIdx >= script.length) return;
    setTyping(true);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { from: "charlie", text: script[nextIdx].charlie, illustration: script[nextIdx].illustration }]);
      setTyping(false);
      setStepIdx(nextIdx);
    }, 900);
  };

  const handleFinalCheck = () => {
    if (isStandalone()) onSimulatedStandalone();
    else toast(t.chatNotInstalledToast);
  };

  return (
    <section className="wl-screen wl-screen-chat">
      <div className="wl-chat-shell">
        <div className="wl-chat-header">
          <CharlieAvatar src={charlieAvatar} size={36} />
          <div className="wl-chat-headerText">
            <span className="wl-chat-name">{t.chatName}</span>
            <span className="wl-chat-status"><span className="wl-chat-dot" />{t.chatStatus}</span>
          </div>
        </div>

        <div className="wl-chat-body" ref={scrollRef}>
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} avatarUrl={charlieAvatar} t={t} />
          ))}
          {typing && <TypingIndicator avatarUrl={charlieAvatar} />}
        </div>

        <div className="wl-chat-input">
          {isLast ? (
            <button onClick={handleFinalCheck} className="wl-btn wl-btn-primary wl-chat-finalBtn">
              {t.chatFinalBtn}
            </button>
          ) : (
            <button onClick={handleSend} disabled={typing || !currentReply} className="wl-chat-sendRow" aria-label="Send">
              <span className="wl-chat-sendText">{currentReply || ""}</span>
              <span className="wl-chat-sendBtn" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function CharlieAvatar({ src, size }: { src: string | null; size: number }) {
  if (src) {
    return (
      <div className="wl-chat-avatar wl-chat-avatar-img" style={{ width: size, height: size }}>
        <img loading="lazy" decoding="async" src={src} alt="Charlie" />
      </div>
    );
  }
  return <div className="wl-chat-avatar" style={{ width: size, height: size }}>CB</div>;
}

function MsgAvatar({ src }: { src: string | null }) {
  if (src) {
    return (
      <div className="wl-msg-avatar wl-msg-avatar-img">
        <img loading="lazy" decoding="async" src={src} alt="Charlie" />
      </div>
    );
  }
  return <div className="wl-msg-avatar">CB</div>;
}

function ChatBubble({ message, avatarUrl, t }: { message: ChatMessage; avatarUrl: string | null; t: Copy }) {
  const isUser = message.from === "user";
  return (
    <div className={`wl-msg-row ${isUser ? "wl-msg-row-user" : "wl-msg-row-charlie"}`}>
      {!isUser && <MsgAvatar src={avatarUrl} />}
      <div className="wl-msg-stack">
        <div className={`wl-msg-bubble ${isUser ? "wl-msg-user" : "wl-msg-charlie"}`}>
          <span className="wl-msg-text">{message.text}</span>
        </div>
        {message.illustration && <Illustration kind={message.illustration} t={t} />}
      </div>
    </div>
  );
}

function TypingIndicator({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <div className="wl-msg-row wl-msg-row-charlie">
      <MsgAvatar src={avatarUrl} />
      <div className="wl-msg-bubble wl-msg-charlie wl-typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

function Illustration({ kind, t }: { kind: IllustrationKind; t: Copy }) {
  const iosMap: Partial<Record<IllustrationKind, { src: string }>> = {
    "ios-dots": { src: iosDotsImg },
    "ios-share-row": { src: iosShareRowImg },
    "ios-share-sheet": { src: iosShareSheetImg },
    "ios-addhome": { src: iosAddHomeImg },
    "ios-add-btn": { src: iosAddBtnImg },
  };

  const iosEntry = iosMap[kind];
  const alt = t.illuLabels[kind] || "";
  if (iosEntry) {
    return (
      <div className="wl-illu wl-illu-shot" aria-label={alt}>
        <img loading="lazy" decoding="async" src={iosEntry.src} alt={alt} className="wl-illu-img" />
      </div>
    );
  }

  return (
    <div className="wl-illu" aria-label={alt}>
      {kind === "android-menu" && (
        <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--wl-accent)" }}>
          <circle cx="32" cy="14" r="3" fill="currentColor" />
          <circle cx="32" cy="32" r="3" fill="currentColor" />
          <circle cx="32" cy="50" r="3" fill="currentColor" />
        </svg>
      )}
      {kind === "android-add" && (
        <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--wl-accent)" }}>
          <rect x="14" y="10" width="36" height="44" rx="6" />
          <path d="M32 26v12M26 32h12" />
        </svg>
      )}
      {kind === "android-confirm" && (
        <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--wl-accent)" }}>
          <path d="M14 33l11 11 25-25" />
        </svg>
      )}
      <span className="wl-illu-label">{alt}</span>
    </div>
  );
}

// ──────────────────────────── Screen 3: Signup ────────────────────────────
function SignupScreen({ t, onSuccess }: { t: Copy; onSuccess: (rec: MemberRecord) => void }) {
  const { language } = usePreferences();
  const locale = language === "en" ? "en" : "es";
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const fname = firstName.trim();
    const em = email.trim().toLowerCase();
    const ph = normalizePhone10(phone);
    if (!fname) return setError(t.errNameRequired);
    if (!em || !em.includes("@")) return setError(t.errEmailInvalid);
    if (ph.length !== 10) return setError(t.errPhoneInvalid);

    const pwCheck = validatePassword(password, locale, em);
    if (!pwCheck.ok) return setError((pwCheck as { ok: false; message: string }).message);

    setSubmitting(true);
    try {
      const redirectUrl = `${window.location.origin}/lista-exclusiva`;
      const { data: signUpData, error: suErr } = await supabase.auth.signUp({
        email: em, password,
        options: { emailRedirectTo: redirectUrl, data: { first_name: fname, phone: ph } },
      });

      if (suErr) {
        setError(explainAuthError(suErr.message, locale));
        setSubmitting(false);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) { setError(t.errEmailVerify); setSubmitting(false); return; }

      // Link to existing client (by email/phone) or create a fresh row.
      // Replaces the previous loop+insert dance and prevents duplicate client rows
      // when the email is already on file (e.g. Charlie added them manually before).
      let clientId: string | null = null;
      try {
        const { data: linkData, error: linkErr } = await (supabase.rpc as any)("link_or_create_client_for_signup", {
          _email: em,
          _first_name: fname,
          _last_name: null,
          _phone: ph,
          _booking_source: "waitlist",
        });
        if (linkErr) throw linkErr;
        clientId = (linkData as any)?.client_id ?? null;

        if (clientId) {
          // Make sure the latest waitlist info wins (name/phone may have been blank before).
          await supabase.from("clients").update({
            first_name: fname, phone: ph,
            booking_source: "waitlist",
          }).eq("id", clientId);
        }
      } catch (linkErr) {
        console.error("[waitlist] link_or_create_client_for_signup failed", linkErr);
      }

      if (!clientId) {
        setError(t.errProfileCreate);
        setSubmitting(false);
        return;
      }

      let memberRow: { member_number: number; code: string } | null = null;
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { data, error: wlErr } = await supabase.from("waitlist_members")
          .insert({ client_id: clientId, member_number: 0 } as any)
          .select("member_number, code").maybeSingle();
        if (data) { memberRow = data; break; }
        lastError = wlErr?.message ?? "unknown";
        if (wlErr && /duplicate key/i.test(wlErr.message) && /client_id/i.test(wlErr.message)) {
          const { data: existing } = await supabase.from("waitlist_members")
            .select("member_number, code").eq("client_id", clientId).maybeSingle();
          if (existing) { memberRow = existing; break; }
        }
        await new Promise((r) => setTimeout(r, 120 * attempt));
      }

      if (!memberRow) {
        await supabase.from("audit_log").insert({
          user_id: userId, action: "waitlist_member_number_collision",
          entity_type: "waitlist_members",
          metadata: { client_id: clientId, attempts: 3, last_error: lastError },
        });
        setError(t.errReserveSpot);
        setSubmitting(false);
        return;
      }

      await supabase.from("waitlist_members")
        .update({ pwa_install_confirmed_at: new Date().toISOString() })
        .eq("client_id", clientId);

      // Referral attribution: signup + waitlist conversions (fire-and-forget)
      try {
        const { recordReferralConversion } = await import("@/lib/referral");
        await Promise.all([
          recordReferralConversion("signup", clientId),
          recordReferralConversion("waitlist", clientId),
        ]);
      } catch {
        // never block onSuccess on attribution
      }

      try { sessionStorage.setItem("agendaos.force_onboarding", "1"); } catch { /* noop */ }
      try { localStorage.setItem("agendaos.force_onboarding", "1"); } catch { /* noop */ }

      onSuccess({
        member_number: memberRow.member_number,
        code: memberRow.code,
        first_name: fname,
        client_id: clientId,
      });
    } catch (err: any) {
      setError(err?.message || t.errUnexpected);
      setSubmitting(false);
    }
  };

  return (
    <section className="wl-screen">
      <h1 className="wl-headline">
        <span className="wl-line wl-line-1">{t.signupHeadlineA}</span>
        <span className="wl-line wl-line-2">{t.signupHeadlineB}</span>
      </h1>
      <p className="wl-sub">{t.signupSub}</p>

      <form onSubmit={handleSubmit} className="wl-form">
        <label className="wl-field">
          <span className="wl-label">{t.fieldName}</span>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name" className="wl-input" placeholder={t.placeholderName} />
        </label>

        <label className="wl-field">
          <span className="wl-label">{t.fieldEmail}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" className="wl-input" placeholder={t.placeholderEmail} />
        </label>

        <label className="wl-field">
          <span className="wl-label">{t.fieldPhone}</span>
          <input type="tel" inputMode="numeric" value={formatPhoneDisplay(phone)}
            onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
            className="wl-input" placeholder={t.placeholderPhone} />
        </label>

        <label className="wl-field">
          <span className="wl-label">{t.fieldPassword}</span>
          <div className="wl-pwWrap">
            <input type={showPw ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
              className="wl-input" placeholder={t.placeholderPassword} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="wl-pwToggle"
              aria-label={showPw ? t.pwHideAria : t.pwShowAria}>
              {showPw ? t.pwHide : t.pwShow}
            </button>
          </div>
        </label>

        {error && <div className="wl-error">{error}</div>}

        <button type="submit" disabled={submitting} className="wl-btn wl-btn-primary wl-actions-block">
          {submitting ? t.btnCreating : t.btnContinue}
          {!submitting && <Arrow />}
        </button>
      </form>
    </section>
  );
}

// ──────────────────────────── Screen 4: Push activation ────────────────────────────
function PushScreen({
  t, language, firstName, onGranted, onIOSRetry,
}: {
  t: Copy; language: string; firstName: string;
  onGranted: () => void; onIOSRetry: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ios = useMemo(() => isIOS(), []);

  const handleActivate = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const support = getPushSupport();
      if (support === "ios-needs-pwa") { setErrorMsg(t.errIosNeedsPwa); setSubmitting(false); return; }
      if (support === "unsupported") { setErrorMsg(t.errPushUnsupported); setSubmitting(false); return; }

      const result = await enablePush(language === "en" ? "en" : "es");
      if (result.ok) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: clientRow } = await supabase.from("clients").select("id").eq("auth_user_id", session.user.id).maybeSingle();
          if (clientRow) {
            await supabase.from("waitlist_members")
              .update({ push_confirmed_at: new Date().toISOString() })
              .eq("client_id", clientRow.id);
          }
        }
        onGranted();
        return;
      }

      const failure = result as Extract<typeof result, { ok: false }>;
      if (failure.reason === "denied") {
        if (ios) { onIOSRetry(); return; }
        setErrorMsg(t.errPushDenied);
      } else {
        setErrorMsg(failure.message || t.errPushGeneric);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t.errUnexpected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="wl-screen">
      <h1 className="wl-headline">
        <span className="wl-line wl-line-1">{t.pushHeadlineA}</span>
        <span className="wl-line wl-line-2">{t.pushHeadlineB(firstName)}</span>
      </h1>
      <p className="wl-sub">{t.pushSub}</p>

      <button onClick={handleActivate} disabled={submitting} className="wl-btn wl-btn-primary wl-actions-block">
        {submitting ? t.pushBtnLoading : t.pushBtn}
        {!submitting && <Arrow />}
      </button>

      {errorMsg && <div className="wl-error wl-error-block">{errorMsg}</div>}
    </section>
  );
}

// ──────────────────────────── Screen 4b: iOS retry ────────────────────────────
function IOSRetryScreen({ t, onRecheck }: { t: Copy; onRecheck: () => void }) {
  const charlieAvatar = useCharlieAvatar();

  return (
    <section className="wl-screen wl-screen-chat">
      <div className="wl-chat-shell">
        <div className="wl-chat-header">
          <CharlieAvatar src={charlieAvatar} size={36} />
          <div className="wl-chat-headerText">
            <span className="wl-chat-name">{t.chatName}</span>
            <span className="wl-chat-status"><span className="wl-chat-dot" />{t.iosRetryStatus}</span>
          </div>
        </div>

        <div className="wl-chat-body">
          <div className="wl-msg-row wl-msg-row-charlie">
            <MsgAvatar src={charlieAvatar} />
            <div className="wl-msg-bubble wl-msg-charlie">{t.iosRetryIntro}</div>
          </div>

          <ol className="wl-steps">
            {t.iosRetrySteps.map((s, i) => (
              <li key={i} className="wl-step">
                <span className="wl-step-num">{i + 1}</span>
                <span className="wl-step-text">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="wl-chat-input">
          <button onClick={onRecheck} className="wl-btn wl-btn-primary wl-chat-finalBtn">
            {t.iosRetryBtn}
          </button>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────── Screen 5: Confirmation ────────────────────────────
function ConfirmScreen({ t, member }: { t: Copy; member: MemberRecord }) {
  const navigate = useNavigate();
  const padded = String(member.member_number).padStart(3, "0");
  const firstNameOnly = (member.first_name || "").trim().split(/\s+/)[0] || "";

  useEffect(() => {
    if (!member.client_id) return;
    const dispatchKey = `waitlist_welcome_${member.client_id}`;
    const tm = window.setTimeout(() => {
      supabase.functions.invoke("send-push", {
        body: {
          client_id: member.client_id,
          dispatch_key: dispatchKey,
          title: firstNameOnly ? t.pushWelcomeTitleNamed(firstNameOnly) : t.pushWelcomeTitleAnon,
          body: t.pushWelcomeBody(padded),
          url: "/lista-exclusiva",
        },
      }).catch((err) => console.warn("[waitlist] welcome push failed", err));
    }, 600);
    return () => window.clearTimeout(tm);
  }, [member.client_id, firstNameOnly, padded, t]);

  const memberLine = t.memberLine(padded);

  return (
    <section className="wl-screen">
      <div className="wl-confirm-check" aria-hidden="true">
        <AnimatedCheckmark size={72} color="hsl(142 71% 45%)" strokeWidth={2.25} />
      </div>
      <h1 className="wl-headline">
        <span className="wl-line wl-line-inline">
          {firstNameOnly ? (
            <>
              <span className="wl-line-white">{t.welcomeWith(firstNameOnly).replace(firstNameOnly + (t.welcomeWith(firstNameOnly).endsWith("!") ? "!" : ""), "")}</span>
              <span className="wl-line-gold">{firstNameOnly}!</span>
            </>
          ) : (
            <span className="wl-line-white">{t.welcomeWithoutName}</span>
          )}
        </span>
      </h1>
      <p className="wl-sub">
        {memberLine.a}<strong className="wl-accent-text">{memberLine.b}</strong>{memberLine.c}
      </p>

      <p className="wl-sub" style={{ marginTop: -4 }}>
        {t.accessLine.a}<strong className="wl-accent-text">{t.accessLine.b}</strong>{t.accessLine.c}
      </p>

      <button onClick={() => navigate("/")} className="wl-btn wl-btn-primary wl-actions-block">
        {t.backHome}
      </button>
    </section>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

// ──────────────────────────── Shared styles ────────────────────────────
function SharedStyles() {
  return (
    <style>{`
      /* ───── Tokens (dark default) ───── */
      .wl-root {
        --wl-bg: #080808;
        --wl-bg-soft: rgba(8,8,8,0.6);
        --wl-bg-soft-2: rgba(0,0,0,0.25);
        --wl-text: #ffffff;
        --wl-text-strong: #ffffff;
        --wl-text-muted: rgba(255,255,255,0.6);
        --wl-text-subtle: rgba(255,255,255,0.5);
        --wl-text-faint: rgba(255,255,255,0.4);
        --wl-text-soft: rgba(255,255,255,0.85);
        --wl-grid-dot: rgba(255,255,255,0.06);
        --wl-vignette-edge: rgba(8,8,8,0.55);
        --wl-divider: rgba(255,255,255,0.06);
        --wl-divider-strong: rgba(255,255,255,0.08);
        --wl-input-bg: rgba(255,255,255,0.03);
        --wl-input-bg-focus: rgba(255,255,255,0.05);
        --wl-input-border: rgba(255,255,255,0.12);
        --wl-input-placeholder: rgba(255,255,255,0.3);
        --wl-step-bg: rgba(255,255,255,0.025);
        --wl-step-border: rgba(255,255,255,0.08);
        --wl-chat-shell-bg: linear-gradient(180deg, rgba(20,20,20,0.6) 0%, rgba(10,10,10,0.6) 100%);
        --wl-chat-shell-border: rgba(255,255,255,0.08);
        --wl-charlie-bg: #1a1a1a;
        --wl-charlie-border: #2a2a2a;
        --wl-charlie-text: rgba(255,255,255,0.92);
        --wl-send-bg: rgba(255,255,255,0.04);
        --wl-send-bg-hover: rgba(255,255,255,0.07);
        --wl-send-border: rgba(255,255,255,0.10);
        --wl-send-text: rgba(255,255,255,0.92);
        --wl-typing-dot: rgba(255,255,255,0.6);
        --wl-instructions-bg: linear-gradient(180deg, rgba(206,183,158,0.06) 0%, rgba(206,183,158,0.015) 100%);
        --wl-instructions-border: rgba(206,183,158,0.18);
        --wl-bullet-bg: rgba(206,183,158,0.10);
        --wl-bullet-border: rgba(206,183,158,0.22);
        --wl-instructions-text: rgba(255,255,255,0.82);
        --wl-illu-bg: rgba(206,183,158,0.06);
        --wl-illu-border: rgba(206,183,158,0.32);
        --wl-illu-shot-bg: rgba(0,0,0,0.55);
        --wl-illu-shot-border: rgba(206,183,158,0.28);
        --wl-glow: radial-gradient(ellipse at center, rgba(206,183,158,0.18) 0%, rgba(206,183,158,0.04) 40%, transparent 70%);

        --wl-accent: #ceb79e;
        --wl-accent-hover: #d9c4ad;
        --wl-on-accent: #080808;

        --wl-error-bg: rgba(220,38,38,0.12);
        --wl-error-border: rgba(220,38,38,0.32);
        --wl-error-text: #fca5a5;

        /* BrandToggles tokens */
        --bt-bg: rgba(255,255,255,0.04);
        --bt-fg: rgba(255,255,255,0.78);
        --bt-border: rgba(255,255,255,0.12);
        --bt-bg-hover: rgba(255,255,255,0.08);
        --bt-fg-hover: #fff;
        --bt-border-hover: rgba(206,183,158,0.45);
      }

      /* ───── Light palette (pure white minimal) ───── */
      .wl-root[data-theme="light"] {
        --wl-bg: #ffffff;
        --wl-bg-soft: rgba(255,255,255,0.75);
        --wl-bg-soft-2: rgba(255,255,255,0.5);
        --wl-text: #0a0a0a;
        --wl-text-strong: #000000;
        --wl-text-muted: rgba(10,10,10,0.65);
        --wl-text-subtle: rgba(10,10,10,0.5);
        --wl-text-faint: rgba(10,10,10,0.4);
        --wl-text-soft: rgba(10,10,10,0.85);
        --wl-grid-dot: rgba(0,0,0,0.06);
        --wl-vignette-edge: rgba(255,255,255,0.6);
        --wl-divider: rgba(0,0,0,0.08);
        --wl-divider-strong: rgba(0,0,0,0.10);
        --wl-input-bg: rgba(0,0,0,0.025);
        --wl-input-bg-focus: rgba(0,0,0,0.045);
        --wl-input-border: rgba(0,0,0,0.14);
        --wl-input-placeholder: rgba(10,10,10,0.35);
        --wl-step-bg: rgba(0,0,0,0.02);
        --wl-step-border: rgba(0,0,0,0.08);
        --wl-chat-shell-bg: linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(250,250,250,0.85) 100%);
        --wl-chat-shell-border: rgba(0,0,0,0.10);
        --wl-charlie-bg: #ffffff;
        --wl-charlie-border: rgba(0,0,0,0.10);
        --wl-charlie-text: rgba(10,10,10,0.92);
        --wl-send-bg: rgba(0,0,0,0.03);
        --wl-send-bg-hover: rgba(0,0,0,0.06);
        --wl-send-border: rgba(0,0,0,0.12);
        --wl-send-text: rgba(10,10,10,0.92);
        --wl-typing-dot: rgba(10,10,10,0.5);
        --wl-instructions-bg: linear-gradient(180deg, rgba(184,154,120,0.08) 0%, rgba(184,154,120,0.02) 100%);
        --wl-instructions-border: rgba(184,154,120,0.28);
        --wl-bullet-bg: rgba(184,154,120,0.12);
        --wl-bullet-border: rgba(184,154,120,0.32);
        --wl-instructions-text: rgba(10,10,10,0.85);
        --wl-illu-bg: rgba(184,154,120,0.08);
        --wl-illu-border: rgba(184,154,120,0.36);
        --wl-illu-shot-bg: rgba(255,255,255,0.92);
        --wl-illu-shot-border: rgba(184,154,120,0.32);
        --wl-glow: radial-gradient(ellipse at center, rgba(206,183,158,0.22) 0%, rgba(206,183,158,0.05) 40%, transparent 70%);

        --wl-accent: #b89a78;
        --wl-accent-hover: #a4865f;
        --wl-on-accent: #ffffff;

        --wl-error-bg: rgba(220,38,38,0.10);
        --wl-error-border: rgba(220,38,38,0.35);
        --wl-error-text: #b91c1c;

        --bt-bg: transparent;
        --bt-fg: rgba(10,10,10,0.72);
        --bt-border: transparent;
        --bt-bg-hover: transparent;
        --bt-fg-hover: #000000;
        --bt-border-hover: transparent;
      }

      .wl-root {
        min-height: 100svh; width: 100%;
        background: var(--wl-bg);
        color: var(--wl-text);
        position: relative; overflow-x: hidden;
        font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
        display: flex; flex-direction: column;
        transition: background 280ms ease, color 280ms ease;
      }
      .wl-grid {
        position: fixed; inset: 0;
        background-image: radial-gradient(circle at 1px 1px, var(--wl-grid-dot) 1px, transparent 0);
        background-size: 22px 22px;
        pointer-events: none; z-index: 0;
      }
      .wl-vignette {
        position: fixed; inset: 0;
        background: radial-gradient(ellipse at center, transparent 0%, transparent 60%, var(--wl-vignette-edge) 100%);
        pointer-events: none; z-index: 1;
      }
      .wl-glow {
        position: fixed; top: -200px; left: 50%; width: 700px; height: 500px;
        transform: translateX(-50%);
        background: var(--wl-glow);
        filter: blur(40px);
        pointer-events: none; z-index: 1;
        animation: wl-pulse 8s ease-in-out infinite;
      }
      @keyframes wl-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }

      .wl-nav {
        position: relative; z-index: 3;
        border-bottom: 1px solid var(--wl-divider);
        padding-top: max(env(safe-area-inset-top, 0px), 0px);
        background: var(--wl-bg-soft);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      }
      .wl-nav-inner {
        max-width: 1200px; margin: 0 auto;
        padding: 16px 24px;
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
      }
      .wl-nav-right { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .wl-brand {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 600; letter-spacing: 0.22em; color: var(--wl-accent);
      }
      .wl-build {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 500; letter-spacing: 0.05em;
        color: var(--wl-text-faint);
      }
      @media (max-width: 480px) {
        .wl-build { display: none; }
      }

      .wl-stage {
        position: relative; z-index: 3; flex: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 32px 20px max(env(safe-area-inset-bottom, 24px), 24px);
        width: 100%;
      }

      .wl-screen { width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; }
      .wl-screen-chat { max-width: 520px; height: calc(100svh - 120px); max-height: 760px; }

      .wl-headline {
        font-family: 'Montserrat', system-ui, sans-serif;
        letter-spacing: -0.04em; line-height: 0.98;
        margin: 0; font-size: clamp(40px, 9vw, 64px);
      }
      .wl-line { display: block; font-weight: 900 !important; opacity: 0; transform: translateY(10px); }
      .wl-line-1 { color: var(--wl-text-strong); animation: wl-fadeUp 700ms cubic-bezier(0.16,1,0.3,1) 80ms forwards; }
      .wl-line-2 { color: var(--wl-accent); font-weight: 900 !important; font-style: italic;
                    animation: wl-fadeUp 700ms cubic-bezier(0.16,1,0.3,1) 220ms forwards; }
      .wl-line-inline { display: inline-block; font-weight: 900 !important; animation: wl-fadeUp 700ms cubic-bezier(0.16,1,0.3,1) 120ms forwards; }
      .wl-line-white { color: var(--wl-text-strong); font-weight: 900; }
      .wl-line-gold  { color: var(--wl-accent); font-weight: 900; font-style: italic; }
      .wl-confirm-check { display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px; }
      @keyframes wl-fadeUp { to { opacity: 1; transform: translateY(0); } }

      .wl-sub {
        margin: 0; font-size: 16px; font-weight: 400; line-height: 1.55;
        color: var(--wl-text-muted); max-width: 420px;
        opacity: 0; animation: wl-fadeIn 700ms ease-out 380ms forwards;
      }
      .wl-accent-text { color: var(--wl-accent); }
      @keyframes wl-fadeIn { to { opacity: 1; } }

      .wl-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 16px 24px; border-radius: 12px;
        font-size: 16px; font-weight: 600; letter-spacing: -0.005em;
        text-decoration: none; cursor: pointer; transition: all 180ms ease;
        white-space: nowrap; border: 1px solid transparent;
        font-family: inherit;
      }
      .wl-btn-primary {
        background: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
        border-color: hsl(var(--primary));
        box-shadow: 0 1px 0 hsl(var(--primary-foreground) / 0.10) inset;
      }
      .wl-btn-primary:hover:not(:disabled) {
        background: hsl(var(--primary) / 0.92);
        border-color: hsl(var(--primary) / 0.92);
        transform: translateY(-1px);
      }
      .wl-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .wl-actions-block {
        width: 100%; max-width: 360px; margin-top: 8px;
        opacity: 0; animation: wl-fadeIn 700ms ease-out 720ms forwards;
      }

      .wl-marquee {
        width: 100vw; margin-left: calc(50% - 50vw); margin-top: 16px;
        overflow: hidden; position: relative;
        opacity: 0; animation: wl-fadeIn 700ms ease-out 300ms forwards;
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
                mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
      }
      .wl-marquee-track { display: flex; gap: 28px; width: max-content; animation: wl-marquee-scroll 38s linear infinite; }
      .wl-marquee-item { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; padding: 8px 0; }
      .wl-marquee-icon {
        width: 28px; height: 28px; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 8px;
        background: var(--wl-bullet-bg);
        border: 1px solid var(--wl-bullet-border);
      }
      .wl-marquee-title { font-size: 14px; font-weight: 600; color: var(--wl-text-strong); letter-spacing: -0.005em; }
      .wl-marquee-sub { font-size: 12px; font-weight: 400; color: var(--wl-text-subtle); }
      @keyframes wl-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-33.3333%); } }
      @media (prefers-reduced-motion: reduce) { .wl-marquee-track { animation: none; } }

      .wl-instructions {
        width: 100%; margin-top: 8px;
        padding: 16px 16px 16px;
        background: var(--wl-instructions-bg);
        border: 1px solid var(--wl-instructions-border);
        border-radius: 14px; text-align: left;
        opacity: 0; animation: wl-fadeUp 700ms cubic-bezier(0.16,1,0.3,1) 540ms forwards;
        transform: translateY(8px);
      }
      .wl-instructions-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
      .wl-instructions-eyebrow {
        font-size: 12px; font-weight: 700; letter-spacing: 0.18em;
        text-transform: uppercase; color: var(--wl-accent);
      }
      .wl-instructions-title { font-size: 14px; font-weight: 600; color: var(--wl-text-strong); letter-spacing: -0.005em; line-height: 1.35; }
      .wl-instructions-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .wl-instructions-item {
        display: flex; align-items: center; gap: 12px;
        opacity: 0; animation: wl-fadeUp 600ms cubic-bezier(0.16,1,0.3,1) forwards;
        transform: translateY(6px);
      }
      .wl-instructions-bullet {
        flex-shrink: 0; width: 30px; height: 30px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--wl-bullet-bg);
        border: 1px solid var(--wl-bullet-border);
        border-radius: 9px;
      }
      .wl-instructions-text { font-size: 14px; font-weight: 500; color: var(--wl-instructions-text); line-height: 1.4; letter-spacing: -0.005em; }

      .wl-form { width: 100%; display: flex; flex-direction: column; gap: 16px; margin-top: 8px; text-align: left;
        opacity: 0; animation: wl-fadeIn 600ms ease-out 380ms forwards; }
      .wl-field { display: flex; flex-direction: column; gap: 8px; }
      .wl-label {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 500; letter-spacing: 0.12em;
        color: var(--wl-text-subtle); text-transform: uppercase;
      }
      .wl-input {
        width: 100%; padding: 12px 16px; border-radius: 12px;
        background: var(--wl-input-bg);
        border: 1px solid var(--wl-input-border);
        color: var(--wl-text); font-size: 16px; font-family: inherit;
        outline: none; transition: border-color 160ms ease, background 160ms ease;
      }
      .wl-input:focus { border-color: var(--wl-accent); background: var(--wl-input-bg-focus); }
      .wl-input::placeholder { color: var(--wl-input-placeholder); }
      .wl-pwWrap { position: relative; }
      .wl-pwToggle {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        background: transparent; border: none; cursor: pointer;
        font-size: 12px; font-weight: 600; color: var(--wl-accent);
        padding: 8px 8px; border-radius: 8px; font-family: inherit;
      }
      .wl-pwToggle:hover { color: var(--wl-accent-hover); background: var(--wl-bullet-bg); }
      .wl-error {
        margin: 0; padding: 12px 12px; border-radius: 10px;
        background: var(--wl-error-bg);
        border: 1px solid var(--wl-error-border);
        color: var(--wl-error-text); font-size: 13px; line-height: 1.4; text-align: left;
      }
      .wl-error-block { margin-top: 16px; max-width: 360px; }

      .wl-chat-shell {
        width: 100%; height: 100%;
        display: flex; flex-direction: column;
        border-radius: 14px;
        border: 1px solid var(--wl-chat-shell-border);
        background: var(--wl-chat-shell-bg);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        overflow: hidden;
      }
      .wl-chat-header {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--wl-divider);
        background: var(--wl-bg-soft-2);
      }
      .wl-chat-avatar {
        width: 36px; height: 36px; flex-shrink: 0;
        border-radius: 50%;
        background: var(--wl-accent); color: var(--wl-on-accent);
        display: flex; align-items: center; justify-content: center;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
        overflow: hidden;
      }
      .wl-chat-avatar-img { background: var(--wl-charlie-bg); padding: 0; }
      .wl-chat-avatar-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .wl-chat-headerText { display: flex; flex-direction: column; gap: 4px; }
      .wl-chat-name { font-size: 14px; font-weight: 600; color: var(--wl-text-strong); letter-spacing: -0.005em; }
      .wl-chat-status { font-size: 11.5px; color: var(--wl-text-subtle); display: inline-flex; align-items: center; gap: 8px; }
      .wl-chat-dot {
        width: 7px; height: 7px; border-radius: 50%; background: #4ade80;
        box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.18);
      }
      .wl-chat-body {
        flex: 1; overflow-y: auto;
        padding: 16px 16px;
        display: flex; flex-direction: column; gap: 12px;
        scroll-behavior: smooth;
        -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 8%, rgba(0,0,0,0.55) 22%, #000 42%, #000 100%);
                mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 8%, rgba(0,0,0,0.55) 22%, #000 42%, #000 100%);
      }
      .wl-msg-row { display: flex; gap: 8px; align-items: flex-end; animation: wl-msgIn 250ms ease-out; }
      @keyframes wl-msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .wl-msg-row-user { justify-content: flex-end; }
      .wl-msg-avatar {
        width: 28px; height: 28px; flex-shrink: 0;
        border-radius: 50%;
        background: var(--wl-accent); color: var(--wl-on-accent);
        display: flex; align-items: center; justify-content: center;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 700;
        overflow: hidden;
      }
      .wl-msg-avatar-img { background: var(--wl-charlie-bg); }
      .wl-msg-avatar-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .wl-msg-stack { display: flex; flex-direction: column; gap: 8px; max-width: 78%; }
      .wl-msg-bubble {
        padding: 12px 16px; border-radius: 16px;
        font-size: 14px; line-height: 1.45;
        word-wrap: break-word;
      }
      .wl-msg-text { display: inline; }
      .wl-msg-charlie {
        background: var(--wl-charlie-bg);
        border: 1px solid var(--wl-charlie-border);
        color: var(--wl-charlie-text);
        border-bottom-left-radius: 6px;
      }
      .wl-msg-user {
        background: var(--wl-accent); color: var(--wl-on-accent);
        border-bottom-right-radius: 6px;
        font-weight: 500;
      }
      .wl-typing { display: inline-flex; gap: 4px; padding: 16px 16px; }
      .wl-typing span {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--wl-typing-dot);
        animation: wl-blink 1.2s infinite ease-in-out;
      }
      .wl-typing span:nth-child(2) { animation-delay: 0.15s; }
      .wl-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes wl-blink { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }

      .wl-illu {
        display: inline-flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 16px 20px; border-radius: 14px;
        background: var(--wl-illu-bg);
        border: 1px dashed var(--wl-illu-border);
        align-self: flex-start;
      }
      .wl-illu-shot {
        padding: 8px;
        background: var(--wl-illu-shot-bg);
        border: 1px solid var(--wl-illu-shot-border);
        border-radius: 12px;
        max-width: 100%;
      }
      .wl-illu-img {
        display: block; max-width: 100%; height: auto;
        border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.25);
      }
      .wl-illu-label {
        font-size: 11px; font-weight: 500; letter-spacing: 0.04em;
        color: var(--wl-accent);
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      }

      .wl-chat-input {
        border-top: 1px solid var(--wl-divider);
        background: var(--wl-bg-soft-2);
        padding: 12px 16px max(env(safe-area-inset-bottom, 12px), 12px);
      }
      .wl-chat-sendRow {
        width: 100%;
        display: flex; align-items: center; gap: 8px;
        padding: 8px 8px 8px 16px; border-radius: 12px;
        background: var(--wl-send-bg);
        border: 1px solid var(--wl-send-border);
        color: var(--wl-text); cursor: pointer;
        transition: all 180ms ease;
        font-family: inherit;
      }
      .wl-chat-sendRow:hover:not(:disabled) {
        background: var(--wl-send-bg-hover);
        border-color: var(--wl-accent);
      }
      .wl-chat-sendRow:disabled { opacity: 0.5; cursor: not-allowed; }
      .wl-chat-sendText {
        flex: 1; text-align: left;
        font-size: 16px; font-weight: 500;
        color: var(--wl-send-text);
      }
      .wl-chat-sendBtn {
        flex-shrink: 0;
        width: 36px; height: 36px; border-radius: 10px;
        background: var(--wl-accent); color: var(--wl-on-accent);
        display: inline-flex; align-items: center; justify-content: center;
        animation: wl-sendPulse 2s ease-in-out infinite;
      }
      @keyframes wl-sendPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(206,183,158,0.4); }
        50% { box-shadow: 0 0 0 6px rgba(206,183,158,0); }
      }
      .wl-chat-finalBtn { width: 100%; }

      .wl-steps { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 8px; }
      .wl-step {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px; border-radius: 12px;
        background: var(--wl-step-bg);
        border: 1px solid var(--wl-step-border);
      }
      .wl-step-num {
        flex-shrink: 0;
        width: 28px; height: 28px; border-radius: 50%;
        background: var(--wl-accent); color: var(--wl-on-accent);
        display: inline-flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      }
      .wl-step-text { font-size: 14px; line-height: 1.4; color: var(--wl-text-soft); }

      @media (prefers-reduced-motion: reduce) {
        .wl-glow, .wl-line, .wl-sub, .wl-actions-block, .wl-form,
        .wl-chat-sendBtn, .wl-msg-row {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}
