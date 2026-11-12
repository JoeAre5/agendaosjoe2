/** Reads the edge-function error body and returns a friendly message when the slot is already booked. */
export async function slotTakenMessage(prepErr: unknown, isEs: boolean): Promise<string | null> {
  try {
    const ctx = (prepErr as { context?: Response })?.context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.clone().json() : null;
    if (body?.error === "slot_taken") {
      return isEs
        ? "Ese horario acaba de ocuparse. Por favor, elige otra hora."
        : "That time was just taken. Please choose another time.";
    }
  } catch { /* ignore */ }
  return null;
}
