// Post-booking Client Portal onboarding (4 steps + splash).
//
// Mounts inside ClientPortalV2 whenever clients.onboarding_completed = false.
// Triggers right after a first-time client signs in / creates account via
// /citas/acceso. Captures profile preferences and routes to /app/cliente.
//
// Steps:
//   1. Preferred barber  (single select)         → clients.preferred_barber_id
//   2. Date of birth     (18+ wheel picker)      → clients.date_of_birth
//   3. Preferred payment (multi select)          → clients.preferred_payment_methods[]
//   4. Notifications     (native permission)     → notification fan-out flags
//
// Then: onboarding_completed = true + navigate(finishDestination).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Check, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { enablePush } from "@/lib/push";
import { toast } from "sonner";

import splashBg from "@/assets/onboarding/splash-bg.jpg";
import step1Bg from "@/assets/onboarding/step1-bg.jpg";
import step2Bg from "@/assets/onboarding/step2-bg.jpg";
import step3Bg from "@/assets/onboarding/step3-bg.jpg";
import step4Bg from "@/assets/onboarding/step4-bg.jpg";

const ACCENT = "#CEB79E";
const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// Production barber IDs (Charlie's Barbershop).
const BARBER_IDS = {
  charlie: "993f1c50-cf70-4e54-99a0-7057ed2a5b0c",
  hector: "9129755c-807a-41f6-86c6-60595362b98c",
  joseph: "d3956f41-6df9-40a1-bc28-e42a4b42b179",
} as const;

type BarberKey = keyof typeof BARBER_IDS | "none";
type PaymentMethod = "ath_movil" | "card" | "apple_pay" | "paypal";

interface ClientOnboardingProps {
  firstName: string | null;
  gender: string | null;
  onComplete: () => void;
  replay?: boolean;
  /** Per spec: final destination is the Client Portal home (/app/cliente). */
  finishDestination?: string;
}

/* ──────────────────────────  Primitives  ────────────────────────── */

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full transition-all"
          style={{
            width: i === current ? 22 : 6,
            height: 6,
            background: i === current ? ACCENT : "rgba(255,255,255,0.22)",
          }}
        />
      ))}
    </div>
  );
}

function CTAButton({
  label,
  onClick,
  disabled = false,
  loading = false,
  variant = "white",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "white" | "gradient";
}) {
  const isGradient = variant === "gradient";
  const background = disabled
    ? "rgba(255,255,255,0.08)"
    : isGradient
      ? // light beige (left) → dark beige (right)
        "linear-gradient(90deg, #6b4f35 0%, #a38463 50%, #CEB79E 100%)"
      : "#ffffff";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-4 text-base font-bold transition-all active:scale-[0.98]"
      style={{
        background,
        color: disabled ? "rgba(255,255,255,0.35)" : isGradient ? "#ffffff" : "#0a0a0a",
        borderRadius: 999,
        letterSpacing: "-0.2px",
        opacity: loading ? 0.7 : 1,
        boxShadow: disabled
          ? "none"
          : isGradient
            ? "0 10px 30px -10px rgba(206,183,158,0.55)"
            : "0 8px 24px -10px rgba(255,255,255,0.35)",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

function StepShell({
  step,
  bg,
  title,
  subtitle,
  children,
  cta,
}: {
  step: number;
  bg: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  cta: React.ReactNode;
}) {
  return (
    <motion.div
      key={`step-${step}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="absolute inset-0 flex flex-col"
    >
      {/* Background photo — pointer-events:none so it never captures touches.
          Do NOT set touch-action here; on iOS that can leave gesture state
          stuck after a tap and freeze nearby scrollers (the wheel picker). */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${bg})`,
          pointerEvents: "none",
        }}
      />
      {/* Readability gradient only — no recolor */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.10) 28%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.92) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        className="relative z-[1] flex flex-col flex-1 px-6"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 28px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        <div className="pt-2">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-white font-black leading-[1.05] mb-3"
            style={{
              fontSize: "clamp(28px, 8vw, 36px)",
              letterSpacing: "-1.2px",
              fontFamily: "'Montserrat', system-ui, sans-serif",
              maxWidth: "85%",
            }}
          >
            {title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="text-[15px] leading-relaxed mb-5"
            style={{ color: "rgba(255,255,255,0.6)", maxWidth: "80%" }}
          >
            {subtitle}
          </motion.p>
          {/* 5 dots total: dot 0 = "Crea tu cuenta" (paso previo en /bienvenido
              para referidos, o /citas/acceso para post-booking). Dots 1-4 son
              los pasos de este componente. */}
          <ProgressDots total={5} current={step} />
        </div>

        {/* Spacer pushes interactive content to bottom so the background subject stays visible */}
        <div className="flex-1" />

        <div className="pb-6">{children}</div>

        <div>{cta}</div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────  Pill option (single & multi)  ────────────────────────── */

function PillOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center justify-between text-left active:opacity-90"
      style={{
        width: "auto",
        maxWidth: "82%",
        minWidth: 240,
        minHeight: 56,
        padding: "16px 22px",
        borderRadius: 999,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        background: selected ? "rgba(206,183,158,0.14)" : "rgba(15,15,15,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${selected ? ACCENT : "rgba(255,255,255,0.10)"}`,
        color: "#fff",
        fontSize: 15,
        fontWeight: 500,
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <span className="pr-3">{label}</span>
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: 22,
          height: 22,
          border: `1.5px solid ${selected ? ACCENT : "rgba(255,255,255,0.28)"}`,
          background: selected ? ACCENT : "transparent",
        }}
      >
        {selected && <Check size={13} strokeWidth={3} color="#0a0a0a" />}
      </span>
    </motion.button>
  );
}

/* ──────────────────────────  Wheel date picker (Month/Day/Year)  ────────────────────────── */

const ITEM_H = 40;

function WheelColumn({
  items,
  value,
  onChange,
  ariaLabel,
  width,
  align = "center",
  italic = false,
}: {
  items: string[];
  value: number; // index
  onChange: (idx: number) => void;
  ariaLabel: string;
  width: number;
  align?: "left" | "center" | "right";
  italic?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<number | null>(null);
  const isUserScrolling = useRef(false);
  const [liveIdx, setLiveIdx] = useState(value);

  // Sync scroll position when value changes externally — only when user is idle.
  useEffect(() => {
    const el = ref.current;
    if (!el || isUserScrolling.current) return;
    const top = value * ITEM_H;
    if (Math.abs(el.scrollTop - top) > 2) {
      el.scrollTo({ top, behavior: "auto" });
    }
    setLiveIdx(value);
  }, [value]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    isUserScrolling.current = true;
    const rawIdx = el.scrollTop / ITEM_H;
    const visualIdx = Math.max(0, Math.min(items.length - 1, Math.round(rawIdx)));
    setLiveIdx(visualIdx);

    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      isUserScrolling.current = false;
      // Snap precisely once idle, then commit.
      const finalIdx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      const targetTop = finalIdx * ITEM_H;
      if (Math.abs(el.scrollTop - targetTop) > 1) {
        el.scrollTo({ top: targetTop, behavior: "smooth" });
      }
      onChange(finalIdx);
    }, 120);
  };

  // Reset stale "is scrolling" state any time a new touch begins, so the
  // wheel always responds immediately even right after tapping elsewhere.
  const handleTouchStart = () => {
    isUserScrolling.current = false;
    if (idleTimer.current) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onPointerDown={handleTouchStart}
      className="overflow-y-scroll no-scrollbar"
      style={{
        height: ITEM_H * 5,
        width,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        scrollSnapType: "y mandatory",
        overscrollBehavior: "contain",
        touchAction: "pan-y",
        pointerEvents: "auto",
        position: "relative",
        zIndex: 2,
       }}
    >
      <div style={{ paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2 }}>
        {items.map((it, i) => {
          const distance = Math.abs(i - liveIdx);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.25;
          const fontSize = distance === 0 ? 19 : distance === 1 ? 16 : 14;
          return (
            <div
              key={it + i}
              className="flex items-center"
              style={{
                height: ITEM_H,
                scrollSnapAlign: "center",
                justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
                color: "#fff",
                opacity,
                fontSize,
                fontWeight: distance === 0 ? 700 : 400,
                fontStyle: italic && distance !== 0 ? "italic" : "normal",
                fontFamily: "'Montserrat', system-ui, sans-serif",
                transition: "opacity 0.15s, font-size 0.15s",
              }}
            >
              {it}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DOBWheel({
  value,
  onChange,
  monthLabels,
}: {
  value: { month: number; day: number; year: number }; // month 1-12
  onChange: (next: { month: number; day: number; year: number }) => void;
  monthLabels: string[];
}) {
  const thisYear = new Date().getFullYear();
  // Years: from 1924 → current year. Most recent at bottom so default sits high in list.
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = 1924; y <= thisYear; y++) arr.push(y);
    return arr;
  }, [thisYear]);

  const daysInMonth = useMemo(() => {
    return new Date(value.year, value.month, 0).getDate();
  }, [value.year, value.month]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0")),
    [daysInMonth]
  );

  // Clamp day if month change made it invalid
  useEffect(() => {
    if (value.day > daysInMonth) onChange({ ...value, day: daysInMonth });
  }, [daysInMonth, value, onChange]);

  return (
    <div className="relative w-full flex items-center justify-center" style={{ height: ITEM_H * 5 }}>
      {/* Center selection highlight */}
      <div
        className="absolute left-4 right-4 pointer-events-none"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          height: ITEM_H,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 12,
        }}
      />
      <div className="flex items-center gap-4 relative z-[1]">
        <WheelColumn
          items={monthLabels}
          value={value.month - 1}
          onChange={(i) => onChange({ ...value, month: i + 1 })}
          ariaLabel="month"
          width={70}
          align="right"
          italic
        />
        <WheelColumn
          items={days}
          value={value.day - 1}
          onChange={(i) => onChange({ ...value, day: i + 1 })}
          ariaLabel="day"
          width={48}
        />
        <WheelColumn
          items={years.map(String)}
          value={years.indexOf(value.year)}
          onChange={(i) => onChange({ ...value, year: years[i] })}
          ariaLabel="year"
          width={70}
          align="left"
          italic
        />
      </div>
    </div>
  );
}

/* ──────────────────────────  Splash with typewriter logo  ────────────────────────── */

function Splash({ onDone }: { onDone: () => void }) {
  const FULL = "CHARLIE'S BARBERSHOP";
  const [typed, setTyped] = useState(0);
  const [splashReady, setSplashReady] = useState(false);
  const [stepsReady, setStepsReady] = useState(false);
  const typingDone = typed >= FULL.length;

  // 1) Load the splash background FIRST. Typing only starts once it's painted.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    const done = () => { if (!cancelled) setSplashReady(true); };
    img.onload = done;
    img.onerror = done;
    img.src = splashBg;
    return () => { cancelled = true; };
  }, []);

  // 2) Preload step backgrounds in parallel — required before leaving splash.
  useEffect(() => {
    let cancelled = false;
    const urls = [step1Bg, step2Bg, step3Bg, step4Bg];
    Promise.all(
      urls.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
          })
      )
    ).then(() => {
      if (!cancelled) setStepsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // 3) Typing animation — gated on splash bg being visible.
  useEffect(() => {
    if (!splashReady || typingDone) return;
    const t = window.setTimeout(() => setTyped((n) => n + 1), 70);
    return () => window.clearTimeout(t);
  }, [typed, typingDone, splashReady]);

  // 4) Advance as soon as typing finishes AND step bgs are ready.
  useEffect(() => {
    if (!typingDone || !stepsReady) return;
    const t = window.setTimeout(onDone, 350);
    return () => window.clearTimeout(t);
  }, [typingDone, stepsReady, onDone]);

  const apostropheIdx = FULL.indexOf("'");
  const splitAt = apostropheIdx + 2; // includes "'S "
  const written = FULL.slice(0, typed);
  const firstPart = written.slice(0, Math.min(typed, splitAt));
  const secondPart = typed > splitAt ? written.slice(splitAt) : "";

  return (
    <motion.div
      key="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-300"
        style={{ backgroundImage: `url(${splashBg})`, opacity: splashReady ? 1 : 0 }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.55) 100%)",
          opacity: splashReady ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />
      <div className="relative z-[1] flex-1 flex items-start justify-center" style={{ paddingTop: "22%" }}>
        <div
          className="flex items-baseline gap-2 px-6"
          style={{
            fontFamily: "'Montserrat', system-ui, sans-serif",
            letterSpacing: "-0.6px",
            whiteSpace: "nowrap",
            opacity: splashReady ? 1 : 0,
            transition: "opacity 0.25s",
          }}
        >
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>{firstPart}</span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 300, fontSize: 20 }}>
            {secondPart}
            <span
              className="inline-block ml-0.5"
              style={{
                width: 8,
                height: 16,
                background: ACCENT,
                transform: "translateY(2px)",
                animation: "blink 1s steps(1) infinite",
              }}
            />
          </span>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </motion.div>
  );
}

/* ──────────────────────────  Main  ────────────────────────── */

export default function ClientOnboarding({
  onComplete,
  replay = false,
  finishDestination = "/app/cliente",
}: ClientOnboardingProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useTranslation();
  const isEs = language !== "en";

  const [step, setStep] = useState(0); // 0=splash, 1..4
  const [submitting, setSubmitting] = useState(false);

  // Selections
  const [barber, setBarber] = useState<BarberKey | null>(null);
  const [dob, setDob] = useState<{ month: number; day: number; year: number }>(() => {
    const today = new Date();
    // Default to today → age 0 → button stays grayed until the user picks a valid 18+ date.
    return { month: today.getMonth() + 1, day: today.getDate(), year: today.getFullYear() };
  });
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  /* ────  Copy ──── */
  const copy = useMemo(() => {
    const monthsEs = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const monthsEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return isEs
      ? {
          step1: {
            title: "¿Tienes un barbero preferido?",
            sub: "Lo guardaremos en tu perfil para futuras visitas.",
            cta: "Continuar",
            options: [
              { key: "charlie" as const, label: "Charlie" },
              { key: "hector" as const, label: "Héctor" },
              { key: "joseph" as const, label: "Joseph" },
              { key: "none" as const, label: "Sin preferencia" },
            ],
          },
          step2: {
            title: "Fecha de nacimiento",
            sub: "Usaremos esta información para completar tu perfil.",
            cta: "Continuar",
            ageError: "Debes tener al menos 18 años para continuar.",
            months: monthsEs,
          },
          step3: {
            title: "Método de pago preferido",
            sub: "Escoge cómo prefieres pagar en tus próximas visitas.",
            cta: "Continuar",
            options: [
              { key: "ath_movil" as const, label: "ATH Móvil" },
              { key: "card" as const, label: "Tarjeta de crédito / débito" },
              { key: "apple_pay" as const, label: "Apple Pay" },
              { key: "paypal" as const, label: "PayPal" },
            ],
          },
          step4: {
            title: "Activa tus notificaciones",
            sub: "Solo falta encender notificaciones para confirmaciones y recordatorios.",
            cta: "Activar notificaciones",
          },
        }
      : {
          step1: {
            title: "Do you have a preferred barber?",
            sub: "We'll save it to your profile for future visits.",
            cta: "Continue",
            options: [
              { key: "charlie" as const, label: "Charlie" },
              { key: "hector" as const, label: "Héctor" },
              { key: "joseph" as const, label: "Joseph" },
              { key: "none" as const, label: "No preference" },
            ],
          },
          step2: {
            title: "Date of birth",
            sub: "We'll use this information to complete your profile.",
            cta: "Continue",
            ageError: "You must be at least 18 years old to continue.",
            months: monthsEn,
          },
          step3: {
            title: "Preferred payment method",
            sub: "Choose how you prefer to pay for future visits.",
            cta: "Continue",
            options: [
              { key: "ath_movil" as const, label: "ATH Móvil" },
              { key: "card" as const, label: "Credit / Debit Card" },
              { key: "apple_pay" as const, label: "Apple Pay" },
              { key: "paypal" as const, label: "PayPal" },
            ],
          },
          step4: {
            title: "Turn on notifications",
            sub: "All that's left is turning on notifications for confirmations and reminders.",
            cta: "Turn on notifications",
          },
        };
  }, [isEs]);

  /* ──── DOB validation ──── */
  const dobValid = useMemo(() => {
    const d = new Date(dob.year, dob.month - 1, dob.day);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const age =
      now.getFullYear() - d.getFullYear() -
      (now.getMonth() < d.getMonth() ||
      (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
        ? 1
        : 0);
    return age >= 18;
  }, [dob]);

  /* ──── Persistence ──── */
  const updateClient = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!user) return;
      const { data } = await supabase
        .from("clients")
        .select("id, onboarding_completed_at")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!data) return;
      const finalPatch = { ...patch };
      if (replay && data.onboarding_completed_at && "onboarding_completed_at" in finalPatch) {
        delete (finalPatch as Record<string, unknown>).onboarding_completed_at;
      }
      await supabase.from("clients").update(finalPatch as never).eq("id", data.id);
    },
    [user, replay]
  );

  const persistStep1 = useCallback(async () => {
    if (!barber) return;
    await updateClient({
      preferred_barber_id: barber === "none" ? null : BARBER_IDS[barber],
    });
  }, [barber, updateClient]);

  const persistStep2 = useCallback(async () => {
    const iso = `${dob.year}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")}`;
    await updateClient({ date_of_birth: iso });
  }, [dob, updateClient]);

  const persistStep3 = useCallback(async () => {
    await updateClient({
      preferred_payment_methods: methods,
      preferred_payment_method: methods[0] ?? null,
    });
  }, [methods, updateClient]);

  const finish = useCallback(async () => {
    await updateClient({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    });
    onComplete();
    navigate(finishDestination);
  }, [updateClient, onComplete, navigate, finishDestination]);

  const persistNotifications = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await enablePush(isEs ? "es" : "en");
      const enabled = result.ok;
      await updateClient({
        notifications_enabled: enabled,
        notifications_permission_asked: true,
        notify_push_appointments: enabled,
        notify_sms_appointments: enabled,
        notify_whatsapp_appointments: enabled,
        notify_email_appointments: enabled,
        notify_sms_marketing: enabled,
        notify_whatsapp_marketing: enabled,
        notify_email_marketing: enabled,
      });
      if (!enabled) {
        const reason = (result as { ok: false; reason: string }).reason;
        if (reason === "denied") toast(isEs ? "Notificaciones desactivadas." : "Notifications disabled.");
        else if (reason === "ios-needs-pwa") toast(isEs ? "Instala la app primero para recibir notificaciones." : "Install the app first to receive notifications.");
      }
    } catch {
      await updateClient({
        notifications_enabled: false,
        notifications_permission_asked: true,
      });
    }
    await finish();
  }, [isEs, updateClient, finish]);

  /* ──── Step machine ──── */
  const goNext = async () => {
    if (step === 1) { await persistStep1(); setStep(2); return; }
    if (step === 2) { if (!dobValid) return; await persistStep2(); setStep(3); return; }
    if (step === 3) { await persistStep3(); setStep(4); return; }
  };

  /* Step 1 no longer auto-advances — user must tap the CTA button
     so they can change their barber selection before continuing. */

  /* ──── Disable pinch / double-tap zoom while onboarding is mounted ──── */
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const prev = meta?.getAttribute("content") ?? null;
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
      );
    }
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", prevent as any);
    document.addEventListener("gesturechange", prevent as any);
    document.addEventListener("gestureend", prevent as any);
    return () => {
      if (meta && prev !== null) meta.setAttribute("content", prev);
      document.removeEventListener("gesturestart", prevent as any);
      document.removeEventListener("gesturechange", prevent as any);
      document.removeEventListener("gestureend", prevent as any);
    };
  }, []);

  /* ──── Render ──── */
  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden flex justify-center"
      style={{ background: "#000", touchAction: "manipulation" }}
    >
      <div className="w-full max-w-[430px] h-full relative">
        <AnimatePresence mode="wait">
          {step === 0 && <Splash key="splash" onDone={() => setStep(1)} />}

          {step === 1 && (
            <StepShell
              step={1}
              bg={step1Bg}
              title={copy.step1.title}
              subtitle={copy.step1.sub}
              cta={<CTAButton label={copy.step1.cta} onClick={goNext} disabled={!barber} />}
            >
              <div className="flex flex-col items-start gap-3">
                {copy.step1.options.map((opt) => (
                  <PillOption
                    key={opt.key}
                    label={opt.label}
                    selected={barber === opt.key}
                    onClick={() => setBarber(opt.key)}
                  />
                ))}
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              step={2}
              bg={step2Bg}
              title={copy.step2.title}
              subtitle={copy.step2.sub}
              cta={
                <>
                  {!dobValid && (
                    <p
                      className="text-center text-xs mb-3"
                      style={{ color: "#fca5a5" }}
                    >
                      {copy.step2.ageError}
                    </p>
                  )}
                  <CTAButton label={copy.step2.cta} onClick={goNext} disabled={!dobValid} />
                </>
              }
            >
              <div className="mt-4">
                <DOBWheel value={dob} onChange={setDob} monthLabels={copy.step2.months} />
              </div>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              step={3}
              bg={step4Bg}
              title={copy.step3.title}
              subtitle={copy.step3.sub}
              cta={
                <CTAButton
                  label={copy.step3.cta}
                  onClick={goNext}
                  disabled={methods.length === 0}
                />
              }
            >
              <div className="flex flex-col items-start gap-3">
                {copy.step3.options.map((opt) => {
                  const sel = methods.includes(opt.key);
                  return (
                    <PillOption
                      key={opt.key}
                      label={opt.label}
                      selected={sel}
                      onClick={() =>
                        setMethods((cur) =>
                          sel ? cur.filter((m) => m !== opt.key) : [...cur, opt.key]
                        )
                      }
                    />
                  );
                })}
              </div>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              step={4}
              bg={step3Bg}
              title={copy.step4.title}
              subtitle={copy.step4.sub}
              cta={
                <CTAButton
                  label={copy.step4.cta}
                  onClick={persistNotifications}
                  loading={submitting}
                  variant="gradient"
                />
              }
            >
              <div className="flex-1 flex items-center justify-center">
                <motion.button
                  type="button"
                  onClick={persistNotifications}
                  disabled={submitting}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  aria-label={copy.step4.cta}
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 64,
                    height: 64,
                    background: "rgba(206,183,158,0.14)",
                    border: `1px solid ${ACCENT}`,
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <Bell size={24} strokeWidth={1.5} color={ACCENT} />
                </motion.button>
              </div>
            </StepShell>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
