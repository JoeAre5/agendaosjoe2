type CatalogFetch = (path: string) => Promise<{ ok: boolean; data: unknown }>;

/** Acuity v1 exposes the complete catalog, not /appointment-types/:id. */
export async function readAvailabilityDuration(
  fetchCatalog: CatalogFetch,
  appointmentTypeID: number,
  addonIDs: number[],
): Promise<number | null> {
  const [types, addons] = await Promise.all([
    fetchCatalog("/appointment-types"),
    addonIDs.length ? fetchCatalog("/appointment-addons") : Promise.resolve({ ok: true, data: [] }),
  ]);
  if (!types.ok || !Array.isArray(types.data) || !addons.ok || !Array.isArray(addons.data)) return null;
  const type = types.data.find((row) => Number(row.id) === appointmentTypeID);
  const base = Number(type?.duration);
  if (!Number.isFinite(base) || base <= 0) return null;
  let total = base;
  for (const id of new Set(addonIDs)) {
    const addon = addons.data.find((row) => Number(row.id) === id);
    const minutes = Number(addon?.duration);
    if (!addon || !Number.isFinite(minutes) || minutes < 0) return null;
    total += minutes;
  }
  return total;
}