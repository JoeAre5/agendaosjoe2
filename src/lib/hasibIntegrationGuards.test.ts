import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards for the Hasib review: Charlie stays on Acuity, and the excluded
// cutover pieces never slip in with a later merge.
const fns = readdirSync("supabase/functions");
const migrations = readdirSync("supabase/migrations").join("\n");

describe("Hasib integration exclusions", () => {
  it("keeps every Acuity function Charlie's shop depends on", () => {
    for (const name of ["acuity-proxy", "acuity-sync", "acuity-webhook", "acuity-block-sync", "acuity-sync-services", "find-acuity-duplicates-for-client"]) {
      expect(fns).toContain(name);
    }
  });
  it("does not include the global switch that turns Acuity off for every shop", () => {
    expect(migrations).not.toMatch(/d1_shops_off_acuity/);
  });
  it("keeps the Acuity staff audit log written by the proxy", () => {
    expect(readFileSync("supabase/functions/acuity-proxy/index.ts", "utf8")).toContain("acuity_operator_log");
  });
  it("does not add development login or reset/seed files", () => {
    expect(existsSync("docs/ByHasib/DEV_LOGINS.txt")).toBe(false);
    expect(existsSync("scripts/dev-reset.mjs")).toBe(false);
    expect(existsSync("supabase/seed.sql")).toBe(false);
  });
  it("does not route bookings through native scheduling yet", () => {
    expect(existsSync("src/lib/scheduling/index.ts")).toBe(false);
    expect(fns).not.toContain("native-scheduling");
  });
});
