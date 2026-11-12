import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface BookingCtx {
  isOpen: boolean;
  preselectedBarberSlug: string | null;
  /**
   * Increments on every openBooking() call. PublicBookingFlow watches this
   * to force a full state reset on every fresh open — even when the user
   * navigated away (ATH/PayPal cancel) without ever calling closeBooking(),
   * which would otherwise leave `step="payment"` with a stale/null draft.
   */
  openNonce: number;
  openBooking: (barberSlug?: string) => void;
  closeBooking: () => void;
}

const Ctx = createContext<BookingCtx>({
  isOpen: false,
  preselectedBarberSlug: null,
  openNonce: 0,
  openBooking: () => {},
  closeBooking: () => {},
});

export function BookingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preselectedBarberSlug, setPreselectedBarberSlug] = useState<string | null>(null);
  const [openNonce, setOpenNonce] = useState(0);

  const openBooking = useCallback((barberSlug?: string) => {
    setPreselectedBarberSlug(barberSlug || null);
    setOpenNonce((n) => n + 1);
    setIsOpen(true);
  }, []);

  const closeBooking = useCallback(() => {
    setIsOpen(false);
    setPreselectedBarberSlug(null);
  }, []);

  return (
    <Ctx.Provider value={{ isOpen, preselectedBarberSlug, openNonce, openBooking, closeBooking }}>
      {children}
    </Ctx.Provider>
  );
}

export const useBooking = () => useContext(Ctx);
