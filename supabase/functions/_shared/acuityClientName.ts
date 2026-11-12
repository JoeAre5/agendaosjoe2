// Deliberately narrow correction approved by Charlie. Shared phone numbers and
// even shared client links can belong to relatives: neither establishes a name.
const FRANCISCO_CLIENT_ID = "7e24edf8-4b18-46f4-bcdc-b860c5a6013b";

export function preserveFranciscoName(
  row: Record<string, unknown>,
  existing: { client_id?: string | null; client_name?: string | null } | null | undefined,
): void {
  const clientId = existing?.client_id ?? row.client_id;
  const name = typeof row.client_name === "string" ? row.client_name.trim().replace(/\s+/g, " ") : "";
  if (clientId !== FRANCISCO_CLIENT_ID || !/^(emmet|francisco) morales$/i.test(name)) return;
  row.client_name = "Francisco Morales";
}