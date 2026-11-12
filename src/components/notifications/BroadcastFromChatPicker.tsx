/**
 * Modal that lists recent admin FilhoChat conversations and lets the owner
 * convert one into a broadcast draft via the `broadcast-draft-from-chat`
 * edge function. The created draft opens in the composer for review.
 */
import { useEffect, useState } from "react";
import { X, Loader2, MessageCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Conv {
  id: string;
  summary: string | null;
  message_count: number;
  last_message_at: string;
}

interface Props {
  es: boolean;
  onClose: () => void;
  onDraftCreated: (id: string) => void;
}

export function BroadcastFromChatPicker({ es, onClose, onDraftCreated }: Props) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("filho_conversations")
        .select("id, summary, message_count, last_message_at")
        .eq("role", "admin")
        .gt("message_count", 1)
        .order("last_message_at", { ascending: false })
        .limit(15);
      if (cancelled) return;
      setConvs((data as Conv[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const generate = async (conversationId: string) => {
    setGeneratingId(conversationId);
    try {
      const { data, error } = await supabase.functions.invoke("broadcast-draft-from-chat", {
        body: { conversation_id: conversationId },
      });
      if (error) throw error;
      const result = data as { broadcast_id?: string; error?: string };
      if (result.error || !result.broadcast_id) throw new Error(result.error || "no_id");
      toast.success(es ? "Borrador creado" : "Draft created");
      onDraftCreated(result.broadcast_id);
    } catch (e: any) {
      toast.error(e.message || (es ? "Error al generar" : "Generation failed"));
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--divider)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {es ? "Generar desde FilhoChat" : "Generate from FilhoChat"}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Elige una conversación reciente." : "Pick a recent conversation."}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full"
            style={{ background: "var(--bg-surface-2)" }}>
            <X size={16} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
            </div>
          ) : convs.length === 0 ? (
            <p className="text-center text-[13px] py-8" style={{ color: "var(--text-tertiary)" }}>
              {es
                ? "No hay conversaciones de admin todavía. Habla con Filho desde el panel y vuelve aquí."
                : "No admin conversations yet. Chat with Filho from the panel first."}
            </p>
          ) : (
            <div className="space-y-2">
              {convs.map((c) => {
                const busy = generatingId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => !busy && generate(c.id)}
                    disabled={busy || generatingId !== null}
                    className="w-full text-left rounded-xl p-3 flex items-start gap-3 active:scale-[0.99] transition-transform card-elevated disabled:opacity-60"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "var(--bg-surface-2)" }}>
                      {busy
                        ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                        : <MessageCircle size={16} style={{ color: "var(--text-primary)" }} className="icon-bold" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold leading-tight line-clamp-2"
                        style={{ color: "var(--text-primary)" }}>
                        {c.summary || (es ? "(Sin resumen)" : "(No summary)")}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        {c.message_count} {es ? "mensajes · " : "messages · "}
                        {new Date(c.last_message_at).toLocaleDateString(es ? "es-PR" : "en-US",
                          { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    {!busy && <Wand2 size={14} style={{ color: "var(--accent-color)" }} className="mt-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
