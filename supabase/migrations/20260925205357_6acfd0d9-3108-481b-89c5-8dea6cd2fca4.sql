CREATE OR REPLACE FUNCTION public.payroll_week_closed(_starts_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _starts_at IS NULL THEN false ELSE
    now() >= (
      ((_starts_at AT TIME ZONE 'America/Puerto_Rico')::date
        - ((extract(dow FROM (_starts_at AT TIME ZONE 'America/Puerto_Rico'))::int + 1) % 7)
        + 7)::timestamp AT TIME ZONE 'America/Puerto_Rico'
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.guard_closed_week_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _appt_id uuid;
  _starts timestamptz;
BEGIN
  -- System processes (webhooks, sync, edge functions) and owners are allowed
  IF _uid IS NULL
     OR public.has_role(_uid, 'owner'::app_role)
     OR public.has_role(_uid, 'super_owner'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    _appt_id := COALESCE(NEW.appointment_id, OLD.appointment_id);
    IF _appt_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
    SELECT starts_at INTO _starts FROM public.appointments WHERE id = _appt_id;
    IF TG_OP = 'UPDATE' AND OLD.appointment_id IS DISTINCT FROM NEW.appointment_id AND OLD.appointment_id IS NOT NULL THEN
      IF public.payroll_week_closed((SELECT starts_at FROM public.appointments WHERE id = OLD.appointment_id)) THEN
        RAISE EXCEPTION 'Semana cerrada: solo el dueño puede cambiar pagos de semanas anteriores.' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    IF NOT (
      OLD.payment_confirmed IS DISTINCT FROM NEW.payment_confirmed OR
      OLD.amount_paid_cents IS DISTINCT FROM NEW.amount_paid_cents OR
      OLD.price_cents IS DISTINCT FROM NEW.price_cents OR
      OLD.tip_cents IS DISTINCT FROM NEW.tip_cents OR
      OLD.payment_method IS DISTINCT FROM NEW.payment_method OR
      OLD.barber_id IS DISTINCT FROM NEW.barber_id OR
      OLD.starts_at IS DISTINCT FROM NEW.starts_at
    ) THEN
      RETURN NEW;
    END IF;
    _starts := OLD.starts_at;
  END IF;

  IF public.payroll_week_closed(_starts) THEN
    RAISE EXCEPTION 'Semana cerrada: solo el dueño puede cambiar pagos de semanas anteriores.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_closed_week_tx ON public.transactions;
CREATE TRIGGER trg_guard_closed_week_tx
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_week_payments();

DROP TRIGGER IF EXISTS trg_guard_closed_week_appt ON public.appointments;
CREATE TRIGGER trg_guard_closed_week_appt
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_week_payments();