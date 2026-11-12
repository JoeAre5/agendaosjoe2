/**
 * Retention/Outreach-only complete reader. Fetches 1,000-row pages with a
 * bounded number of requests in flight instead of one after another, and
 * fails closed: any failed page rejects the whole read. Pages are fetched in
 * order-stable ranges; if the last expected page is full (rows added during the
 * read), it keeps reading sequentially until a short page arrives.
 * Accounting keeps using the shared sequential reportPagination helper.
 */
export const RETENTION_PAGE = 1000;
export const RETENTION_CONCURRENCY = 4;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function readAllRowsBounded<T>(
  count: () => PromiseLike<{ count: number | null; error: unknown }>,
  page: (from: number, to: number) => PageResult<T>,
  concurrency = RETENTION_CONCURRENCY,
): Promise<{ data: T[]; error: unknown }> {
  const c = await count();
  if (c.error || c.count === null) return { data: [], error: c.error ?? "count_unavailable" };
  const expectedPages = Math.max(1, Math.ceil(c.count / RETENTION_PAGE));
  const pages: T[][] = new Array(expectedPages);
  let next = 0;
  let failed: unknown = null;
  const worker = async () => {
    while (failed === null) {
      const i = next++;
      if (i >= expectedPages) return;
      const r = await page(i * RETENTION_PAGE, i * RETENTION_PAGE + RETENTION_PAGE - 1);
      if (r.error) { failed = r.error; return; }
      pages[i] = r.data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, expectedPages) }, worker));
  if (failed !== null) return { data: [], error: failed };
  const rows = pages.flat();
  let last = pages[expectedPages - 1];
  let from = expectedPages * RETENTION_PAGE;
  while (last.length === RETENTION_PAGE) {
    const r = await page(from, from + RETENTION_PAGE - 1);
    if (r.error) return { data: [], error: r.error };
    last = r.data ?? [];
    rows.push(...last);
    from += RETENTION_PAGE;
  }
  return { data: rows, error: null };
}
