// FilhoButton — floating CTA on every public page that opens FilhoPublicModal.
// Visual: matches "Generar con Filho" pill from admin/blog (filo-cta + orb).
// Hidden on /app/* and /admin/*. Safe-area aware, sits above sticky bars.
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { useTranslation } from "@/hooks/useTranslation";
import FilhoPublicModal from "./FilhoPublicModal";

export default function FilhoButton() {
  const { language } = useTranslation();
  const es = language === "es";
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/app/") || pathname.startsWith("/admin")) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={es ? "Pregúntale a Filho" : "Ask Filho"}
        className="filo-cta fixed z-40 inline-flex items-center gap-2 px-4 h-11 rounded-full active:scale-[0.98] transition-transform shadow-lg"
        style={{
          right: 16,
          bottom: `calc(env(safe-area-inset-bottom, 0px) + 88px)`,
        }}
      >
        <AnimatedOrbNavIcon size={20} />
        <span className="text-[12px] font-semibold tracking-tight">
          {es ? "Asistente" : "Assistant"}
        </span>
      </button>
      {open && <FilhoPublicModal onClose={() => setOpen(false)} />}
    </>
  );
}
