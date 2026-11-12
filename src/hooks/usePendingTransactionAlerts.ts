// Realtime listener for new pending_review transactions.
// Fires for owner AND barbers (shop-wide visibility).
// - Sonner toast on every INSERT
// - Browser notification (if granted) when tab is hidden
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Options {
  enabled: boolean;
}

export function usePendingTransactionAlerts({ enabled }: Options) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !role) return;
    // Only owner + barbers — clients should never see this
    if (role !== "owner" && role !== "barber") return;

    const channel = supabase
      .channel("pending-tx-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => {
          const row = payload.new as { id: string; status: string; total_cents: number; payment_method: string };
          if (!row || row.status !== "pending_review") return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          const amount = `$${(row.total_cents / 100).toFixed(2)}`;
          const method = row.payment_method === "ath_movil" ? "ATH Móvil" : row.payment_method;
          const title = `Pago pendiente recibido — ${amount}`;
          const body = `${method} sin asignar. Toca para revisar y asignar.`;

          // Toast
          toast(title, {
            description: body,
            duration: 8000,
            action: {
              label: "Ver",
              onClick: () => navigate("/admin/sales?status=pending_review"),
            },
          });

          // Browser notification (only if granted + tab hidden)
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState === "hidden"
          ) {
            try {
              const n = new Notification(title, { body, tag: row.id, icon: "/favicon.ico" });
              n.onclick = () => {
                window.focus();
                navigate("/admin/sales?status=pending_review");
                n.close();
              };
            } catch {
              // Some browsers throw if not in a SW context — fall back silently
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "transactions" },
        (payload) => {
          // Clear from seen set when no longer pending_review (allocated/deleted)
          const row = payload.new as { id: string; status: string };
          if (row && row.status !== "pending_review") {
            seenIds.current.delete(row.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, role, navigate]);
}
