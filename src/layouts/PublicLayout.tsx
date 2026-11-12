import { Outlet } from "react-router-dom";
import { PublicNav } from "@/components/site/PublicNav";
import { PublicFooter } from "@/components/site/PublicFooter";
import { StickyBookingBar } from "@/components/site/StickyBookingBar";
import { PublicBookingFlow } from "@/components/site/PublicBookingFlow";
import { BookingProvider } from "@/contexts/BookingContext";
import { SiteContentProvider } from "@/contexts/SiteContentContext";
import FilhoButton from "@/components/site/FilhoButton";
import { CookieBanner } from "@/components/site/CookieBanner";

export function PublicLayout() {
  return (
    <SiteContentProvider>
      <BookingProvider>
        <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
          <PublicNav />
          <main>
            <Outlet />
          </main>
          <PublicFooter />
          <StickyBookingBar />
          <PublicBookingFlow />
          <FilhoButton />
          <CookieBanner />
        </div>
      </BookingProvider>
    </SiteContentProvider>
  );
}

