// Bottom sheet that lists every client with an active push subscription.
// Opened from the BroadcastComposer's audience chip ("Enviar a N clientes").
import { useEffect, useState } from "react";
import { Check, Send, Smartphone, Loader2, Users, X } from "lucide-react";
import {
  fetchPushSubscribers,
  groupByClient,
  fullName,
  initials,
  detectPlatform,
  platformLabel,
  type GroupedSubscriber,
} from "@/lib/pushSubscribers";

export function BroadcastAudienceSheet({
  open,
  onClose,
  es,
  onSendSelected,
  sending = false,
}: {
  open: boolean;
  onClose: () => void;
  es: boolean;
  onSendSelected?: (clientIds: string[]) => Promise<boolean | void>;
  sending?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupedSubscriber[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchPushSubscribers()
      .then((rows) => { if (!cancelled) { setGroups(groupByClient(rows)); setSelectedIds(new Set()); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message || "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const totalDevices = groups.reduce((n, g) => n + g.devices.length, 0);
  const selectedCount = selectedIds.size;
  const allSelected = groups.length > 0 && selectedCount === groups.length;

  const toggleClient = (clientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(groups.map((g) => g.client_id)));
  };

  const confirmSendSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!onSendSelected || ids.length === 0 || sending) return;
    const ok = confirm(
      es
        ? `¿Enviar este broadcast a ${ids.length} cliente${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}?`
        : `Send this broadcast to ${ids.length} selected client${ids.length === 1 ? "" : "s"}?`
    );
    if (!ok) return;
    const sent = await onSendSelected(ids);
    if (sent !== false) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl flex flex-col"
        style={{
          background: "var(--bg-base)",
          borderTop: "1px solid var(--divider)",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--divider)" }} />
        </div>

        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-lg" style={{ color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
              {es ? "Audiencia del broadcast" : "Broadcast audience"}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {loading
                ? (es ? "Cargando…" : "Loading…")
                : es
                  ? `${groups.length} cliente${groups.length === 1 ? "" : "s"} · ${totalDevices} dispositivo${totalDevices === 1 ? "" : "s"}`
                  : `${groups.length} client${groups.length === 1 ? "" : "s"} · ${totalDevices} device${totalDevices === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full active:scale-90"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
            aria-label={es ? "Cerrar" : "Close"}
          >
            <X size={16} className="icon-bold" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" size={20} style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : error ? (
            <p className="text-xs py-6 text-center" style={{ color: "#ef4444" }}>{error}</p>
          ) : groups.length === 0 ? (
            <EmptyState es={es} />
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <ClientRow
                  key={g.client_id}
                  group={g}
                  selected={selectedIds.has(g.client_id)}
                  onToggle={() => toggleClient(g.client_id)}
                />
              ))}
            </div>
          )}
        </div>

        {groups.length > 0 && (
          <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" style={{ borderTop: "1px solid var(--divider)" }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                {allSelected ? (es ? "Limpiar" : "Clear") : (es ? "Seleccionar todos" : "Select all")}
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {es
                  ? `${selectedCount} seleccionado${selectedCount === 1 ? "" : "s"}`
                  : `${selectedCount} selected`}
              </span>
            </div>
            <button
              type="button"
              onClick={confirmSendSelected}
              disabled={!onSendSelected || selectedCount === 0 || sending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending
                ? (es ? "Enviando…" : "Sending…")
                : es
                  ? `Enviar a ${selectedCount}`
                  : `Send to ${selectedCount}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientRow({ group, selected, onToggle }: { group: GroupedSubscriber; selected: boolean; onToggle: () => void }) {
  const platforms = Array.from(new Set(group.devices.map((d) => detectPlatform(d.user_agent))));
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      style={{ background: "var(--bg-surface-1)", border: selected ? "1px solid hsl(var(--foreground))" : "1px solid var(--divider)" }}
    >
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: selected ? "hsl(var(--foreground))" : "var(--bg-surface-2)", color: selected ? "hsl(var(--background))" : "var(--text-tertiary)" }}
      >
        {selected && <Check size={14} className="icon-bold" />}
      </span>
      <Avatar group={group} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
          {fullName(group)}
        </div>
        <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
          {group.email || group.phone || "—"}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {platforms.map((p) => (
          <span
            key={p}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
          >
            {platformLabel(p)}
          </span>
        ))}
        {group.devices.length > 1 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
            style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
          >
            <Smartphone size={9} /> {group.devices.length}
          </span>
        )}
      </div>
    </button>
  );
}

function Avatar({ group }: { group: GroupedSubscriber }) {
  if (group.avatar_url) {
    return (
      <img
        src={group.avatar_url}
        alt=""
        loading="lazy"
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
      style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
    >
      {initials(group)}
    </div>
  );
}

function EmptyState({ es }: { es: boolean }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
        style={{ background: "var(--bg-surface-2)" }}>
        <Users size={20} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {es ? "Aún no hay dispositivos suscritos" : "No subscribed devices yet"}
      </p>
      <p className="text-xs mt-1 max-w-[260px]" style={{ color: "var(--text-tertiary)" }}>
        {es
          ? "Cuando un cliente instale la PWA y active las notificaciones, aparecerá aquí."
          : "When a client installs the PWA and enables notifications, they'll appear here."}
      </p>
    </div>
  );
}
