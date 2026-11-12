/**
 * ThreadModal — full-screen reader for an inbound email thread, with the
 * Filho orb in the corner. Tap orb → AI generates a reply draft → owner
 * edits → Send fires send-inbox-reply (which routes through
 * send-transactional-email → noreply@charliesbarbershop.co).
 */
import { useEffect, useState } from "react";
import { X, Send, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { toast } from "sonner";
import type { ReplyRow } from "./RepliesPane";

interface Thread {
  threadKey: string;
  subject: string;
  participants: string[];
  latest: ReplyRow;
  messages: ReplyRow[];
  hasNew: boolean;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-PR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ThreadModal({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  // Auto-mark all "new" messages in this thread as read on open
  useEffect(() => {
    const newIds = thread.messages.filter(m => m.status === "new").map(m => m.id);
    if (newIds.length > 0) {
      supabase.from("contact_submissions")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", newIds)
        .then(() => {});
    }
  }, [thread.threadKey]);

  const recipient = thread.latest.from_email || thread.latest.email || "";
  const recipientName = [thread.latest.first_name, thread.latest.last_name].filter(Boolean).join(" ");
  const language = (thread.latest.language === "en" ? "en" : "es") as "es" | "en";

  async function generateDraft() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("filo-reply-suggest", {
        body: {
          thread: thread.messages.map(m => ({
            from: m.from_email || m.email,
            date: m.created_at,
            subject: m.subject,
            body: m.message,
          })),
          language,
          recipientName,
        },
      });
      if (error) throw error;
      const draft = (data as any)?.draft || "";
      if (!draft) throw new Error("Filho no devolvió texto");
      setBody(draft);
      setComposerOpen(true);
    } catch (e: any) {
      toast.error(`Filho falló: ${e?.message || "error"}`);
    } finally {
      setGenerating(false);
    }
  }

  async function send() {
    if (!body.trim() || !recipient) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-inbox-reply", {
        body: {
          recipientEmail: recipient,
          name: recipientName || undefined,
          subject: thread.subject,
          body: body.trim(),
          language,
          submissionId: thread.latest.id,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Respuesta enviada");
      onClose();
    } catch (e: any) {
      toast.error(`No se pudo enviar: ${e?.message || "error"}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg-base)" }}>
      <div className="sticky top-0 flex items-center justify-between px-4 pt-12 pb-3" style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border-subtle)" }}>
        <button onClick={onClose} className="p-1">
          <X size={22} style={{ color: "var(--text-primary)" }} />
        </button>
        <p className="text-sm font-bold flex-1 text-center px-2 truncate" style={{ color: "var(--text-primary)" }}>{thread.subject}</p>
        <div style={{ width: 22 }} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-40">
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {recipient}{recipientName ? ` · ${recipientName}` : ""}
        </p>
        {thread.messages.map(m => (
          <div key={m.id} className="rounded-2xl p-4 card-elevated">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {m.from_email || m.email || "?"}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{fmtDate(m.created_at)}</p>
            </div>
            <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{m.message || ""}</p>
          </div>
        ))}

        {composerOpen && (
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--accent-color)" }}>
            <div className="flex items-center gap-2 mb-2">
              <AnimatedOrbNavIcon size={18} />
              <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Borrador de Filho</p>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              className="w-full text-xs p-3 rounded-lg resize-none"
              style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
            />
            <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
              Se enviará desde noreply@charliesbarbershop.co a {recipient}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={generateDraft}
                disabled={generating}
                className="flex-1 text-[11px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
              >
                <Pencil size={12} className="icon-bold" />
                {generating ? "Generando..." : "Regenerar"}
              </button>
              <button
                onClick={send}
                disabled={sending || !body.trim()}
                className="flex-[2] text-[11px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
              >
                <Send size={12} className="icon-bold" />
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filho orb FAB */}
      {!composerOpen && (
        <button
          onClick={generateDraft}
          disabled={generating}
          className="fixed bottom-6 right-5 z-50 rounded-full p-4 shadow-2xl flex items-center gap-2"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-subtle)" }}
          aria-label="Generar respuesta con Filho"
        >
          <AnimatedOrbNavIcon size={28} />
          <span className="text-xs font-bold pr-1" style={{ color: "var(--text-primary)" }}>
            {generating ? "Filho está pensando..." : "Responder con Filho"}
          </span>
        </button>
      )}
    </div>
  );
}
