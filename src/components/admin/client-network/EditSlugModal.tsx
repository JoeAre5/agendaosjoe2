// Edit referral slug modal — admin uses admin_update_referral_slug RPC.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Check, X } from "lucide-react";

interface Props {
  open: boolean;
  row: any | null;
  isEs: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditSlugModal({ open, row, isEs, onClose, onSaved }: Props) {
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<null | boolean>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (row) { setSlug(row.slug); setReason(""); setAvailable(null); } }, [row, open]);

  useEffect(() => {
    if (!slug || !row) { setAvailable(null); return; }
    if (slug === row.slug) { setAvailable(true); return; }
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) { setAvailable(false); return; }
    setChecking(true);
    const h = setTimeout(async () => {
      const { data } = await (supabase.rpc as any)("check_referral_slug_available", { _slug: slug });
      setAvailable(!!(data as any)?.available);
      setChecking(false);
    }, 300);
    return () => clearTimeout(h);
  }, [slug, row]);

  const save = async () => {
    if (!row || !available) return;
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)("admin_update_referral_slug", {
      _owner_type: row.owner_type,
      _owner_id: row.owner_id,
      _new_slug: slug,
      _reason: reason || null,
    });
    setSaving(false);
    if (error || !(data as any)?.ok) {
      toast.error(isEs ? "No se pudo actualizar." : "Unable to update slug.");
      return;
    }
    toast.success(isEs ? "Enlace actualizado." : "Slug updated.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0" style={{ background: "var(--bg-base)" }}>
        <div className="p-5">
          <div className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{isEs ? "Editar enlace de referido" : "Edit Referral Slug"}</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {isEs ? "Cambiar el enlace no afecta atribuciones existentes." : "Changing the slug does not change existing attribution."}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[10px] uppercase font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Nuevo enlace" : "New Slug"}</div>
              <div className="flex items-center gap-2 rounded-lg px-3 h-10" style={{ background: "var(--bg-elevated)" }}>
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>/r/</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="flex-1 bg-transparent text-[13px] outline-none font-mono" style={{ color: "var(--text-primary)" }} />
                {checking ? null : available === true ? <Check size={14} style={{ color: "#22c55e" }} /> :
                  available === false ? <X size={14} style={{ color: "#ef4444" }} /> : null}
              </div>
              {available === false && (
                <div className="text-[10px] mt-1" style={{ color: "#ef4444" }}>
                  {isEs ? "Este enlace ya está en uso o tiene formato inválido." : "This link is already in use or has invalid format."}
                </div>
              )}
              {available === true && slug !== row?.slug && (
                <div className="text-[10px] mt-1" style={{ color: "#22c55e" }}>
                  {isEs ? "Este enlace está disponible." : "This link is available."}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>{isEs ? "Razón" : "Reason"}</div>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={isEs ? "Ej: Solicitud del cliente" : "Example: client request"}
                className="w-full h-10 rounded-lg px-3 text-[13px] outline-none" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }} />
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg text-[12px] font-bold" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
              {isEs ? "Cancelar" : "Cancel"}
            </button>
            <button onClick={save} disabled={!available || saving || slug === row?.slug}
              className="flex-1 h-10 rounded-lg text-[12px] font-bold disabled:opacity-50"
              style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}>
              {saving ? "..." : (isEs ? "Guardar" : "Save Slug")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
