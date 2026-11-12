// PayQrSheet — shows a QR + share link for an unpaid appointment.
//
// The QR encodes /pay/<code>, where <code> is a signed, expiring pay-link code
// issued by the server for THIS appointment and its current balance. The
// appointment id alone cannot open the pay page.
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  appointmentId: string;
  clientName: string;
  clientPhone?: string | null;
  serviceName: string;
  balanceCents: number;
  isEs: boolean;
  onClose: () => void;
}

const PUBLIC_ORIGIN = "https://charliesbarbershop.co";

export default function PayQrSheet({
  appointmentId,
  clientName,
  clientPhone,
  serviceName,
  balanceCents,
  isEs,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const call = () => supabase.functions.invoke("create-pay-link", { body: { appointmentId } });
      let { data, error } = await call();
      // Installed apps can hold a stale session; refresh once and retry.
      if (error || !(data as { code?: string } | null)?.code) {
        await supabase.auth.refreshSession().catch(() => null);
        ({ data, error } = await call());
      }
      if (!alive) return;
      const c = (data as { code?: string } | null)?.code;
      if (error || !c) {
        let reason = "";
        try { reason = (await (error as { context?: Response })?.context?.json())?.error || ""; } catch { /* ignore */ }
        console.error("create-pay-link failed", reason, error);
        const msg: Record<string, [string, string]> = {
          already_paid: ["Esta cita ya está pagada.", "This appointment is already paid."],
          forbidden: ["No tienes permiso para cobrar esta cita.", "You can't charge this appointment."],
          unauthorized: ["Tu sesión expiró. Cierra sesión y vuelve a entrar.", "Your session expired. Sign out and back in."],
          appointment_cancelled: ["Esta cita está cancelada.", "This appointment is cancelled."],
        };
        const m = msg[reason];
        setErr(m ? m[isEs ? 0 : 1] : isEs ? "No se pudo crear el enlace de pago." : "Couldn't create the payment link.");
      } else setCode(c);
    })();
    return () => { alive = false; };
  }, [appointmentId, balanceCents, isEs]);

  const url = code ? `${PUBLIC_ORIGIN}/pay/${code}` : "";
  const amount = `$${(balanceCents / 100).toFixed(2)}`;

  const message = isEs
    ? `Hola ${clientName.split(" ")[0]}, aquí tienes el enlace para pagar tu cita (${serviceName}) por ${amount}: ${url}`
    : `Hi ${clientName.split(" ")[0]}, here's the link to pay for your appointment (${serviceName}) for ${amount}: ${url}`;

  const waDigits = (clientPhone || "").replace(/\D/g, "").slice(-10);
  const waHref = waDigits.length === 10
    ? `https://wa.me/1${waDigits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 space-y-4"
        style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[17px] font-extrabold" style={{ color: "var(--text-primary)" }}>
              {isEs ? "Cobrar con QR" : "Charge with QR"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {isEs ? "Cualquier persona puede escanear y pagar esta cita" : "Anyone can scan and pay this appointment"}
            </p>
          </div>
          <button onClick={onClose} aria-label={isEs ? "Cerrar" : "Close"} className="p-1.5 rounded-full" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="p-4 rounded-2xl flex items-center justify-center" style={{ background: "#fff", width: 248, height: 248 }}>
            {code ? (
              <QRCodeSVG value={url} size={216} level="M" />
            ) : err ? (
              <p className="text-[12px] text-center" style={{ color: "#b00020" }}>{err}</p>
            ) : (
              <Loader2 size={28} className="animate-spin" style={{ color: "#555" }} />
            )}
          </div>
          <div className="text-center">
            <p className="text-[22px] font-black" style={{ color: "var(--text-primary)" }}>{amount}</p>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{serviceName}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copy}
            disabled={!code}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? (isEs ? "Copiado" : "Copied") : (isEs ? "Copiar enlace" : "Copy link")}
          </button>
          <a
            href={code ? waHref : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!code}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13px] font-semibold ${code ? "" : "opacity-50 pointer-events-none"}`}
            style={{ background: "#25D366", color: "#062e14" }}
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>

        <p className="text-[11px] text-center" style={{ color: "var(--text-tertiary)" }}>
          {isEs
            ? "El pago se aplica solo a esta cita. El enlace vence en 7 días o si cambia el balance."
            : "The payment applies only to this appointment. The link expires in 7 days or if the balance changes."}
        </p>
      </div>
    </div>
  );
}
