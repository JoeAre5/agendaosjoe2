import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import type { ConflictAppt } from "@/lib/conflictCheck";

interface Props {
  open: boolean;
  conflicts: ConflictAppt[];
  isEs: boolean;
  mayOverride: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onExitComplete: () => void;
}

export function StaffOverlapPopup({ open, conflicts, isEs, mayOverride, onCancel, onConfirm, onExitComplete }: Props) {
  const reducedMotion = useReducedMotion();
  const summaryRef = useRef(conflicts);
  if (open) summaryRef.current = conflicts;
  const visibleConflicts = open ? conflicts : summaryRef.current;
  const transition = { duration: reducedMotion ? 0 : 0.2, ease: "easeOut" as const };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence onExitComplete={onExitComplete}>
          {open && (
            <DialogPrimitive.Overlay key="overlap-backdrop" forceMount asChild>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}
                className="staff-overlap-backdrop fixed inset-0 z-[100]" />
            </DialogPrimitive.Overlay>
          )}
          {open && (
            <DialogPrimitive.Content key="overlap-card" forceMount asChild onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("staff-overlap-cancel")?.focus();
            }}>
              <motion.div initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.95, y: reducedMotion ? 0 : 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 8 }}
                transition={transition}
                className="staff-overlap-card fixed inset-0 z-[101] m-auto h-fit max-h-[calc(100dvh_-_48px)] w-[calc(100%_-_48px)] max-w-[340px] overflow-y-auto p-6 outline-none">
                <div className="flex flex-col items-center text-center gap-3">
                  <span className="staff-overlap-pill rounded-[10px] px-3.5 py-1 text-[11px] font-semibold">
                    {isEs ? "Confirmación" : "Confirmation"}
                  </span>
                  <AlertTriangle size={40} className="staff-overlap-warning my-1 icon-bold" aria-hidden="true" />
                  <DialogPrimitive.Title className="text-xl font-bold leading-tight">
                    {isEs ? "Conflicto de horario" : "Scheduling conflict"}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="staff-overlap-muted text-[13px] leading-relaxed">
                    {isEs
                      ? `Este barbero ya tiene ${visibleConflicts.length === 1 ? "una cita" : `${visibleConflicts.length} citas`} en este horario:`
                      : `This barber already has ${visibleConflicts.length === 1 ? "an appointment" : `${visibleConflicts.length} appointments`} at this time:`}
                  </DialogPrimitive.Description>
                </div>
                <div className="my-5 max-h-48 overflow-y-auto divide-y staff-overlap-summary">
                  {visibleConflicts.map((conflict) => (
                    <div key={conflict.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold break-words">{conflict.client_name}</p>
                      <p className="staff-overlap-muted text-xs leading-relaxed mt-1 break-words">{conflict.service_name}</p>
                      <p className="staff-overlap-muted text-xs mt-1">
                        {formatInTimeZone(conflict.starts_at, "America/Puerto_Rico", "h:mm")}–{formatInTimeZone(conflict.ends_at, "America/Puerto_Rico", "h:mma").toLowerCase()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {mayOverride && <Button className="staff-overlap-confirm w-full min-h-11 text-sm font-semibold" onClick={onConfirm}>
                    {isEs ? "Reservar igual" : "Book anyway"}
                  </Button>}
                  <Button id="staff-overlap-cancel" variant="outline" className="staff-overlap-cancel w-full min-h-11 text-sm font-semibold" onClick={onCancel}>
                    {isEs ? "Cancelar" : "Cancel"}
                  </Button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}