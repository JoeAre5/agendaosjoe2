import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { ClientMatch } from "@/lib/clientMatching";

interface Props {
  open: boolean;
  match: ClientMatch | null;
  /** Called when user agrees to link. Receives the matched client_id. */
  onConfirm: () => void;
  /** Called when user wants to keep this as a separate (new) profile. */
  onKeepSeparate: () => void;
  /** Optional: hide the "keep separate" option (used in flows where a new profile is undesirable). */
  hideKeepSeparate?: boolean;
  busy?: boolean;
}

/**
 * Shared confirmation prompt fired by every appointment surface when
 * findMatchingClient() returns 'email' or 'phone' (partial match).
 *
 * Copy is intentionally minimal — we never reveal which field matched, only
 * the existing client's display name.
 */
export function ClientMatchConfirmDialog({
  open,
  match,
  onConfirm,
  onKeepSeparate,
  hideKeepSeparate = false,
  busy = false,
}: Props) {
  const { language } = useTranslation();
  const name = match?.displayName || (language === "es" ? "este cliente" : "this client");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onKeepSeparate(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {language === "es" ? "¿Es la misma persona?" : "Same person?"}
          </DialogTitle>
          <DialogDescription>
            {language === "es"
              ? `Este contacto coincide con ${name}. ¿Quieres enlazar esta cita a ese perfil?`
              : `This contact matches ${name}. Link this appointment to that profile?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onConfirm} disabled={busy} className="w-full">
            {language === "es" ? `Sí, enlazar a ${name}` : `Yes, link to ${name}`}
          </Button>
          {!hideKeepSeparate && (
            <Button
              variant="outline"
              onClick={onKeepSeparate}
              disabled={busy}
              className="w-full"
            >
              {language === "es" ? "Mantener separado" : "Keep separate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
