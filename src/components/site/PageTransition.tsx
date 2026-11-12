import { ReactNode } from "react";

// Per design decision: public-page page-transition animations removed.
// Only scroll-reveal (AnimatedSection), modals/sheets, and confirmation
// checkmarks remain animated on the public site.
export function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
