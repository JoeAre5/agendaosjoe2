import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationalExpensesManager } from "./OperationalExpensesManager";

const fixture = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[], fail: false, deleted: vi.fn(), updated: vi.fn(), filters: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./OperationalExpenseDialog", () => ({ OperationalExpenseDialog: () => null }));
vi.mock("@/lib/reportPagination", () => ({ readAllReportRows: async () => ({ data: fixture.entries, error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{ shop_id: "shop-1" }], error: null }),
  from: (table: string) => {
    let remove = false;
    const chain = {
      delete: () => { remove = true; fixture.deleted(table); return chain; },
      update: (payload: unknown) => { fixture.updated(payload); return chain; },
      eq: (key: string, value: unknown) => { fixture.filters(key, value); return chain; },
      select: () => chain,
      single: async () => {
        if (!fixture.fail && remove) fixture.entries = [];
        return { data: fixture.fail ? null : { id: "expense-1" }, error: fixture.fail ? new Error("denied") : null };
      },
    };
    return chain;
  },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.fail = false;
  fixture.entries = [{ id: "expense-1", title: "Electricidad", amount_cents: 10000, frequency: "monthly", is_active: true, expense_date: "2026-11-10" }];
});
afterEach(cleanup);

async function requestDelete() {
  render(<OperationalExpensesManager es />);
  fireEvent.click(await screen.findByRole("button", { name: "Eliminar Electricidad" }));
}

describe("permanent expense deletion", () => {
  it.each(["once", "daily", "weekly", "monthly"])("permanently deletes %s expenses instead of pausing", async frequency => {
    fixture.entries[0].frequency = frequency;
    await requestDelete();
    expect(fixture.deleted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar permanentemente" }));
    await waitFor(() => expect(screen.queryByText("Electricidad")).not.toBeInTheDocument());
    expect(fixture.deleted).toHaveBeenCalledWith("operational_expenses");
    expect(fixture.filters).toHaveBeenCalledWith("id", "expense-1");
    expect(fixture.filters).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(fixture.updated).not.toHaveBeenCalled();
  });

  it("deletes paused expenses too", async () => {
    fixture.entries[0].is_active = false;
    await requestDelete();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar permanentemente" }));
    await waitFor(() => expect(fixture.entries).toHaveLength(0));
  });

  it("cancel leaves the expense unchanged", async () => {
    await requestDelete();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fixture.deleted).not.toHaveBeenCalled();
    expect(fixture.entries).toHaveLength(1);
  });

  it("failed deletion keeps the expense", async () => {
    fixture.fail = true;
    await requestDelete();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar permanentemente" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Eliminar permanentemente" })).not.toBeDisabled());
    expect(fixture.entries).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Eliminar Electricidad" })).toBeInTheDocument();
  });

  it("pause continues to update status without deleting", async () => {
    render(<OperationalExpensesManager es />);
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar Electricidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(fixture.updated).toHaveBeenCalledWith({ is_active: false }));
    expect(fixture.deleted).not.toHaveBeenCalled();
  });
});