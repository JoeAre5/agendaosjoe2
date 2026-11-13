// Identificadores de complementos guardados en edit_line_items.
// Acuity usa enteros ("12345"); las tiendas nativas usan el uuid de service_addons.id.
// Convertir TODO con Number() deja los uuid como NaN y el complemento "desaparece" al reabrir la edicion.

export type AddonId = number | string;

const INTEGER_ID = /^-?\d+$/;

/** Entero si el id es de Acuity; el mismo texto si es un uuid nativo. */
export function parseSavedAddonId(raw: unknown): AddonId {
  const text = String(raw ?? "");
  return INTEGER_ID.test(text) ? Number(text) : text;
}

/** Solo los ids nativos (uuid), para escribir appointments.addon_ref_ids. */
export function nativeAddonRefIds(ids: readonly AddonId[]): string[] {
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}
