// /citas/instala — PWA install bridge landing page.
// Wraps the shared InstallHomeScreenSection in a full-viewport frame with
// the language toggle, and routes the CTA to /citas/acceso (preserving the
// existing query string from the booking confirmation step).

import { useNavigate, useSearchParams } from "react-router-dom";
import LanguageToggle from "@/components/LanguageToggle";
import InstallHomeScreenSection from "@/components/site/InstallHomeScreenSection";

export default function InstallBridge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const onContinue = () => {
    const qs = params.toString();
    navigate(`/citas/acceso${qs ? `?${qs}` : ""}`);
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-[430px] min-h-[100dvh] flex flex-col relative overflow-hidden"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="absolute top-3 right-3 z-30">
          <LanguageToggle />
        </div>

        <div className="pt-10">
          <InstallHomeScreenSection
            ctaLabel={{ es: "Continuar", en: "Continue" }}
            onCta={onContinue}
          />
        </div>
      </div>
    </div>
  );
}
