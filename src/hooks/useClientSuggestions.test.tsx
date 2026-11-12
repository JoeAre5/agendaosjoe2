import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClientSuggestions } from "./useClientSuggestions";

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));

const row = (id = "current-profile", email: string | null = "person@placeholder.local") => ({
  id, first_name: "Francisco", last_name: "Morales", phone: "7875550100", email, acuity_client_id: 123,
});

function response(value: Promise<unknown> | unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockImplementation(() => Promise.resolve(value)),
  };
  mock.rpc.mockReturnValueOnce(builder);
  return builder;
}

async function search(result: { current: ReturnType<typeof useClientSuggestions> }, term: string) {
  act(() => result.current.search(term));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

describe("current authorized appointment suggestions", () => {
  beforeEach(() => { vi.useFakeTimers(); mock.rpc.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("uses the authorized current-profile source and retains UUID separately from Acuity id", async () => {
    const builder = response({ data: [row()], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner-session"));
    await search(result, "Francisco");
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_clients_barber_safe");
    expect(builder.limit).toHaveBeenCalledWith(10);
    expect(result.current.results[0]).toMatchObject({ id: "current-profile", acuityClientId: 123, email: "" });
  });

  it.each(["x@placeholder.local", " X@PLACEHOLDERS.LOCAL ", null])("leaves synthetic or missing contact email blank: %s", async (email) => {
    response({ data: [row("current", email)], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner"));
    await search(result, "Francisco");
    expect(result.current.results[0]?.email).toBe("");
  });

  it("preserves a real email and profiles without email", async () => {
    response({ data: [row("real", " Real@example.com "), row("blank", null)], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner"));
    await search(result, "Francisco");
    expect(result.current.results.map(c => [c.id, c.email])).toEqual([["real", "Real@example.com"], ["blank", ""]]);
  });

  it("queries again and replaces renamed/merged/deleted suggestions without cached fallback", async () => {
    response({ data: [row("old")], error: null });
    response({ data: [{ ...row("survivor"), first_name: "Updated" }], error: null });
    response({ data: [], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner"));
    await search(result, "Morales");
    expect(result.current.results[0]?.id).toBe("old");
    await search(result, "Morales");
    expect(result.current.results[0]).toMatchObject({ id: "survivor", firstName: "Updated" });
    await search(result, "Morales");
    expect(result.current.results).toEqual([]);
    expect(mock.rpc).toHaveBeenCalledTimes(3);
  });

  it("fails closed on read error instead of returning old suggestions", async () => {
    response({ data: [row()], error: null });
    response({ data: null, error: { message: "permission denied" } });
    const { result } = renderHook(() => useClientSuggestions("barber"));
    await search(result, "Francisco");
    await search(result, "Morales");
    expect(result.current.results).toEqual([]);
    expect(result.current.failed).toBe(true);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });

  it("ignores an older response that arrives after a newer search", async () => {
    let resolveOld: ((v: unknown) => void) | undefined;
    response(new Promise(resolve => { resolveOld = resolve; }));
    response({ data: [row("new")], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner"));
    await search(result, "old");
    await search(result, "new");
    await act(async () => { resolveOld?.({ data: [row("old")], error: null }); });
    expect(result.current.results[0]?.id).toBe("new");
    expect(result.current.searching).toBe(false);
  });

  it("cancels pending searches on selection, short input and unmount", async () => {
    const { result, unmount } = renderHook(() => useClientSuggestions("owner"));
    act(() => { result.current.search("Francisco"); result.current.clear(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await search(result, "F");
    act(() => result.current.search("Morales"));
    unmount();
    await vi.advanceTimersByTimeAsync(300);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("clears results and pending reads when the session changes", async () => {
    response({ data: [row()], error: null });
    const { result, rerender } = renderHook(({ session }) => useClientSuggestions(session), { initialProps: { session: "owner" as string | null } });
    await search(result, "Francisco");
    rerender({ session: null });
    expect(result.current.results).toEqual([]);
    await search(result, "Morales");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("searches formatted phone digits and safely quotes multi-word names", async () => {
    const phone = response({ data: [], error: null });
    const name = response({ data: [], error: null });
    const { result } = renderHook(() => useClientSuggestions("owner"));
    await search(result, "(787) 555-0100");
    expect(phone.ilike).toHaveBeenCalledWith("phone", "%7%8%7%5%5%5%0%1%0%0%");
    await search(result, 'Francisco Morales",id.neq.fake');
    expect(name.or).toHaveBeenCalledTimes(2);
    expect(name.or.mock.calls[1][0]).toContain('Morales\\",id.neq.fake');
  });
});