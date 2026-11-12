import { useEffect, useId, useState } from "react";
import { Cake, Check, Loader2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { birthdayLabel, puertoRicoDate } from "@/lib/birthdays";
import { toast } from "sonner";

export function ClientBirthdayField({ clientId, appointmentId, onSaved }: {
  clientId: string; appointmentId?: string; onSaved?: (value: string | null) => void;
}) {
  const { language } = useTranslation();
  const es = language === "es";
  const inputId = useId();
  const [value, setValue] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setEditing(false); setFailed(false);
    supabase.from("clients").select("date_of_birth").eq("id", clientId).single().then(({ data, error }) => {
      if (cancelled) return;
      setFailed(!!error); setValue(data?.date_of_birth ?? null); setDraft(data?.date_of_birth ?? ""); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [clientId]);
  const save = async () => {
    if (saving || failed) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_client_birthday", {
        _client_id: clientId, _date_of_birth: draft || null, _appointment_id: appointmentId ?? null,
      });
      if (error) throw error;
      setValue(draft || null); setEditing(false); onSaved?.(draft || null);
      toast.success(es ? "Cumpleaños guardado" : "Birthday saved");
    } catch { toast.error(es ? "No se pudo guardar el cumpleaños" : "Could not save birthday"); }
    finally { setSaving(false); }
  };
  return <div className="py-3 space-y-3 text-foreground">
    <div className="flex items-center gap-3">
      <Cake size={18} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">{es ? "Cumpleaños" : "Birthday"}</label>
        {!editing && <p className="text-sm">{loading ? "…" : failed ? (es ? "No disponible" : "Unavailable") : value ? birthdayLabel(value, language) : (es ? "Sin registrar" : "Not recorded")}</p>}
      </div>
      {!editing && <Button variant="ghost" size="icon" disabled={loading || failed} aria-label={es ? "Editar cumpleaños" : "Edit birthday"} title={es ? "Editar cumpleaños" : "Edit birthday"} onClick={() => { setDraft(value ?? ""); setEditing(true); }}><Pencil /></Button>}
    </div>
    {editing && <div className="flex flex-wrap items-center gap-2">
      <Input id={inputId} aria-label={es ? "Fecha de nacimiento" : "Date of birth"} type="date" max={puertoRicoDate()} value={draft} onChange={e => setDraft(e.target.value)} className="min-w-0 flex-1 text-base" disabled={saving} />
      <Button size="icon" onClick={save} disabled={saving || (!!draft && draft > puertoRicoDate())} aria-label={es ? "Guardar cumpleaños" : "Save birthday"} title={es ? "Guardar cumpleaños" : "Save birthday"}>{saving ? <Loader2 className="animate-spin" /> : <Check />}</Button>
      <Button variant="ghost" size="icon" disabled={saving} onClick={() => setEditing(false)} aria-label={es ? "Cancelar cumpleaños" : "Cancel birthday"} title={es ? "Cancelar" : "Cancel"}><X /></Button>
    </div>}
  </div>;
}