import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import {
  Clock, DollarSign, Loader2, ChevronDown, RefreshCw, Plus, EyeOff, Eye,
  Pencil, ArrowUpDown, ArrowUp, ArrowDown, Check, X,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

/* ─── Types ─── */
interface ServiceRow {
  id: string;
  acuity_type_id: number;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  category: string | null;
  barber_id: string | null;
  addon_ids: number[] | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  locally_edited: boolean;
}

interface AddonRow {
  id: string;
  acuity_addon_id: number;
  name: string;
  price_cents: number;
  duration_minutes: number;
  barber_id: string | null;
}

interface BarberRow {
  id: string;
  name: string;
  color: string | null;
}

export default function Services() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const { user, role } = useAuth();
  const isOwner = role === "owner";

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [, setMyBarberId] = useState<string | null>(null);
  const lastOwnerSyncRef = useRef(0);

  // Edit/reorder state
  const [reorderMode, setReorderMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchAll = useCallback(async (syncFromAcuity = false) => {
    setLoading(true);
    try {
      let syncErrorMessage: string | null = null;

      if (syncFromAcuity) {
        const { data: syncData, error: syncError } = await supabase.functions.invoke("acuity-sync-services");

        if (syncError) {
          syncErrorMessage = syncError.message;
        } else if (
          syncData &&
          typeof syncData === "object" &&
          "success" in syncData &&
          syncData.success === false
        ) {
          const detail =
            (syncData as any)?.services?.error ||
            (syncData as any)?.addons?.error ||
            (syncData as any)?.error;
          syncErrorMessage = detail
            ? String(detail)
            : (language === "es"
                ? "La sincronización con Acuity devolvió un error"
                : "Acuity sync returned an error");
        }
      }

      let barberId: string | null = null;
      if (!isOwner && user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("barber_id")
          .eq("id", user.id)
          .maybeSingle();
        barberId = profile?.barber_id ?? null;
        setMyBarberId(barberId);
      }

      let sQuery = supabase.from("services").select("id, acuity_type_id, name, description, duration_minutes, price_cents, category, barber_id, addon_ids, is_active, is_public, sort_order, locally_edited");
      let aQuery = supabase.from("service_addons").select("id, acuity_addon_id, name, price_cents, duration_minutes, barber_id").eq("is_active", true);
      let bQuery = supabase.from("barbers_public").select("id, name, color").eq("is_active", true);

      if (!isOwner && barberId) {
        sQuery = sQuery.eq("barber_id", barberId).eq("is_active", true);
        aQuery = aQuery.eq("barber_id", barberId);
        bQuery = bQuery.eq("id", barberId);
      } else if (!isOwner) {
        sQuery = sQuery.eq("is_active", true);
      }

      const [sRes, aRes, bRes] = await Promise.all([sQuery, aQuery, bQuery]);
      if (sRes.data) setServices(sRes.data as ServiceRow[]);
      if (aRes.data) setAddons(aRes.data);
      if (bRes.data) setBarbers(bRes.data);

      if (syncErrorMessage) {
        toast.error(
          (language === "es"
            ? "No se pudo actualizar desde Acuity: "
            : "Couldn't refresh from Acuity: ") + syncErrorMessage
        );
        console.error("Service sync warning:", syncErrorMessage);
      }
    } catch {
      toast.error(language === "es" ? "Error al cargar servicios" : "Error loading services");
    } finally {
      setLoading(false);
    }
  }, [language, isOwner, user]);

  const triggerOwnerSync = useCallback(() => {
    if (!isOwner) return;
    const now = Date.now();
    if (now - lastOwnerSyncRef.current < 1500) return;
    lastOwnerSyncRef.current = now;
    void fetchAll(true);
  }, [fetchAll, isOwner]);

  useEffect(() => {
    lastOwnerSyncRef.current = Date.now();
    void fetchAll(isOwner);
  }, [fetchAll, isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") triggerOwnerSync();
    };
    const handleWindowFocus = () => triggerOwnerSync();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isOwner, triggerOwnerSync]);

  const grouped = useMemo(() => {
    const map = new Map<string, { barber: BarberRow; services: ServiceRow[] }>();
    for (const b of barbers) map.set(b.id, { barber: b, services: [] });
    for (const s of services) {
      if (s.barber_id) {
        const entry = map.get(s.barber_id);
        if (entry) entry.services.push(s);
      }
    }
    // Sort each barber's services by sort_order, then name
    for (const entry of map.values()) {
      entry.services.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    }
    return Array.from(map.values()).filter((g) => g.services.length > 0);
  }, [services, barbers]);

  const getServiceAddons = useCallback((addonIds: number[] | null, barberId: string | null) => {
    if (!addonIds || addonIds.length === 0) return [];
    return addons.filter((a) =>
      addonIds.includes(a.acuity_addon_id) && a.barber_id === barberId
    );
  }, [addons]);

  /* ─── Edit handlers ─── */
  const startEdit = (svc: ServiceRow) => {
    setEditingId(svc.id);
    setEditName(svc.name);
    setEditDuration(String(svc.duration_minutes));
    setEditPrice((svc.price_cents / 100).toFixed(2));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDuration("");
    setEditPrice("");
  };

  const saveEdit = async (svc: ServiceRow) => {
    const dur = parseInt(editDuration, 10);
    const priceFloat = parseFloat(editPrice);
    if (!editName.trim() || !Number.isFinite(dur) || dur <= 0 || !Number.isFinite(priceFloat) || priceFloat < 0) {
      toast.error(language === "es" ? "Datos inválidos" : "Invalid values");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("services")
      .update({
        name: editName.trim(),
        duration_minutes: dur,
        price_cents: Math.round(priceFloat * 100),
        locally_edited: true,
      })
      .eq("id", svc.id);
    setSavingEdit(false);
    if (error) {
      toast.error(language === "es" ? "Error al guardar" : "Save failed");
      return;
    }
    setServices((prev) => prev.map((s) => s.id === svc.id ? {
      ...s,
      name: editName.trim(),
      duration_minutes: dur,
      price_cents: Math.round(priceFloat * 100),
      locally_edited: true,
    } : s));
    cancelEdit();
    toast.success(language === "es" ? "Servicio actualizado" : "Service updated");
  };

  /* ─── Reorder handlers ─── */
  const moveService = async (barberId: string, index: number, direction: -1 | 1) => {
    const list = grouped.find((g) => g.barber.id === barberId)?.services;
    if (!list) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;

    const a = list[index];
    const b = list[newIndex];
    // Swap their sort_orders
    const newAOrder = b.sort_order;
    const newBOrder = a.sort_order;

    // Optimistic UI
    setServices((prev) => prev.map((s) => {
      if (s.id === a.id) return { ...s, sort_order: newAOrder };
      if (s.id === b.id) return { ...s, sort_order: newBOrder };
      return s;
    }));

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("services").update({ sort_order: newAOrder }).eq("id", a.id),
      supabase.from("services").update({ sort_order: newBOrder }).eq("id", b.id),
    ]);
    if (e1 || e2) {
      toast.error(language === "es" ? "Error al reordenar" : "Reorder failed");
      void fetchAll(false); // resync from server
    }
  };

  const toggleVisibility = async (svc: ServiceRow) => {
    const next = !svc.is_public;
    // Optimistic
    setServices((prev) => prev.map((s) => s.id === svc.id ? { ...s, is_public: next } : s));
    const { error } = await supabase.from("services").update({ is_public: next }).eq("id", svc.id);
    if (error) {
      setServices((prev) => prev.map((s) => s.id === svc.id ? { ...s, is_public: svc.is_public } : s));
      toast.error(language === "es" ? "Error al cambiar visibilidad" : "Visibility update failed");
      return;
    }
    toast.success(
      next
        ? (language === "es" ? "Visible para clientes" : "Visible to clients")
        : (language === "es" ? "Oculto del flujo de clientes" : "Hidden from client flow")
    );
  };

  return (
    <div
      className="relative mx-auto w-full min-h-screen"
      style={{
        maxWidth: 430,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <SubpageHeader
        title={language === "es" ? "Servicios" : "Services"}
        sticky
        onBack={() => navigate("/admin?tab=menu")}
        actions={
          <>
            {isOwner && (
              <button
                onClick={() => { setReorderMode((v) => !v); setEditingId(null); }}
                className="p-2 rounded-full active:opacity-60"
                style={{ color: reorderMode ? "var(--accent-color)" : "var(--text-secondary)" }}
                aria-label={language === "es" ? "Reordenar" : "Reorder"}
              >
                <ArrowUpDown size={18} />
              </button>
            )}
            <button
              onClick={() => fetchAll(true)}
              disabled={loading}
              className="p-2 rounded-full active:opacity-60"
              style={{ color: "var(--text-secondary)" }}
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      {reorderMode && isOwner && (
        <div className="px-4 pb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Usa ↑ ↓ para reordenar. El nuevo orden se aplica en todas las vistas de reserva."
            : "Use ↑ ↓ to reorder. The new order applies to all booking views."}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-20 text-sm" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "No se encontraron servicios" : "No services found"}
        </p>
      ) : (
        <div className="px-4 pb-8 space-y-6">
          {grouped.map(({ barber, services: barberServices }, gi) => {
            const bColor = barber.color || "var(--accent-color)";
            return (
              <motion.div
                key={barber.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.08 }}
              >
                {/* Barber header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: bColor }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {barber.name}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
                    {barberServices.length} {language === "es" ? "servicios" : "services"}
                  </span>
                </div>

                {/* Services list */}
                <div className="rounded-xl overflow-hidden card-elevated">
                  {barberServices.map((svc, i) => {
                    const svcAddons = getServiceAddons(svc.addon_ids, svc.barber_id);
                    const isExpanded = expandedType === svc.id;
                    const isEditing = editingId === svc.id;
                    const hasDetails = svc.description || svcAddons.length > 0;
                    const priceDisplay = (svc.price_cents / 100).toFixed(svc.price_cents % 100 === 0 ? 0 : 2);

                    if (isEditing) {
                      return (
                        <div
                          key={svc.id}
                          className="px-4 py-3 space-y-2.5"
                          style={{
                            borderBottom: i < barberServices.length - 1 ? "1px solid var(--divider)" : "none",
                            background: "var(--bg-surface-2)",
                          }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={language === "es" ? "Nombre del servicio" : "Service name"}
                            className="w-full text-sm font-medium bg-transparent outline-none rounded-md px-2.5 py-2"
                            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                          />
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center gap-1.5 rounded-md px-2.5 py-2" style={{ background: "var(--bg-base)", border: "1px solid var(--divider)" }}>
                              <Clock size={13} style={{ color: "var(--text-secondary)" }} />
                              <input
                                type="number"
                                inputMode="numeric"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="w-full text-sm bg-transparent outline-none"
                                style={{ color: "var(--text-primary)" }}
                              />
                              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>min</span>
                            </div>
                            <div className="flex-1 flex items-center gap-1.5 rounded-md px-2.5 py-2" style={{ background: "var(--bg-base)", border: "1px solid var(--divider)" }}>
                              <DollarSign size={13} style={{ color: bColor }} />
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-full text-sm bg-transparent outline-none"
                                style={{ color: "var(--text-primary)" }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold"
                              style={{ background: "var(--bg-base)", color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
                            >
                              <X size={14} />
                              {language === "es" ? "Cancelar" : "Cancel"}
                            </button>
                            <button
                              onClick={() => saveEdit(svc)}
                              disabled={savingEdit}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold"
                              style={{ background: bColor, color: "#fff" }}
                            >
                              {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />{language === "es" ? "Guardar" : "Save"}</>}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={svc.id}>
                        <div
                          className="flex items-center gap-3 px-4 py-3 w-full"
                          style={{
                            borderBottom: (i < barberServices.length - 1 || isExpanded) ? "1px solid var(--divider)" : "none",
                            opacity: svc.is_active ? 1 : 0.5,
                          }}
                        >
                          {reorderMode && isOwner ? (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={() => moveService(barber.id, i, -1)}
                                disabled={i === 0}
                                className="p-0.5 rounded active:opacity-60 disabled:opacity-25"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={() => moveService(barber.id, i, 1)}
                                disabled={i === barberServices.length - 1}
                                className="p-0.5 rounded active:opacity-60 disabled:opacity-25"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: bColor }} />
                          )}

                          <button
                            onClick={() => hasDetails && !reorderMode && setExpandedType(isExpanded ? null : svc.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {svc.name}
                              </p>
                              {!svc.is_active && (
                                <EyeOff size={12} style={{ color: "var(--text-tertiary)" }} />
                              )}
                              {svc.locally_edited && isOwner && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}>
                                  {language === "es" ? "EDITADO" : "EDITED"}
                                </span>
                              )}
                              {!svc.is_public && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: bColor }}>
                                  {language === "es" ? "PRIVADO" : "PRIVATE"}
                                </span>
                              )}
                            </div>
                            {svc.category && (
                              <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                                {svc.category}
                              </p>
                            )}
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <Clock size={13} style={{ color: "var(--text-secondary)" }} />
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {svc.duration_minutes}m
                            </span>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0 min-w-[52px] justify-end">
                            <DollarSign size={13} style={{ color: bColor }} />
                            <span className="text-sm font-semibold" style={{ color: bColor }}>
                              {priceDisplay}
                            </span>
                          </div>

                          {isOwner && !reorderMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleVisibility(svc); }}
                              className="p-1 rounded shrink-0 active:opacity-60"
                              style={{ color: svc.is_public ? "var(--text-tertiary)" : bColor }}
                              aria-label={svc.is_public ? (language === "es" ? "Hacer privado" : "Make private") : (language === "es" ? "Hacer público" : "Make public")}
                              title={svc.is_public ? (language === "es" ? "Visible para clientes" : "Visible to clients") : (language === "es" ? "Oculto del flujo de clientes" : "Hidden from client flow")}
                            >
                              {svc.is_public ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                          )}

                          {isOwner && !reorderMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(svc); }}
                              className="p-1 rounded shrink-0 active:opacity-60"
                              style={{ color: "var(--text-tertiary)" }}
                              aria-label={language === "es" ? "Editar" : "Edit"}
                            >
                              <Pencil size={14} />
                            </button>
                          )}

                          {hasDetails && !reorderMode && (
                            <ChevronDown
                              size={14}
                              className="shrink-0 transition-transform duration-200"
                              style={{
                                color: "var(--text-tertiary)",
                                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              }}
                            />
                          )}
                        </div>

                        <AnimatePresence>
                          {isExpanded && !reorderMode && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div
                                className="px-4 py-3 space-y-3"
                                style={{
                                  background: "var(--bg-surface-2)",
                                  borderBottom: i < barberServices.length - 1 ? "1px solid var(--divider)" : "none",
                                }}
                              >
                                {svc.description && (
                                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
                                    {svc.description}
                                  </p>
                                )}

                                {svcAddons.length > 0 && (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                                      {language === "es" ? "Servicios adicionales" : "Add-ons"}
                                    </p>
                                    <div className="space-y-1.5">
                                      {svcAddons.map((addon) => (
                                        <div
                                          key={addon.id}
                                          className="flex items-center gap-2 rounded-lg px-3 py-2"
                                          style={{ background: "var(--bg-base)" }}
                                        >
                                          <Plus size={12} style={{ color: bColor }} />
                                          <span className="flex-1 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                            {addon.name}
                                          </span>
                                          {addon.duration_minutes > 0 && (
                                            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                              +{addon.duration_minutes}m
                                            </span>
                                          )}
                                          <span className="text-xs font-semibold" style={{ color: bColor }}>
                                            ${(addon.price_cents / 100).toFixed(addon.price_cents % 100 === 0 ? 0 : 2)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
