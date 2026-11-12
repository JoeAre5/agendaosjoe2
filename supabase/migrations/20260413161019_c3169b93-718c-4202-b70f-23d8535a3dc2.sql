-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_requested_at ON public.waitlist (requested_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_barber_id ON public.waitlist (barber_id);

-- Status constraint using a validation trigger (avoids CHECK immutability issues)
CREATE OR REPLACE FUNCTION public.validate_waitlist_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('waiting', 'seated', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid waitlist status: %. Allowed: waiting, seated, cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_waitlist_status
BEFORE INSERT OR UPDATE ON public.waitlist
FOR EACH ROW
EXECUTE FUNCTION public.validate_waitlist_status();