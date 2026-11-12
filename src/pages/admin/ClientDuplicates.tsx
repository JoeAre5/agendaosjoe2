import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, GitMerge, Users, Pencil, Trash2, Clock3, ShieldCheck, RefreshCw, LockKeyhole } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useClientDuplicateBadges } from "@/contexts/ClientDuplicateBadgesContext";
import { contactEmail } from "../../../supabase/functions/_shared/contactEmail";

interface Group { group_key: string; match_type: string; client_ids: string[]; client_count: number }
interface Client {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  created_at: string; auth_user_id: string | null; acuity_client_id: number | null; dependencies: string[];
}
type Confirmation = { kind: "merge" | "preserve" | "postpone"; group: Group } | { kind: "delete"; client: Client };
const keyFor = (g: Group) => `${g.match_type}:${g.group_key}`;
const nameFor = (c: Client) => [c.first_name, c.last_name].filter(Boolean).join(" ");

export default function ClientDuplicates() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const { user, role } = useAuth();
  const es = language === "es";
  const { refresh: refreshBadges } = useClientDuplicateBadges();
  const [groups, setGroups] = useState<Group[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ first: "", last: "", phone: "", email: "" });

  const load = useCallback(async () => {
    if (!user || role !== "owner") { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try {
      const { data, error } = await supabase.rpc("find_duplicate_client_groups");
      if (error) throw error;
      const next = (data ?? []) as Group[];
      const ids = [...new Set(next.flatMap(g => g.client_ids))];
      const map: Record<string, Client> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const response = await supabase.rpc("get_duplicate_review_profiles", { _ids: ids.slice(i, i + 100) });
        if (response.error) throw response.error;
        for (const c of response.data as unknown as Client[]) map[c.id] = c;
      }
      const prints: Record<string, string> = {};
      // Bounded batches, no unbounded request fan-out.
      for (let i = 0; i < next.length; i += 4) {
        await Promise.all(next.slice(i, i + 4).map(async g => {
          const response = await supabase.rpc("get_duplicate_review_fingerprint", { _ids: g.client_ids });
          if (response.error) throw response.error;
          prints[keyFor(g)] = response.data;
        }));
      }
      setGroups(next); setClients(map); setFingerprints(prints);
      setSelected(Object.fromEntries(next.map(g => [keyFor(g), g.client_ids[0]])));
    } catch (error) {
      setGroups([]); setClients({}); setFingerprints({}); setFailed(true);
      toast.error(es ? "No se pudieron verificar los perfiles. Intenta de nuevo." : "Profiles could not be verified. Try again.");
    } finally { setLoading(false); }
  }, [user?.id, role, es]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !busy && !editing && !confirmation) void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, busy, editing, confirmation]);

  const refreshAll = async () => { await Promise.allSettled([load(), refreshBadges()]); };
  const act = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    try {
      if (confirmation.kind === "delete") {
        const result = await supabase.rpc("delete_empty_duplicate_profile", { _id: confirmation.client.id });
        if (result.error) throw result.error;
        toast.success(es ? "Perfil vacío eliminado" : "Empty profile deleted");
      } else if (confirmation.kind === "merge") {
        const g = confirmation.group;
        const keep = selected[keyFor(g)];
        if (!keep) throw new Error("No selection");
        for (const id of g.client_ids.filter(id => id !== keep)) {
          const result = await supabase.rpc("merge_duplicate_review_pair", { _keep_id: keep, _discard_id: id });
          if (result.error) throw result.error;
        }
        toast.success(es ? "Perfiles combinados" : "Profiles merged");
      } else {
        const g = confirmation.group;
        const result = await supabase.rpc("record_duplicate_review_decision", {
          _ids: g.client_ids, _decision: confirmation.kind,
          _fingerprint: fingerprints[keyFor(g)],
        });
        if (result.error) throw result.error;
        toast.success(confirmation.kind === "preserve" ? (es ? "Perfiles conservados" : "Profiles kept separate") : (es ? "Alerta pospuesta por 30 días" : "Alert postponed for 30 days"));
      }
      setConfirmation(null);
    } catch {
      toast.error(es ? "No se completó la acción. Revisa los perfiles actualizados." : "Action could not be completed. Check the refreshed profiles.");
      setConfirmation(null);
    } finally { await refreshAll(); setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const result = await supabase.rpc("edit_duplicate_review_profile", {
        _id: editing.id, _first: form.first, _last: form.last, _phone: form.phone, _email: form.email,
      });
      if (result.error) throw result.error;
      toast.success(es ? "Perfil actualizado" : "Profile updated"); setEditing(null);
    } catch {
      toast.error(es ? "No se pudo guardar. Revisa el contacto o una posible coincidencia." : "Could not save. Check contact details or a possible match.");
    } finally { await refreshAll(); setBusy(false); }
  };

  const protection = (c: Client) => {
    if (c.dependencies.includes("account")) return es ? "Cuenta de la app" : "App account";
    if (c.dependencies.includes("appointments")) return es ? "Citas registradas" : "Appointments on record";
    if (c.dependencies.includes("transactions")) return es ? "Pagos registrados" : "Payments on record";
    if (c.dependencies.some(d => d.includes("loyalty") || d.includes("rewards") || d.includes("benefit"))) return es ? "Puntos o beneficios" : "Points or benefits";
    return es ? "Historial vinculado" : "Linked history";
  };
  const title = !confirmation ? "" : confirmation.kind === "merge" ? (es ? "¿Combinar perfiles?" : "Merge profiles?")
    : confirmation.kind === "preserve" ? (es ? "¿Conservar ambos?" : "Keep separate?")
    : confirmation.kind === "postpone" ? (es ? "¿Posponer 30 días?" : "Postpone for 30 days?")
    : (es ? "¿Eliminar este perfil vacío?" : "Delete this empty profile?");

  return <div className="min-h-screen bg-background text-foreground pb-24">
    <SubpageHeader title={es ? "Posibles duplicados" : "Possible duplicates"} onBack={() => navigate("/admin/clients")} />
    {role !== "owner" ? <p className="px-5 py-12 text-muted-foreground">{es ? "Solo administradores." : "Administrators only."}</p>
    : loading ? <div className="flex justify-center py-20" role="status"><Loader2 className="animate-spin text-primary" /><span className="sr-only">{es ? "Cargando perfiles" : "Loading profiles"}</span></div>
    : failed ? <div className="px-5 py-12 space-y-5"><p className="text-muted-foreground">{es ? "No se pudo verificar la lista." : "The list could not be verified."}</p><Button variant="outline" onClick={() => void load()}><RefreshCw />{es ? "Intentar de nuevo" : "Try again"}</Button></div>
    : groups.length === 0 ? <div className="px-5 py-16 text-center space-y-4"><ShieldCheck className="mx-auto text-primary" size={32} /><p className="text-muted-foreground">{es ? "No hay coincidencias pendientes." : "No matches awaiting review."}</p></div>
    : <div className="px-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between py-5 mb-2"><span className="text-sm text-muted-foreground">{groups.length} {es ? "grupos pendientes" : "groups awaiting review"}</span><Button variant="ghost" size="icon" aria-label={es ? "Actualizar" : "Refresh"} onClick={() => void load()} disabled={busy}><RefreshCw /></Button></div>
      <div className="space-y-10">{groups.map(g => {
        const k = keyFor(g);
        return <section key={k} className="border-b border-border pb-8 space-y-5">
          <div className="flex items-start gap-3"><Users className="text-primary shrink-0 mt-0.5" size={20} /><div className="min-w-0"><h2 className="font-semibold text-base break-words">{g.group_key}</h2><p className="text-xs text-muted-foreground mt-1">{g.match_type === "name" ? (es ? "Mismo nombre" : "Matching name") : g.match_type === "phone" ? (es ? "Mismo teléfono" : "Matching phone") : (es ? "Mismo correo" : "Matching email")}</p></div></div>
          <div className="divide-y divide-border">{g.client_ids.map(id => {
            const c = clients[id]; if (!c) return null;
            const kept = selected[k] === id;
            return <div key={id} className="py-5 first:pt-0 space-y-4">
              <div className="flex gap-3 items-start"><input id={`duplicate-${k}-${id}`} type="radio" name={k} checked={kept} onChange={() => setSelected(s => ({ ...s, [k]: id }))} disabled={busy} className="mt-1 accent-primary shrink-0" aria-label={`${es ? "Conservar" : "Keep"} ${nameFor(c)} ${id.slice(-6)}`} /><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><label htmlFor={`duplicate-${k}-${id}`} className="min-w-0 font-semibold break-words cursor-pointer">{nameFor(c)}</label><Button asChild variant="link" className="h-auto shrink-0 px-0 py-1 text-xs font-normal"><Link to={`/admin/clients?client=${id}`} aria-label={`${es ? "Ver perfil de" : "View profile of"} ${nameFor(c)} ${id.slice(-6)}`}>{es ? "Ver perfil" : "View profile"}</Link></Button></div><p className="text-sm text-muted-foreground break-all mt-2">{c.phone || (es ? "Sin teléfono" : "No phone")}</p><p className="text-sm text-muted-foreground break-all mt-1">{contactEmail(c.email) || (es ? "Sin correo" : "No email")}</p><p className="text-xs text-muted-foreground mt-3">{es ? "Creado" : "Created"} {new Date(c.created_at).toLocaleDateString(es ? "es-PR" : "en-US", { timeZone: "America/Puerto_Rico" })} · ID {id.slice(-6)}</p>{kept && <p className="text-xs font-medium text-primary mt-2">{es ? "Perfil principal seleccionado" : "Selected primary profile"}</p>}</div></div>
              <div className="flex flex-wrap items-center gap-2 pl-7"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { setEditing(c); setForm({ first: c.first_name ?? "", last: c.last_name ?? "", phone: c.phone ?? "", email: contactEmail(c.email) ?? "" }); }}><Pencil />{es ? "Editar" : "Edit"}</Button><Button variant="ghost" className="text-destructive min-h-11" disabled={busy || c.dependencies.length > 0} onClick={() => setConfirmation({ kind: "delete", client: c })}><Trash2 />{es ? "Eliminar" : "Delete"}</Button></div>
              {c.dependencies.length > 0 && <p className="flex gap-2 items-start text-xs text-muted-foreground pl-7"><LockKeyhole size={14} className="shrink-0" /><span>{protection(c)}. {es ? "Editar o combinar, no eliminar." : "Edit or merge, deletion protected."}</span></p>}
            </div>;
          })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ kind: "preserve", group: g })}><ShieldCheck />{es ? "Conservar ambos" : "Keep separate"}</Button><Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={busy} onClick={() => setConfirmation({ kind: "postpone", group: g })}><Clock3 />{es ? "Posponer 30 días" : "Postpone 30 days"}</Button></div>
          <Button className="w-full min-h-11" disabled={busy} onClick={() => setConfirmation({ kind: "merge", group: g })}><GitMerge />{es ? "Combinar grupo" : "Merge group"}</Button>
        </section>;
      })}</div>
    </div>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent className="w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto rounded-lg"><DialogHeader><DialogTitle>{es ? "Editar perfil" : "Edit profile"}</DialogTitle><DialogDescription>{editing ? nameFor(editing) : ""}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-5">{([
      ["first", es ? "Nombre" : "First name"], ["last", es ? "Apellido" : "Last name"], ["phone", es ? "Teléfono" : "Phone"], ["email", es ? "Correo electrónico" : "Email"],
    ] as const).map(([field, label]) => <label key={field} className="block space-y-2 text-sm"><span>{label}</span><Input value={form[field]} onChange={event => setForm(s => ({ ...s, [field]: event.target.value }))} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} required={field === "first"} disabled={busy} className="!text-base" /></label>)}<div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>{es ? "Cancelar" : "Cancel"}</Button><Button type="submit" disabled={busy || !form.first.trim()}>{busy && <Loader2 className="animate-spin" />}{es ? "Guardar" : "Save"}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent className="w-[calc(100%-2rem)] rounded-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="pt-3 leading-relaxed">{confirmation?.kind === "merge" ? (es ? "Las citas y los pagos se vincularán al perfil principal seleccionado. No se puede deshacer." : "Appointments and payments will be linked to the selected primary profile. This cannot be undone.")
      : confirmation?.kind === "preserve" ? (es ? "Se conservarán como personas distintas. La alerta volverá si cambia la identidad de contacto o aparece otro perfil." : "These profiles will remain separate people. The alert returns if contact identity changes or another profile appears.")
      : confirmation?.kind === "postpone" ? (es ? "La alerta volverá en 30 días si la coincidencia continúa. Los perfiles no cambian." : "The alert returns after 30 days if the match remains. Profiles stay unchanged.")
      : (es ? `Solo se eliminará ${confirmation?.kind === "delete" ? nameFor(confirmation.client) : ""}. Se volverá a verificar que no tenga citas, pagos, puntos, cuenta ni historial vinculado. No se puede deshacer.` : "Only this empty profile will be deleted. Appointments, payments, points, account and linked history are checked again. This cannot be undone.")}</DialogDescription></DialogHeader><div className="flex justify-end gap-3 pt-4"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>{es ? "Cancelar" : "Cancel"}</Button><Button variant={confirmation?.kind === "delete" ? "destructive" : "default"} disabled={busy} onClick={() => void act()}>{busy && <Loader2 className="animate-spin" />}{es ? "Confirmar" : "Confirm"}</Button></div></DialogContent></Dialog>
  </div>;
}
