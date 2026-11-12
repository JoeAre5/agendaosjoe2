
-- ═══════════════════════════════════════════════════════
-- A: Auto-update client stats on transaction changes
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_client_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_client_id uuid;
BEGIN
  -- Determine which client_id to recalculate
  IF TG_OP = 'DELETE' THEN
    target_client_id := OLD.client_id;
  ELSE
    target_client_id := NEW.client_id;
    -- Also recalc old client if client_id changed
    IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id AND OLD.client_id IS NOT NULL THEN
      UPDATE public.clients SET
        total_visits = COALESCE((SELECT count(*) FROM public.transactions WHERE client_id = OLD.client_id AND status = 'completed'), 0),
        total_spent_cents = COALESCE((SELECT COALESCE(sum(total_cents), 0) FROM public.transactions WHERE client_id = OLD.client_id AND status = 'completed'), 0),
        last_visit_at = (SELECT max(created_at) FROM public.transactions WHERE client_id = OLD.client_id AND status = 'completed'),
        updated_at = now()
      WHERE id = OLD.client_id;
    END IF;
  END IF;

  IF target_client_id IS NOT NULL THEN
    UPDATE public.clients SET
      total_visits = COALESCE((SELECT count(*) FROM public.transactions WHERE client_id = target_client_id AND status = 'completed'), 0),
      total_spent_cents = COALESCE((SELECT COALESCE(sum(total_cents), 0) FROM public.transactions WHERE client_id = target_client_id AND status = 'completed'), 0),
      last_visit_at = (SELECT max(created_at) FROM public.transactions WHERE client_id = target_client_id AND status = 'completed'),
      updated_at = now()
    WHERE id = target_client_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_client_stats
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_client_stats();

-- ═══════════════════════════════════════════════════════
-- B: Auto-sync client_id from appointment to transaction
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_transaction_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id
    FROM public.appointments
    WHERE id = NEW.appointment_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_transaction_client_id
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_transaction_client_id();

-- ═══════════════════════════════════════════════════════
-- C: Auto-decrement product stock on transaction_items insert
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tx_status text;
BEGIN
  -- Only decrement for product items
  IF NEW.item_type != 'product' OR NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the parent transaction is completed
  SELECT status INTO tx_status FROM public.transactions WHERE id = NEW.transaction_id;
  IF tx_status = 'completed' THEN
    UPDATE public.products
    SET stock_count = GREATEST(0, stock_count - NEW.quantity),
        updated_at = now()
    WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_product_stock
AFTER INSERT ON public.transaction_items
FOR EACH ROW
EXECUTE FUNCTION public.decrement_product_stock();
