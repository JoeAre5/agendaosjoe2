import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Repeat } from "lucide-react";

export type ProgressAction = "create" | "edit" | "reschedule" | "cancel";

interface Props {
  open: boolean;
  action: ProgressAction;
  current: number;
  total: number;
  language: "es" | "en";
  accentColor?: string;
}

/**
 * Friendly bilingual progress modal shown during bulk recurring operations.
 * Same blurred-backdrop card style used elsewhere in the app
 * (pill + title + rotating supportive phrases + live counter).
 */
const PHRASES_ES: Record<ProgressAction, string[]> = {
  create: [
    "Ajustando tu agenda…",
    "Asegurándome que todo cuadre…",
    "No te preocupes, yo me encargo…",
    "Estoy aquí para ayudarte…",
    "Vas a quedar bien complacido…",
    "Reservando cada fecha con cuidado…",
    "Casi listo, dame un segundo…",
  ],
  edit: [
    "Aplicando los cambios…",
    "Sincronizando todas las citas…",
    "No te preocupes, yo me encargo…",
    "Asegurándome que todo cuadre…",
    "Actualizando una por una…",
    "Vas a quedar bien complacido…",
  ],
  reschedule: [
    "Reprogramando tu serie…",
    "Moviendo cada cita con calma…",
    "No te preocupes, yo me encargo…",
    "Asegurándome que todo cuadre…",
    "Casi terminamos…",
  ],
  cancel: [
    "Cancelando con cuidado…",
    "Limpiando tu agenda…",
    "No te preocupes, yo me encargo…",
    "Removiendo cada cita una por una…",
    "Casi listo…",
  ],
};

const PHRASES_EN: Record<ProgressAction, string[]> = {
  create: [
    "Adjusting your schedule…",
    "Making sure everything adds up…",
    "Don't worry, I got this…",
    "I'm here to help you…",
    "You'll be pleased when I'm done…",
    "Booking each date carefully…",
    "Almost there, one second…",
  ],
  edit: [
    "Applying your changes…",
    "Syncing every appointment…",
    "Don't worry, I got this…",
    "Making sure everything adds up…",
    "Updating one by one…",
    "You'll be pleased when I'm done…",
  ],
  reschedule: [
    "Rescheduling your series…",
    "Moving each appointment carefully…",
    "Don't worry, I got this…",
    "Making sure everything adds up…",
    "Almost done…",
  ],
  cancel: [
    "Cancelling carefully…",
    "Clearing your schedule…",
    "Don't worry, I got this…",
    "Removing each appointment one by one…",
    "Almost done…",
  ],
};

const TITLES_ES: Record<ProgressAction, string> = {
  create: "Creando citas recurrentes",
  edit: "Aplicando cambios",
  reschedule: "Reprogramando serie",
  cancel: "Cancelando serie",
};
const TITLES_EN: Record<ProgressAction, string> = {
  create: "Creating recurring appointments",
  edit: "Applying changes",
  reschedule: "Rescheduling series",
  cancel: "Cancelling series",
};

const PILLS_ES: Record<ProgressAction, string> = {
  create: "Recurrente",
  edit: "Editando",
  reschedule: "Reprogramando",
  cancel: "Cancelando",
};
const PILLS_EN: Record<ProgressAction, string> = {
  create: "Recurring",
  edit: "Editing",
  reschedule: "Rescheduling",
  cancel: "Cancelling",
};

export default function RecurringProgressModal({
  open,
  action,
  current,
  total,
  language,
  accentColor = "var(--accent-color)",
}: Props) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const phrases = (language === "es" ? PHRASES_ES : PHRASES_EN)[action];
  const title = (language === "es" ? TITLES_ES : TITLES_EN)[action];
  const pill = (language === "es" ? PILLS_ES : PILLS_EN)[action];

  useEffect(() => {
    if (!open) return;
    setPhraseIdx(0);
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % phrases.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [open, phrases.length]);

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
          style={{
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="w-full max-w-[360px] rounded-3xl overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
            }}
          >
            <div className="px-6 pt-6 pb-5 text-center">
              {/* Pill */}
              <div className="flex justify-center mb-4">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-3 py-1 rounded-full"
                  style={{ background: `${accentColor}1F`, color: accentColor }}
                >
                  <Repeat size={11} />
                  {pill}
                </span>
              </div>

              {/* Title */}
              <p className="text-[16px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                {title}
              </p>

              {/* Rotating phrase */}
              <div className="h-[36px] flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={phraseIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35 }}
                    className="text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {phrases[phraseIdx]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Counter */}
              <div className="mt-4 mb-2 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: accentColor }} />
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? `${current} de ${total}` : `${current} of ${total}`}
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ background: "var(--bg-surface-2)" }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  className="h-full rounded-full"
                  style={{ background: accentColor }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
