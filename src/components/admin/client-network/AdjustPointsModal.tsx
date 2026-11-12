// Manual points adjustment modal — uses admin_adjust_client_rewards RPC.
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Minus, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  clientId: string | null;
  isEs: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AdjustPointsModal({ open, clientId, isEs, onClose, onSaved }: Props) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setSign(1); setAmount(""); setReason(""); };

  const handleSave = async () => {
    if (!clientId) return;
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(isEs ? "Cantidad inválida." : "Invalid amount."); return;
    }
    if (!reason.trim()) {
      toast.error(isEs ? "Razón requerida." : "Reason required."); return;
    }
    setSaving(true);
    const { error } = await (supabase.rpc as any)("admin_adjust_client_rewards", {
      _client_id: clientId,
      _points: sign * n,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      console.warn(error);
      toast.error(isEs ? "No se pudo guardar el ajuste." : "Unable to save adjustment.");
      return;
    }
    toast.success(isEs ? "Ajuste guardado." : "Points adjustment saved.");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <div className="p-5">
          <div className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
            {isEs ? "Ajustar puntos" : "Adjust Client Points"}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {isEs ? "Los ajustes manuales se guardan en el ledger. El balance no se edita directamente." : "Manual adjustments are saved as ledger entries. Balance is never edited directly."}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setSign(1)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold"
              style={{ background: sign === 1 ? "var(--accent-color)" : "var(--bg-elevated)", color: sign === 1 ? "var(--bg-base)" : "var(--text-primary)" }}
            >
              <Plus size={13} /> {isEs ? "Agregar" : "Add points"}
            </button>
            <button
              onClick={() => setSign(-1)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold"
              style={{ background: sign === -1 ? "#ef4444" : "var(--bg-elevated)", color: sign === -1 ? "white" : "var(--text-primary)" }}
            >
              <Minus size={13} /> {isEs ? "Restar" : "Remove points"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[10px] uppercase font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Puntos" : "Points"}</div>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={isEs ? "Ej: 25" : "Enter amount"}
                className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Razón" : "Reason"}</div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={isEs ? "Ej: Ajuste por cortesía, corrección, promoción" : "Example: courtesy adjustment, correction, promotion"}
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>{isEs ? "Esta acción crea una entrada permanente en el ledger." : "This action will create a permanent ledger entry."}</span>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => { reset(); onClose(); }}
              className="flex-1 h-10 rounded-lg text-[12px] font-bold"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
            >
              {isEs ? "Cancelar" : "Cancel"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-10 rounded-lg text-[12px] font-bold disabled:opacity-60"
              style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}
            >
              {saving ? "..." : (isEs ? "Confirmar" : "Confirm Adjustment")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
