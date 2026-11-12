// Confirmation popup shown after a successful newsletter subscription.
// Renders into a single full-screen portal on document.body so it sits above
// every stacking context (page transitions, sticky nav, sticky booking bar).
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import AnimatedCheckmark from "@/components/ui/AnimatedCheckmark";
import { usePreferences } from "@/hooks/usePreferences";
const bgDark = "/assets/payment-bg-dark.webp";
const bgLight = "/assets/payment-bg-light.webp";

interface Props {
  isEs: boolean;
  email: string;
  onClose: () => void;
}

const PILL_BG = "rgba(201,168,130,0.15)";
const PILL_FG = "rgba(160,128,96,1)";
const TOP_LAYER_Z = 2147483647;

export default function NewsletterConfirmationPopup({ isEs, email, onClose }: Props) {
  const { resolvedTheme } = usePreferences();
  const bg = resolvedTheme === "dark" ? bgDark : bgLight;
  const tintColor =
    resolvedTheme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.25)";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: TOP_LAYER_Z,
        isolation: "isolate",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Backdrop — clickable to dismiss */}
      <motion.button
        type="button"
        aria-label={isEs ? "Cerrar" : "Close"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "default",
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            background: tintColor,
          }}
        />
      </motion.button>

      {/* Card — fully above backdrop */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 340,
          background: "#ffffff",
          borderRadius: 28,
          boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
          padding: "28px 24px 24px",
        }}
      >
        <div className="flex justify-center mb-3">
          <span
            className="text-[11px] font-semibold tracking-wide px-3.5 py-1"
            style={{ borderRadius: 10, background: PILL_BG, color: PILL_FG }}
          >
            {isEs ? "Confirmación" : "Confirmation"}
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="my-2">
            <AnimatedCheckmark size={56} color="#22c55e" />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-[22px] font-black text-center uppercase"
            style={{ color: "#111111", letterSpacing: "-1px", fontFamily: "Montserrat, system-ui, sans-serif" }}
          >
            {isEs ? "¡Suscripción confirmada!" : "Subscription confirmed!"}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-[13px] text-center px-2"
            style={{ color: "rgba(0,0,0,0.55)" }}
          >
            {isEs
              ? "Te enviaremos los próximos titulares y novedades directo a tu inbox."
              : "We'll send the next headlines and updates straight to your inbox."}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.35 }}
            className="w-full mt-3 rounded-2xl p-4"
            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(0,0,0,0.4)" }}>
                {isEs ? "Email" : "Email"}
              </span>
              <span
                className="block w-full text-left"
                style={{
                  color: "#111111",
                  fontWeight: 600,
                  // Shrink to fit so long emails are fully readable (no ellipsis).
                  fontSize: `${Math.max(10, Math.min(14, 14 - Math.max(0, email.length - 24) * 0.22))}px`,
                  wordBreak: "break-all",
                  lineHeight: 1.25,
                }}
                title={email}
              >
                {email}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.3 }}
            className="w-full flex flex-col gap-2 mt-3"
          >
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center font-semibold transition-all active:scale-[0.97]"
              style={{
                background: "#000000",
                color: "#ffffff",
                fontSize: 13,
                padding: "11px 0",
                borderRadius: "var(--radius-control)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {isEs ? "Listo" : "Done"}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
