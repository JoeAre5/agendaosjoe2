type AcuityAddonPayload = { addonIDs?: unknown; addons?: unknown };

export function resolveAcuityAddonNames(appt: AcuityAddonPayload, catalog: unknown): string[] | undefined {
  if (appt.addonIDs != null) {
    if (!Array.isArray(appt.addonIDs)) throw new Error("Invalid Acuity addonIDs");
    const ids = [...new Set(appt.addonIDs.map((value) => {
      if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid add-on ID");
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid add-on ID");
      return id;
    }))];
    if (!ids.length) return [];
    if (!Array.isArray(catalog)) throw new Error("Acuity add-on catalog unavailable");
    return ids.map((id) => {
      const match = catalog.find((a) => a && Number(a.id) === id);
      if (typeof match?.name !== "string" || !match.name.trim()) throw new Error(`Unresolved Acuity add-on ${id}`);
      return match.name.trim();
    });
  }
  if (appt.addons == null) return undefined;
  if (!Array.isArray(appt.addons)) throw new Error("Invalid Acuity addons");
  return appt.addons.map((addon) => {
    const name = typeof addon === "string" ? addon : addon?.name;
    if (typeof name !== "string" || !name.trim()) throw new Error("Unnamed Acuity add-on");
    return name.trim();
  });
}

// One lazy catalog request per invocation/batch. Unknown data is omitted from
// updates, never interpreted as removal, and never blocks scheduling or payment.
export function createAcuityAddonResolver(loadCatalog: () => Promise<unknown>, onError: (error: unknown) => void) {
  let catalogPromise: Promise<unknown> | undefined;
  return async (appt: AcuityAddonPayload): Promise<string[] | undefined> => {
    try {
      let catalog: unknown;
      if (Array.isArray(appt.addonIDs) && appt.addonIDs.length > 0) {
        catalogPromise ??= loadCatalog();
        catalog = await catalogPromise;
      }
      return resolveAcuityAddonNames(appt, catalog);
    } catch (error) {
      onError(error);
      return undefined;
    }
  };
}