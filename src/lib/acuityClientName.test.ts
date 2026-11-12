import { describe, expect, it } from "vitest";
import { preserveFranciscoName } from "../../supabase/functions/_shared/acuityClientName";

const client_id = "7e24edf8-4b18-46f4-bcdc-b860c5a6013b";
describe("approved Francisco name protection", () => {
  it("keeps Francisco when incoming Acuity calls him Emmet", () => {
    const row = { client_name: "EMMET MORALES" };
    preserveFranciscoName(row, { client_id, client_name: "Francisco Morales" });
    expect(row.client_name).toBe("Francisco Morales");
  });
  it("covers webhook pre-resolved Francisco without an existing appointment", () => {
    const row = { client_id, client_name: "Emmet Morales" };
    preserveFranciscoName(row, null);
    expect(row.client_name).toBe("Francisco Morales");
  });
  it("does not rename Deriel even when he shares the client link", () => {
    const row = { client_name: "Deriel Alfonzo" };
    preserveFranciscoName(row, { client_id });
    expect(row.client_name).toBe("Deriel Alfonzo");
  });
  it("does not rename another Emmet or infer identity from a shared phone", () => {
    const row = { client_name: "Emmet Morales", client_phone: "+17876690783" };
    preserveFranciscoName(row, { client_id: "another-client" });
    expect(row.client_name).toBe("Emmet Morales");
  });
  it("changes only the name, leaving identity, payment and appointment snapshots intact", () => {
    const row = { client_id, client_name: "Emmet Morales", price_cents: 5000, amount_paid_cents: 2000,
      payment_confirmed: true, tip_cents: 700, starts_at: "2026-11-07T12:00:00-04:00", edit_line_items: [{ price_cents: 5000 }] };
    const before = structuredClone(row);
    preserveFranciscoName(row, { client_id });
    expect(row).toEqual({ ...before, client_name: "Francisco Morales" });
  });
});