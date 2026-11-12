import { useCallback, useEffect, useMemo, useState } from "react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { Crown, Scissors, Plus, X, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "owner" | "admin" | "barber" | "client";
type AssignableRole = "admin" | "barber" | "client";
interface Member {
  user_id: string;
  role: Role;
  full_name: string;
  email: string;
  barber_id: string | null;
  barber_name: string | null;
}

const invoke = (body: Record<string, unknown>) =>
  supabase.functions.invoke("admin-roles", { body });

export default function Roles() {
  const { user } = useAuth();
  const { language } = usePreferences();
  const es = language === "es";

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("barber");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    // Retry once to survive edge-function cold start
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await invoke({ action: "list" });
      if (!error && data?.members) {
        setMembers(data.members as Member[]);
        setLoading(false);
        return;
      }
      lastErr = error;
      await new Promise((r) => setTimeout(r, 600));
    }
    console.error("[roles] load failed", lastErr);
    toast.error(es ? "No se pudo cargar" : "Failed to load");
    setLoading(false);
  }, [es]);

  useEffect(() => { load(); }, [load]);

  // Realtime: any user_roles change => reload
  useEffect(() => {
    const ch = supabase
      .channel("admin-roles-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const changeRole = async (m: Member, role: AssignableRole) => {
    if (m.role === role) return;
    if (role === "client" && m.user_id === user?.id) {
      toast.error(es ? "No puedes quitarte a ti mismo" : "You can't remove yourself");
      return;
    }
    setBusyId(m.user_id);
    const { error } = await invoke({ action: "change", user_id: m.user_id, role });
    setBusyId(null);
    if (error) { toast.error(es ? "Error al cambiar rol" : "Change failed"); return; }
    toast.success(es ? "Rol actualizado" : "Role updated");
    load();
  };

  const removeMember = async (m: Member) => {
    if (m.user_id === user?.id) {
      toast.error(es ? "No puedes quitarte a ti mismo" : "You can't remove yourself");
      return;
    }
    const ok = confirm(
      es
        ? `Quitar acceso a ${m.full_name || m.email}? Pasará a ser cliente.`
        : `Remove access for ${m.full_name || m.email}? They will become a client.`,
    );
    if (!ok) return;
    setBusyId(m.user_id);
    const { error } = await invoke({ action: "remove", user_id: m.user_id });
    setBusyId(null);
    if (error) { toast.error(es ? "No se pudo eliminar" : "Remove failed"); return; }
    toast.success(es ? "Acceso eliminado" : "Access removed");
    load();
  };

  const submitInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error(es ? "Email inválido" : "Invalid email"); return;
    }
    setInviting(true);
    const { data, error } = await invoke({
      action: "assign",
      email,
      role: inviteRole,
      full_name: inviteName.trim(),
    });
    setInviting(false);
    if (error || data?.error) {
      const code = data?.error;
      if (code === "user_not_found") {
        toast.error(es ? "No existe un usuario con ese email" : "No user with that email");
      } else {
        toast.error(es ? "No se pudo asignar" : "Assign failed");
      }
      return;
    }
    toast.success(es ? "Rol asignado" : "Role assigned");
    setInviteEmail(""); setInviteName(""); setInviteRole("barber"); setShowInvite(false);
    load();
  };

  const owners = useMemo(() => members.filter((m) => m.role === "owner"), [members]);
  const admins = useMemo(() => members.filter((m) => m.role === "admin"), [members]);
  const barbers = useMemo(() => members.filter((m) => m.role === "barber"), [members]);

  return (
    <div className="pb-8">
      <SubpageHeader
        title={es ? "Roles y Acceso" : "Roles & Access"}
        subtitle={es ? "Owner, admins y barberos" : "Owner, admins and barbers"}
        backTo="/admin?tab=menu"
      />

      <div className="px-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={20} style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : (
          <>
            <SectionLabel icon={Crown} label={es ? `Owner (${owners.length})` : `Owner (${owners.length})`} />
            <div className="rounded-xl overflow-hidden mb-5 card-elevated">
              {owners.length === 0 ? (
                <EmptyRow label={es ? "Sin owner" : "No owner"} />
              ) : (
                owners.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    m={m}
                    isSelf={m.user_id === user?.id}
                    busy={busyId === m.user_id}
                    es={es}
                    onChangeRole={(r) => changeRole(m, r)}
                    onRemove={() => removeMember(m)}
                  />
                ))
              )}
            </div>

            <SectionLabel icon={ShieldCheck} label={es ? `Admins (${admins.length})` : `Admins (${admins.length})`} />
            <div className="rounded-xl overflow-hidden mb-5 card-elevated">
              {admins.length === 0 ? (
                <EmptyRow label={es ? "Sin admins" : "No admins"} />
              ) : (
                admins.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    m={m}
                    isSelf={m.user_id === user?.id}
                    busy={busyId === m.user_id}
                    es={es}
                    onChangeRole={(r) => changeRole(m, r)}
                    onRemove={() => removeMember(m)}
                  />
                ))
              )}
            </div>

            <SectionLabel icon={Scissors} label={es ? `Barberos (${barbers.length})` : `Barbers (${barbers.length})`} />
            <div className="rounded-xl overflow-hidden mb-5 card-elevated">
              {barbers.length === 0 ? (
                <EmptyRow label={es ? "Sin barberos" : "No barbers"} />
              ) : (
                barbers.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    m={m}
                    isSelf={m.user_id === user?.id}
                    busy={busyId === m.user_id}
                    es={es}
                    onChangeRole={(r) => changeRole(m, r)}
                    onRemove={() => removeMember(m)}
                  />
                ))
              )}
            </div>

            {/* Invite / assign */}
            {!showInvite ? (
              <button
                onClick={() => setShowInvite(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-70"
                style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
              >
                <Plus size={16} />
                {es ? "Asignar rol a un usuario" : "Assign role to user"}
              </button>
            ) : (
              <div className="rounded-xl p-4 card-elevated space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {es ? "Asignar rol" : "Assign role"}
                  </p>
                  <button onClick={() => setShowInvite(false)} className="p-1 -mr-1">
                    <X size={18} style={{ color: "var(--text-tertiary)" }} />
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {es
                    ? "El usuario debe tener una cuenta. Si tiene rol previo, se reemplaza."
                    : "User must already have an account. Any existing role is replaced."}
                </p>

                <InputField
                  icon={Mail}
                  placeholder="email@dominio.com"
                  value={inviteEmail}
                  onChange={setInviteEmail}
                  type="email"
                />
                <InputField
                  icon={ShieldCheck}
                  placeholder={es ? "Nombre completo (opcional)" : "Full name (optional)"}
                  value={inviteName}
                  onChange={setInviteName}
                />

                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AssignableRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{es ? "Admin" : "Admin"}</SelectItem>
                    <SelectItem value="barber">{es ? "Barbero" : "Barber"}</SelectItem>
                    <SelectItem value="client">{es ? "Cliente" : "Client"}</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={submitInvite}
                  disabled={inviting}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
                >
                  {inviting && <Loader2 size={14} className="animate-spin" />}
                  {es ? "Asignar" : "Assign"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-1.5">
      <Icon size={13} style={{ color: "var(--text-tertiary)" }} />
      <p
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </p>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-4 py-5 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
      {label}
    </div>
  );
}

function MemberRow({
  m, isSelf, busy, es, onChangeRole, onRemove,
}: {
  m: Member; isSelf: boolean; busy: boolean; es: boolean;
  onChangeRole: (r: AssignableRole) => void; onRemove: () => void;
}) {
  const initials = (m.full_name || m.email || "?")
    .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: "1px solid var(--divider)" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {m.full_name || (es ? "Sin nombre" : "No name")}
          {isSelf && (
            <span
              className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}
            >
              {es ? "TÚ" : "YOU"}
            </span>
          )}
        </p>
        <p className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
          {m.email || (es ? "Sin email" : "No email")}
          {m.barber_name ? ` · ${m.barber_name}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {m.role === "owner" ? (
          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1"
            style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
          >
            <Crown size={11} /> {es ? "Owner" : "Owner"}
          </span>
        ) : (
          <Select
            value={m.role}
            onValueChange={(v) => onChangeRole(v as AssignableRole)}
            disabled={busy || isSelf}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              {busy ? (
                <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{es ? "Admin" : "Admin"}</SelectItem>
              <SelectItem value="barber">{es ? "Barbero" : "Barber"}</SelectItem>
              <SelectItem value="client">{es ? "Cliente" : "Client"}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function InputField({
  icon: Icon, placeholder, value, onChange, type = "text",
}: {
  icon: any; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ background: "var(--bg-surface-2)" }}
    >
      <Icon size={14} style={{ color: "var(--text-tertiary)" }} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-sm"
        style={{ color: "var(--text-primary)" }}
      />
    </div>
  );
}
