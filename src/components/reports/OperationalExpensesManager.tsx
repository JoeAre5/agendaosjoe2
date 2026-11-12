import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Pencil, Plus, Trash2, Loader2, CircleStop, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readAllReportRows } from "@/lib/reportPagination";
import { homeRange, prToday } from "@/lib/homePeriods";
import { expenseContributions, frequencyLabel } from "@/lib/operationalExpenses";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OperationalExpenseDialog, type OperationalExpense } from "./OperationalExpenseDialog";
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function OperationalExpensesManager({ es }: { es: boolean }) {
  const month = homeRange(prToday(), "month");
  const [entries, setEntries] = useState<OperationalExpense[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<OperationalExpense | null>(null);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<{ entry: OperationalExpense; kind: "delete" | "toggle" } | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { data, error: contextError } = await supabase.rpc("get_home_expense_context");
      const context = data?.[0];
      if (contextError || !context) throw contextError ?? new Error("No expense context");
      const result = await readAllReportRows((from, to) => supabase.from("operational_expenses").select("*").eq("shop_id", context.shop_id).order("title").order("id").range(from, to));
      if (result.error) throw result.error;
      setEntries(result.data); setShopId(context.shop_id);
    } catch { setError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const contributions = useMemo(() => expenseContributions(entries, month.start, month.end), [entries, month.start.getTime(), month.end.getTime()]);
  const contributionMap = new Map(contributions.map(e => [e.id, e.period_cents]));
  async function mutate() {
    if (!shopId || !action || saving) return;
    setSaving(true);
    try {
      const query = action.kind === "delete"
        ? supabase.from("operational_expenses").delete().eq("id", action.entry.id).eq("shop_id", shopId).select("id").single()
        : supabase.from("operational_expenses").update({ is_active: !action.entry.is_active }).eq("id", action.entry.id).eq("shop_id", shopId).select("id").single();
      const { error } = await query;
      if (error) throw error;
      setAction(null); await load(); toast.success(action.kind === "delete" ? (es ? "Gasto eliminado" : "Expense deleted") : (es ? "Gastos actualizados" : "Expenses updated"));
    } catch { toast.error(es ? "No se pudo actualizar el gasto" : "Could not update the expense"); }
    finally { setSaving(false); }
  }
  return <section className="space-y-5 pb-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-foreground">{es ? "Gastos operativos" : "Operating expenses"}</h3><Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />{es ? "Añadir gasto" : "Add expense"}</Button></div>
    {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : error ? <div className="text-sm text-muted-foreground">{es ? "No se pudieron cargar los gastos." : "Could not load expenses."}<Button variant="ghost" onClick={load}>{es ? "Reintentar" : "Retry"}</Button></div> : <>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">{es ? "Sin gastos registrados" : "No recorded expenses"}</p>}
      {entries.map(entry => <div key={entry.id} className="border-b border-border pb-4 space-y-2"><div className="flex items-start gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground break-words">{entry.title}</p><p className="text-xs text-muted-foreground mt-1">{money(entry.amount_cents)} · {frequencyLabel(entry.frequency, es)}{!entry.is_active ? (es ? " · Inactivo" : " · Inactive") : ""}</p></div><Button size="icon" variant="ghost" aria-label={`${es ? "Editar" : "Edit"} ${entry.title}`} title={es ? "Editar gasto" : "Edit expense"} onClick={() => { setEditing(entry); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>{entry.frequency !== "once" && <Button size="icon" variant="ghost" disabled={saving} aria-label={`${entry.is_active ? (es ? "Desactivar" : "Deactivate") : (es ? "Activar" : "Activate")} ${entry.title}`} title={entry.is_active ? (es ? "Pausar gasto" : "Pause expense") : (es ? "Reactivar gasto" : "Reactivate expense")} onClick={() => setAction({ entry, kind: "toggle" })}>{entry.is_active ? <CircleStop className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>}<Button size="icon" variant="ghost" disabled={saving} aria-label={`${es ? "Eliminar" : "Delete"} ${entry.title}`} title={es ? "Eliminar gasto permanentemente" : "Permanently delete expense"} onClick={() => setAction({ entry, kind: "delete" })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>{entry.description && <p className="text-xs text-muted-foreground break-words">{entry.description}</p>}{entry.frequency === "once" && <p className="text-xs text-muted-foreground">{entry.expense_date}</p>}<div className="flex justify-between gap-3 text-xs text-foreground"><span>{es ? "A separar este mes" : "Set aside this month"}</span><span className="font-semibold whitespace-nowrap">{money(contributionMap.get(entry.id) ?? 0)}</span></div></div>)}
      <div className="pt-2 space-y-1" aria-label={es ? "Total costo mensual" : "Total monthly cost"}><p className="text-sm font-semibold text-foreground">{es ? "Total costo mensual" : "Total monthly cost"}</p><p className="text-2xl font-bold text-foreground">{money(contributions.reduce((sum, e) => sum + e.period_cents, 0))}</p><p className="text-xs text-muted-foreground capitalize">{format(month.start, "MMMM yyyy", { locale: es ? esLocale : undefined })}</p></div>
    </>}
    <OperationalExpenseDialog open={open} onOpenChange={setOpen} expense={editing} es={es} onSaved={load} />
    <Dialog open={!!action} onOpenChange={value => { if (!value && !saving) setAction(null); }}><DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm rounded-lg"><DialogHeader><DialogTitle>{action?.kind === "delete" ? (es ? "¿Eliminar gasto?" : "Delete expense?") : action?.entry.is_active ? (es ? "¿Desactivar gasto?" : "Deactivate expense?") : (es ? "¿Activar gasto?" : "Activate expense?")}</DialogTitle><DialogDescription className="break-words">{action?.entry.title}{action?.kind === "delete" && <span className="block mt-2">{es ? "Este gasto se eliminará permanentemente. También dejará de incluirse en Inicio y en futuras exportaciones de P&L, incluso para períodos anteriores. No se puede deshacer." : "This expense will be permanently deleted. It will also be removed from Home and future P&L exports, including past periods. This cannot be undone."}</span>}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setAction(null)}>{es ? "Cancelar" : "Cancel"}</Button><Button variant={action?.kind === "delete" ? "destructive" : "default"} disabled={saving} onClick={mutate}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{action?.kind === "delete" ? (es ? "Eliminar permanentemente" : "Delete permanently") : (es ? "Confirmar" : "Confirm")}</Button></div></DialogContent></Dialog>
  </section>;
}
