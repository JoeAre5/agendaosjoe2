import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointmentId: string;
  balanceCents: number;
  brand: string;
  last4: string;
  es: boolean;
  onPaid: () => void;
  onSendLink: () => void;
};

export default function SavedCardChargeSheet({ open, onOpenChange, appointmentId, balanceCents, brand, last4, es, onPaid, onSendLink }: Props) {
  const [tipPct, setTipPct] = useState<number | "other">(0);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"declined" | "auth" | null>(null);
  const [idem, setIdem] = useState(() => crypto.randomUUID());

  const tipCents = tipPct === "other" ? Math.max(0, Math.round(Number(other || 0) * 100)) : Math.round(balanceCents * tipPct / 100);
  const total = balanceCents + tipCents;
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  const charge = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("staff-charge-saved-card", {
      body: { appointment_id: appointmentId, tip_cents: tipCents, idempotency_key: idem },
    });
    setBusy(false);
    const code = (data as any)?.error || (await (error as any)?.context?.json?.().catch(() => null))?.error;
    if (!error && (data as any)?.success) {
      toast.success(es ? `Cobro de ${fmt(total)} completado` : `Charged ${fmt(total)}`);
      onOpenChange(false);
      onPaid();
      return;
    }
    setIdem(crypto.randomUUID()); // a new attempt only after a definitive failure
    if (code === "authentication_required") setOutcome("auth");
    else if (code === "declined") setOutcome("declined");
    else toast.error(es ? "No se pudo completar el cobro. Revisa el saldo antes de intentar otra vez." : "Charge failed. Check the balance before retrying.");
  };

  const pill = (active: boolean) => ({
    background: active ? "var(--cta-bg)" : "var(--bg-surface-2)",
    color: active ? "var(--cta-fg)" : "var(--text-primary)",
  });

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) setOutcome(null); onOpenChange(o); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{es ? `Cobrar a ${brand} •••• ${last4}` : `Charge ${brand} •••• ${last4}`}</DrawerTitle>
        </DrawerHeader>
        <div className="px-5 pb-8 space-y-4">
          {outcome ? (
            <>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {outcome === "auth"
                  ? (es ? "El banco pide que el cliente confirme este pago. Envíale un enlace de pago." : "The bank needs the client to confirm. Send a payment link.")
                  : (es ? "La tarjeta fue rechazada. Usa otro método de pago." : "Card declined. Use another payment method.")}
              </p>
              <button className="w-full py-3 rounded-xl text-sm font-semibold" style={pill(true)}
                onClick={() => { onOpenChange(false); setOutcome(null); if (outcome === "auth") onSendLink(); }}>
                {outcome === "auth" ? (es ? "Enviar enlace de pago" : "Send payment link") : (es ? "Entendido" : "OK")}
              </button>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                <span>{es ? "Saldo" : "Balance"}</span><span>{fmt(balanceCents)}</span>
              </div>
              <div>
                <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>{es ? "Propina" : "Tip"}</p>
                <div className="grid grid-cols-4 gap-2">
                  {([0, 15, 20, "other"] as const).map((p) => (
                    <button key={p} className="py-2 rounded-xl text-xs font-semibold" style={pill(tipPct === p)} onClick={() => setTipPct(p)}>
                      {p === "other" ? (es ? "Otra" : "Other") : `${p}%`}
                    </button>
                  ))}
                </div>
                {tipPct === "other" && (
                  <Input className="mt-2" inputMode="decimal" placeholder="0.00" value={other} onChange={(e) => setOther(e.target.value)} aria-label={es ? "Propina en dólares" : "Tip in dollars"} />
                )}
              </div>
              <div className="flex justify-between text-base font-bold" style={{ color: "var(--text-primary)" }}>
                <span>Total</span><span>{fmt(total)}</span>
              </div>
              <button disabled={busy} className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50" style={pill(true)} onClick={charge}>
                {busy ? (es ? "Cobrando..." : "Charging...") : (es ? `Confirmar cobro de ${fmt(total)}` : `Confirm ${fmt(total)} charge`)}
              </button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
