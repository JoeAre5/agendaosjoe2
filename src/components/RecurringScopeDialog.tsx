import { AnimatePresence, motion } from "motion/react";
import { Repeat } from "lucide-react";

export type RecurringScope = "this_only" | "all_future";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Action being performed, used to tailor copy (delete/edit/reschedule). */
  action: "delete" | "edit" | "reschedule";
  language: "es" | "en";
  onChoose: (scope: RecurringScope) => void;
  accentColor?: string;
}

/**
 * AgendaOS unified centered modal for recurring scope selection.
 * Matches the pill + title + subtitle + buttons hierarchy used elsewhere
 * (e.g. RecurringProgressModal).
 */
export default function RecurringScopeDialog({
  open,
  onOpenChange,
  action,
  language,
  onChoose,
  accentColor = "var(--accent-color)",
}: Props) {
  const isEs = language === "es";

  const pillByAction: Record<typeof action, string> = {
    delete: isEs ? "Cancelar" : "Cancel",
    edit: isEs ? "Editar" : "Edit",
    reschedule: isEs ? "Reprogramar" : "Reschedule",
  };

  const titleByAction: Record<typeof action, string> = {
    delete: isEs ? "Cita recurrente" : "Recurring appointment",
    edit: isEs ? "Cita recurrente" : "Recurring appointment",
    reschedule: isEs ? "Cita recurrente" : "Recurring appointment",
  };

  const subtitleByAction: Record<typeof action, string> = {
    delete: isEs
      ? "¿Quieres cancelar solo esta cita o todas las futuras?"
      : "Cancel just this one or all future ones?",
    edit: isEs
      ? "¿Aplicar los cambios a esta cita o a todas las futuras?"
      : "Apply changes to this one or all future ones?",
    reschedule: isEs
      ? "¿Reprogramar solo esta cita o todas las futuras?"
      : "Reschedule just this one or all future ones?",
  };

  const thisLabel = isEs ? "Solo esta cita" : "Only this appointment";
  const allLabel = isEs ? "Todas las futuras" : "All future appointments";
  const cancelLabel = isEs ? "Cancelar" : "Cancel";

  const isDelete = action === "delete";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-3xl overflow-hidden"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.08)",
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
                  {pillByAction[action]}
                </span>
              </div>

              {/* Title */}
              <p
                className="text-[16px] font-bold mb-1"
                style={{ color: "#0a0a0a" }}
              >
                {titleByAction[action]}
              </p>

              {/* Subtitle */}
              <p
                className="text-[13px] mb-5"
                style={{ color: "#6b7280" }}
              >
                {subtitleByAction[action]}
              </p>

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    onChoose("this_only");
                    onOpenChange(false);
                  }}
                  className="w-full py-3 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity"
                  style={{
                    background: isDelete ? "#ef4444" : "#0a0a0a",
                    color: "#ffffff",
                  }}
                >
                  {thisLabel}
                </button>
                <button
                  onClick={() => {
                    onChoose("all_future");
                    onOpenChange(false);
                  }}
                  className="w-full py-3 rounded-xl text-[14px] font-semibold active:opacity-70 transition-opacity"
                  style={{
                    background: "#f3f4f6",
                    color: "#0a0a0a",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  {allLabel}
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium active:opacity-60 transition-opacity"
                  style={{ color: "#6b7280" }}
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
