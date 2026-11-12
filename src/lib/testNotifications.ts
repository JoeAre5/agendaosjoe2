import { enablePush, getPushSupport } from "@/lib/push";

export async function prepareCurrentDeviceForPushTest(language: "es" | "en") {
  const support = getPushSupport();
  if (support !== "supported") {
    return { ok: false as const, reason: support };
  }

  const result = await enablePush(language);
  if (result.ok !== true) {
    return { ok: false as const, reason: result.reason };
  }

  return { ok: true as const };
}

export function pushTestSetupMessage(reason: string, language: "es" | "en") {
  const es = language === "es";
  if (reason === "ios-needs-pwa") {
    return es
      ? "En iPhone, abre esta pantalla desde la app instalada para recibir la prueba en este dispositivo."
      : "On iPhone, open this screen from the installed app to receive the test on this device.";
  }
  if (reason === "denied") {
    return es
      ? "El navegador tiene las notificaciones bloqueadas para este dispositivo."
      : "This browser has notifications blocked for this device.";
  }
  return es
    ? "Este dispositivo no pudo activar notificaciones push."
    : "This device could not enable push notifications.";
}

export function noTestDevicesMessage(language: "es" | "en") {
  return language === "es"
    ? "No hay dispositivos activos para tu cuenta admin. Activa push en este dispositivo y vuelve a probar."
    : "No active devices for your admin account. Enable push on this device and test again.";
}