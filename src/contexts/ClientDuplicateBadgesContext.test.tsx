import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDuplicateBadgesProvider, useClientDuplicateBadges } from "./ClientDuplicateBadgesContext";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "owner-id" } as { id: string } | null, role: "owner" as string | null },
  rpc: vi.fn(), removeChannel: vi.fn(), event: undefined as (() => void) | undefined,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  removeChannel: mocks.removeChannel,
  channel: () => ({ on: (_type: string, _config: unknown, callback: () => void) => {
    mocks.event = callback;
    return { subscribe: () => ({}) };
  } }),
} }));

function Consumer() {
  const { count, refresh } = useClientDuplicateBadges();
  return <div><output>{count ?? "unknown"}</output><button onClick={() => void refresh()}>Refresh</button></div>;
}
function setup(consumers = 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={qc}><ClientDuplicateBadgesProvider>
    {Array.from({ length: consumers }, (_, i) => <Consumer key={i} />)}
  </ClientDuplicateBadgesProvider></QueryClientProvider>;
  return { ...render(tree()), tree, qc };
}
beforeEach(() => {
  mocks.auth = { user: { id: "owner-id" }, role: "owner" };
  mocks.rpc.mockReset().mockResolvedValue({ data: [{}, {}], error: null });
  mocks.removeChannel.mockReset();
  mocks.event = undefined;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("shared duplicate count lifecycle", () => {
  it("makes one initial authorized read for three consumers", async () => {
    setup(3);
    await waitFor(() => expect(screen.getAllByText("2")).toHaveLength(3));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("find_duplicate_client_groups");
  });
  it("does not read for barbers or signed-out sessions", async () => {
    mocks.auth.role = "barber";
    const view = setup();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.auth = { user: null, role: null };
    view.rerender(view.tree());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("removes an owner's visible count when the session changes", async () => {
    const view = setup();
    await screen.findByText("2");
    mocks.auth = { user: { id: "barber-id" }, role: "barber" };
    view.rerender(view.tree());
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });
  it("refreshes after a merge and reports a confirmed zero", async () => {
    setup();
    await screen.findByText("2");
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await act(async () => screen.getByText("Refresh").click());
    await screen.findByText("0");
  });
  it("coalesces client event bursts at 800ms and cleans up", async () => {
    const view = setup();
    await screen.findByText("2");
    vi.useFakeTimers();
    act(() => { mocks.event?.(); mocks.event?.(); mocks.event?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(799); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    act(() => mocks.event?.());
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.removeChannel).toHaveBeenCalled();
  });
  it("keeps the last known count on a failed background read", async () => {
    setup();
    await screen.findByText("2");
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("offline") });
    await act(async () => screen.getByText("Refresh").click());
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});