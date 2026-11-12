/**
 * AdminDevicePushCard — lets owner/admin enable web push on the current device.
 *
 * Mirrors the toggle UX in PerfilTab but tied to the admin's clients row
 * (notifyOwners targets clients whose auth_user_id has role='owner').
 *
 * Shows iOS PWA hint when applicable and an unsupported message otherwise.
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { StandardToggle } from "@/components/ui/StandardToggle";
import {
  enablePush,
  disablePush,
  getPushSupport,
  hasActivePushSubscription,
} from "@/lib/push";

interface Props {
  language: "es" | "en";
}

export function AdminDevicePushCard({ language }: Props) {
  const es = language === "es";
  const [support, setSupport] = useState<ReturnType<typeof getPushSupport>>("supported");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(getPushSupport());
    hasActivePushSubscription().then(setOn).catch(() => setOn(false));
  }, []);

  async function toggle(next: boolean) {
    if (busy) return;
    const prev = on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      if (next) {
        const res = await enablePush(language);
        if (res.ok) {
          toast.success(es ? "Notificaciones activadas en este dispositivo" : "Notifications enabled on this device");
          return;
        }
        setOn(prev);
        const reason = (res as { reason: string }).reason;
        if (reason === "denied") {
          toast.error(es ? "Permiso denegado en el navegador" : "Permission denied in browser");
        } else if (reason === "ios-needs-pwa") {
          toast.error(es ? "Añade la app a tu pantalla de inicio primero" : "Add the app to your home screen first");
        } else {
          toast.error(es ? "No se pudo activar" : "Could not enable");
        }
      } else {
        await disablePush();
        toast.success(es ? "Notificaciones desactivadas en este dispositivo" : "Notifications disabled on this device");
      }
    } catch {
      setOn(prev);
    } finally {
      setBusy(false);
    }
  }

  const hint =
    support === "ios-needs-pwa"
      ? es
        ? "En iPhone, añade la app a la pantalla de inicio para recibir notificaciones."
        : "On iPhone, add the app to your home screen to receive notifications."
      : support === "unsupported"
      ? es
        ? "Este navegador no admite notificaciones push."
        : "This browser does not support push notifications."
      : on
      ? es
        ? "Recibirás un push por cada cita nueva del sitio público o portal."
        : "You'll get a push for every new appointment from the public site or portal."
      : es
      ? "Activa para recibir push de citas nuevas en este dispositivo."
      : "Turn on to receive push for new appointments on this device.";

  const disabled = support !== "supported";

  return (
    <div className="mx-4 mb-3 rounded-xl card-elevated p-4 flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "var(--bg-surface-2)" }}
      >
        <Bell size={16} className="icon-bold" style={{ color: "var(--text-primary)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {es ? "Push en este dispositivo" : "Push on this device"}
          </div>
          <StandardToggle
            checked={on}
            onChange={toggle}
            disabled={disabled || busy}
            ariaLabel={es ? "Activar notificaciones push" : "Enable push notifications"}
          />
        </div>
        <div className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {hint}
        </div>
      </div>
    </div>
  );
}
