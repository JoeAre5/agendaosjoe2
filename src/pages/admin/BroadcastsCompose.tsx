/**
 * Admin → Broadcast compose route. Wraps <BroadcastComposer /> with a header
 * and supports loading an existing draft via ?id=<broadcast_id>.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { SubpageHeader } from "@/components/SubpageHeader";
import { usePreferences } from "@/hooks/usePreferences";
import { BroadcastComposer } from "@/components/notifications/BroadcastComposer";

export default function BroadcastsCompose() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { language } = usePreferences();
  const es = language === "es";
  const draftId = params.get("id") || undefined;

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        sticky
        title={draftId ? (es ? "Editar borrador" : "Edit draft") : es ? "Componer broadcast" : "Compose broadcast"}
        subtitle={es
          ? "Tu borrador se guarda automáticamente en este dispositivo. Usa “Guardar borrador” para persistirlo en la nube."
          : "Your draft is auto-saved on this device. Use “Save as draft” to persist it to the cloud."}
        onBack={() => navigate("/admin/broadcasts")}
      />

      <div className="px-4 pt-4 pb-12">
        <BroadcastComposer
          draftId={draftId}
          onSent={() => navigate("/admin/broadcasts/manage")}
          onDraftSaved={(id) => {
            // Update URL so refresh keeps editing the same draft.
            if (!draftId) navigate(`/admin/broadcasts/compose?id=${id}`, { replace: true });
          }}
        />
      </div>
    </div>
  );
}
