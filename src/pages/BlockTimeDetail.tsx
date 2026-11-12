import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";
import { format } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import {
  ChevronLeft,
  Clock,
  CalendarDays,
  Users,
  StickyNote,
  Pencil,
  Trash2,
  Loader2,
  Ban,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { schedulingProxy as acuityProxy, getShopProvider } from "@/lib/scheduling";

interface BlockData {
  id: string;
  barber_id: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  is_multi_day: boolean;
  is_recurring: boolean;
  recurring_group_id: string | null;
  notes: string | null;
  acuity_block_id: number | null;
}

interface BarberInfo {
  id: string;
  name: string;
  color: string | null;
}


export default function BlockTimeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = usePreferences();
  const isEs = language === "es";
  const dateFnsLocale = isEs ? esLocale : enUS;

  const [block, setBlock] = useState<BlockData | null>(null);
  const [barber, setBarber] = useState<BarberInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("block_times")
        .select("*")
        .eq("id", id)
        .single();
      if (data) {
        setBlock(data as BlockData);
        const { data: b } = await supabase
          .from("barbers_public")
          .select("id, name, color")
          .eq("id", data.barber_id)
          .single();
        if (b) setBarber(b);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleDelete = async (deleteAll = false) => {
    if (!block) return;
    setDeleting(true);
    try {
      // Delete from Acuity if we have the acuity_block_id (Acuity shops only)
      if (block.acuity_block_id && (await getShopProvider()).kind !== "native") {
        try {
          await acuityProxy(`/blocks/${block.acuity_block_id}`, "DELETE");
        } catch {
          // non-blocking
        }
      }

      if (deleteAll && block.recurring_group_id) {
        const { error: dbErr } = await supabase
          .from("block_times")
          .delete()
          .eq("recurring_group_id", block.recurring_group_id)
          .gte("starts_at", block.starts_at);
        if (dbErr) throw dbErr;
      } else {
        const { error: dbErr } = await supabase
          .from("block_times")
          .delete()
          .eq("id", block.id);
        if (dbErr) throw dbErr;
      }

      toast.success(isEs ? "Bloqueo eliminado" : "Block deleted");
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <p>{isEs ? "Bloqueo no encontrado" : "Block not found"}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm underline" style={{ color: "var(--accent-color)" }}>
          {isEs ? "Volver" : "Go back"}
        </button>
      </div>
    );
  }

  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  const formatTime12 = (d: Date) => format(d, "h:mm a");

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          background: "var(--bg-base)",
          borderBottom: "1px solid var(--divider)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
        }}
      >
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} style={{ color: "var(--text-primary)" }} />
        </button>
        <h1 className="text-lg font-bold">
          {isEs ? "Tiempo Bloqueado" : "Blocked Time"}
        </h1>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Icon header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: `repeating-linear-gradient(
                135deg,
                var(--bg-surface-2),
                var(--bg-surface-2) 4px,
                var(--bg-surface) 4px,
                var(--bg-surface) 8px
              )`,
              border: "1px solid var(--border)",
            }}
          >
            <Ban size={18} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div>
            <p className="text-base font-bold">
              {block.is_all_day
                ? isEs ? "Día completo" : "All Day"
                : `${formatTime12(start)} - ${formatTime12(end)}`}
            </p>
            {block.is_recurring && (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {isEs ? "Recurrente" : "Recurring"}
              </p>
            )}
          </div>
        </div>

        {/* Time range */}
        {!block.is_all_day && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
            <Clock size={14} style={{ color: "var(--accent-color)" }} />
            <span className="text-sm">{formatTime12(start)} → {formatTime12(end)}</span>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
          <CalendarDays size={14} style={{ color: "var(--accent-color)" }} />
          <span className="text-sm capitalize">
            {block.is_multi_day
              ? `${format(start, "d MMM", { locale: dateFnsLocale })} - ${format(end, "d MMM yyyy", { locale: dateFnsLocale })}`
              : format(start, "EEEE, d MMM yyyy", { locale: dateFnsLocale })}
          </span>
        </div>

        {/* Barber */}
        {barber && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
            <Users size={14} style={{ color: "var(--accent-color)" }} />
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: barber.color || "var(--accent-color)" }}
            />
            <span className="text-sm font-medium">{barber.name}</span>
          </div>
        )}

        {/* Notes */}
        {block.notes && (
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
            <StickyNote size={14} className="mt-0.5" style={{ color: "var(--accent-color)" }} />
            <p className="text-sm whitespace-pre-wrap">{block.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => navigate(`/admin/block/new?edit=${block.id}`)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
          >
            <Pencil size={14} />
            {isEs ? "Editar" : "Edit"}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "rgba(185,28,28,0.1)", color: "var(--red)" }}
          >
            <Trash2 size={14} />
            {isEs ? "Eliminar" : "Delete"}
          </button>
        </div>
      </div>

      {/* Delete confirmation drawer */}
      <Drawer open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {block.is_recurring
                ? isEs ? "Eliminar bloqueo recurrente" : "Delete recurring block"
                : isEs ? "¿Eliminar este bloqueo?" : "Delete this block?"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            {block.is_recurring ? (
              <>
                <button
                  onClick={() => handleDelete(false)}
                  disabled={deleting}
                  className="w-full py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                >
                  {deleting ? <Loader2 size={16} className="animate-spin mx-auto" /> : isEs ? "Eliminar solo este bloqueo" : "Remove this block only"}
                </button>
                <button
                  onClick={() => handleDelete(true)}
                  disabled={deleting}
                  className="w-full py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "rgba(185,28,28,0.1)", color: "var(--red)" }}
                >
                  {isEs ? "Eliminar este y todos los futuros" : "Remove this and all future blocks"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleDelete(false)}
                  disabled={deleting}
                  className="w-full py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "rgba(185,28,28,0.1)", color: "var(--red)" }}
                >
                  {deleting ? <Loader2 size={16} className="animate-spin mx-auto" /> : isEs ? "Confirmar" : "Confirm"}
                </button>
              </>
            )}
            <DrawerClose asChild>
              <button
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
              >
                {isEs ? "Cancelar" : "Cancel"}
              </button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
