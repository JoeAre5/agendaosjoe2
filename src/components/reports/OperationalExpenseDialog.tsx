import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { expenseAmountCents, validExpense, validExpenseSchedule, type ExpenseFrequency } from "@/lib/operationalExpenses";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { prToday } from "@/lib/homePeriods";

export type OperationalExpense = Database["public"]["Tables"]["operational_expenses"]["Row"];

export function OperationalExpenseDialog({ open, onOpenChange, defaultDate, expense, es, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; defaultDate?: string;
  expense?: OperationalExpense | null; es: boolean; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(expense?.title ?? "");
    setAmount(expense ? (expense.amount_cents / 100).toFixed(2) : "");
    setDate(expense?.expense_date ?? defaultDate ?? format(prToday(), "yyyy-MM-dd"));
    setDescription(expense?.description ?? "");
    setFrequency(expense?.frequency === "once" || expense?.frequency === "daily" || expense?.frequency === "weekly" ? expense.frequency : "monthly");
  }, [open, expense, defaultDate]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const cents = expenseAmountCents(amount);
    if (saving || cents === null || !validExpense(title, amount, date) || !validExpenseSchedule(frequency, date, "", description)) return;
    setSaving(true);
    try {
      const { data: contexts, error: contextError } = await supabase.rpc("get_home_expense_context");
      const context = contexts?.[0];
      if (contextError || !context) throw contextError ?? new Error("No expense context");
      const payload = { title: title.trim(), amount_cents: cents, expense_date: date, description: description.trim(), frequency, end_date: null, shop_id: context.shop_id };
      const query = expense
        ? supabase.from("operational_expenses").update(payload).eq("id", expense.id).eq("shop_id", context.shop_id).select("id").single()
        : supabase.from("operational_expenses").insert(payload).select("id").single();
      const { error } = await query;
      if (error) throw error;
      toast.success(es ? "Gasto guardado" : "Expense saved");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(es ? "No se pudo guardar el gasto. Intenta nuevamente." : "Could not save the expense. Please try again.");
    } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
    <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm rounded-lg max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{expense ? (es ? "Editar gasto" : "Edit expense") : (es ? "Añadir gasto" : "Add expense")}</DialogTitle><DialogDescription>{es ? "Gasto operativo" : "Operating expense"}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="expense-title">{es ? "Título" : "Title"}</Label><Input id="expense-title" className="text-base" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} required disabled={saving} /></div>
        <div className="space-y-1.5"><Label htmlFor="expense-description">{es ? "Descripción (opcional)" : "Description (optional)"}</Label><Textarea id="expense-description" className="text-base resize-none" rows={2} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} /></div>
        <div className="space-y-1.5"><Label htmlFor="expense-amount">{es ? "Cantidad ($)" : "Amount ($)"}</Label><Input id="expense-amount" className="text-base" inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required disabled={saving} /></div>
        <div className="space-y-1.5"><Label htmlFor="expense-frequency">{es ? "Frecuencia" : "Frequency"}</Label><Select value={frequency} onValueChange={value => { if (value === "once" || value === "daily" || value === "weekly" || value === "monthly") { setFrequency(value); } }} disabled={saving}><SelectTrigger id="expense-frequency" className="h-11 text-base"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="once">{es ? "Una sola vez" : "Once"}</SelectItem><SelectItem value="daily">{es ? "Diario" : "Daily"}</SelectItem><SelectItem value="weekly">{es ? "Semanal" : "Weekly"}</SelectItem><SelectItem value="monthly">{es ? "Mensual" : "Monthly"}</SelectItem></SelectContent></Select></div>
        {frequency === "once" && <div className="space-y-1.5 min-w-0"><Label htmlFor="expense-date">{frequency === "once" ? (es ? "Fecha" : "Date") : (es ? "Fecha de inicio" : "Start date")}</Label><Input id="expense-date" className="text-base min-w-0 w-full max-w-full" type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={saving} /></div>}
        {expense && frequency !== "once" && <p className="text-xs text-muted-foreground">{es ? "Cambiar este gasto actualiza las estimaciones anteriores de Inicio. Cuadre y nóminas finalizadas no cambian." : "Changing this expense updates past Home estimates. Accounting and finalized payroll stay unchanged."}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>{es ? "Cancelar" : "Cancel"}</Button><Button type="submit" disabled={saving || !validExpense(title, amount, date) || !validExpenseSchedule(frequency, date, "", description)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{es ? "Guardar gasto" : "Save expense"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}