// PayPal pay button — pay-then-book flow.
// Flow: prepare-paypal-order → user approves → capture-paypal → commit-and-book.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CommitResult {
  appointmentId: string;
  acuityId: number;
  isReturning?: boolean;
  returningName?: string | null;
  cardOnFile?: { brand: string | null; last4: string | null } | null;
  appointment?: { starts_at: string; service_name: string; price: string; duration: number };
}

interface PayPalPayButtonProps {
  draftId: string;
  totalCents: number;
  tipCents: number;
  onSuccess: (result: CommitResult) => void;
  onCommitError: (msg: string, refunded: boolean) => void;
  isEs: boolean;
}

type PayPalGlobal = {
  Buttons: (config: Record<string, unknown>) => { render: (el: HTMLElement) => void };
};
const getPayPal = (): PayPalGlobal | undefined =>
  (window as unknown as { paypal?: PayPalGlobal }).paypal;

function loadPayPalSDK(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getPayPal()) return resolve();
    const existing = document.querySelector('script[data-paypal-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
    s.dataset.paypalSdk = "true";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.body.appendChild(s);
  });
}

export function PayPalPayButton({
  draftId,
  totalCents,
  tipCents,
  onSuccess,
  onCommitError,
  isEs,
}: PayPalPayButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: cfg } = await supabase.functions.invoke("pay-then-book", {
          body: { action: "get-public-config" },
        });
        const clientId = cfg?.paypal_client_id;
        if (!clientId) throw new Error("PayPal client ID not configured");
        await loadPayPalSDK(clientId);
        const pp = getPayPal();
        if (!mounted || !pp || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        pp.Buttons({
          style: { layout: "horizontal", color: "blue", shape: "pill", height: 45, label: "pay", tagline: false },
          createOrder: async () => {
            const { data, error: fnErr } = await supabase.functions.invoke("pay-then-book", {
              body: { action: "prepare-paypal-order", draftId },
            });
            if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message);
            return data.orderID;
          },
          onApprove: async (data: { orderID: string }) => {
            // 1. Capture
            const { data: capData, error: capErr } = await supabase.functions.invoke("pay-then-book", {
              body: { action: "capture-paypal", orderID: data.orderID },
            });
            if (capErr || capData?.error) {
              setError(capData?.error || capErr?.message || "PayPal capture failed");
              return;
            }
            // 2. Commit booking (server verifies + creates Acuity)
            const { data: commitData, error: commitErr } = await supabase.functions.invoke("pay-then-book", {
              body: {
                action: "commit-and-book",
                draftId,
                paymentMethod: "paypal",
                paymentRef: data.orderID,
                amountPaidCents: totalCents,
                tipCents,
              },
            });
            if (commitErr || commitData?.error) {
              onCommitError(commitData?.error || commitErr?.message || "Booking failed", !!commitData?.refunded);
              return;
            }
            onSuccess(commitData as CommitResult);
          },
          onError: (err: unknown) => {
            setError((err as Error)?.message || "PayPal error");
          },
        }).render(containerRef.current);
        setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
        </div>
      )}
      <div ref={containerRef} />
      {error && <p className="text-xs text-center mt-2" style={{ color: "#ef4444" }}>{error}</p>}
    </div>
  );
}
