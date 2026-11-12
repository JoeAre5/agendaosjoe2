CREATE TABLE public.operational_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL DEFAULT public.current_shop_id() REFERENCES public.shops(id),
  expense_date date NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_expenses TO authenticated;
GRANT ALL ON public.operational_expenses TO service_role;
ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read_operational_expenses ON public.operational_expenses FOR SELECT TO authenticated USING (public.has_shop_role(shop_id, 'owner') OR public.has_shop_role(shop_id, 'super_owner'));
CREATE POLICY owner_insert_operational_expenses ON public.operational_expenses FOR INSERT TO authenticated WITH CHECK ((public.has_shop_role(shop_id, 'owner') OR public.has_shop_role(shop_id, 'super_owner')) AND created_by = auth.uid());
CREATE POLICY owner_update_operational_expenses ON public.operational_expenses FOR UPDATE TO authenticated USING (public.has_shop_role(shop_id, 'owner') OR public.has_shop_role(shop_id, 'super_owner')) WITH CHECK (public.has_shop_role(shop_id, 'owner') OR public.has_shop_role(shop_id, 'super_owner'));
CREATE POLICY owner_delete_operational_expenses ON public.operational_expenses FOR DELETE TO authenticated USING (public.has_shop_role(shop_id, 'owner') OR public.has_shop_role(shop_id, 'super_owner'));
CREATE INDEX operational_expenses_shop_date_idx ON public.operational_expenses(shop_id, expense_date);
CREATE FUNCTION public.stamp_operational_expense_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at; NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER operational_expense_update BEFORE UPDATE ON public.operational_expenses FOR EACH ROW EXECUTE FUNCTION public.stamp_operational_expense_update();
COMMENT ON TABLE public.operational_expenses IS 'Owner-managed dated one-off expenses for Home analysis. Separate from recurring weekly expenses and finalized payroll.';