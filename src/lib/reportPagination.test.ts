import { expect, it } from "vitest";
import { readAllReportRows } from "./reportPagination";

it("includes records after the first 1,000 for monthly totals", async () => {
  const rows = Array.from({ length: 2100 }, (_, id) => ({ id, cents: 100 }));
  const result = await readAllReportRows(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
  expect(result.data.reduce((sum, row) => sum + row.cents, 0)).toBe(210000);
});
it("rejects partial results when a subsequent page fails", async () => {
  const result = await readAllReportRows(async from => from === 0 ? { data: Array(1000).fill(100), error: null } : { data: null, error: "unavailable" });
  expect(result.error).toBe("unavailable");
  expect(result.data).toEqual([]);
});