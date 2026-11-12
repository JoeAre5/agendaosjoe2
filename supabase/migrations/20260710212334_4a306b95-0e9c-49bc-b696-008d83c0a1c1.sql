
-- Helper: current user's barber_id via profiles
CREATE OR REPLACE FUNCTION public.get_my_barber_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT barber_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ============================================================
-- barbers: restrict SELECT to own row for barbers; remove
-- broad access for clients (they must use barbers_public view).
-- ============================================================
DROP POLICY IF EXISTS "Barber read active barbers" ON public.barbers;
DROP POLICY IF EXISTS "Client read active barbers" ON public.barbers;

CREATE POLICY "Barber read own row"
ON public.barbers
FOR SELECT
USING (is_barber() AND id = public.get_my_barber_id());

-- ============================================================
-- appointments: keep shared SELECT for calendar visibility,
-- but restrict writes to the owning barber only.
-- ============================================================
DROP POLICY IF EXISTS "Barber full access appointments" ON public.appointments;

CREATE POLICY "Barber read appointments"
ON public.appointments
FOR SELECT
USING (is_barber());

CREATE POLICY "Barber insert own appointments"
ON public.appointments
FOR INSERT
WITH CHECK (is_barber() AND barber_id = public.get_my_barber_id());

CREATE POLICY "Barber update own appointments"
ON public.appointments
FOR UPDATE
USING (is_barber() AND barber_id = public.get_my_barber_id())
WITH CHECK (is_barber() AND barber_id = public.get_my_barber_id());

CREATE POLICY "Barber delete own appointments"
ON public.appointments
FOR DELETE
USING (is_barber() AND barber_id = public.get_my_barber_id());

-- ============================================================
-- block_times: same pattern — shared reads, own-only writes.
-- ============================================================
DROP POLICY IF EXISTS "Barber full access blocks" ON public.block_times;

CREATE POLICY "Barber read blocks"
ON public.block_times
FOR SELECT
USING (is_barber() OR has_role(auth.uid(), 'super_owner'::app_role));

CREATE POLICY "Barber insert own blocks"
ON public.block_times
FOR INSERT
WITH CHECK ((is_barber() AND barber_id = public.get_my_barber_id()) OR has_role(auth.uid(), 'super_owner'::app_role));

CREATE POLICY "Barber update own blocks"
ON public.block_times
FOR UPDATE
USING ((is_barber() AND barber_id = public.get_my_barber_id()) OR has_role(auth.uid(), 'super_owner'::app_role))
WITH CHECK ((is_barber() AND barber_id = public.get_my_barber_id()) OR has_role(auth.uid(), 'super_owner'::app_role));

CREATE POLICY "Barber delete own blocks"
ON public.block_times
FOR DELETE
USING ((is_barber() AND barber_id = public.get_my_barber_id()) OR has_role(auth.uid(), 'super_owner'::app_role));

-- ============================================================
-- transactions: restrict barber access to rows where they are
-- the barber_id or the commission_barber_id.
-- ============================================================
DROP POLICY IF EXISTS "Barber insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff read checkout transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff insert checkout transactions" ON public.transactions;

CREATE POLICY "Barber insert own transactions"
ON public.transactions
FOR INSERT
WITH CHECK (
  (is_barber() AND (barber_id = public.get_my_barber_id() OR commission_barber_id = public.get_my_barber_id()))
  OR has_role(auth.uid(), 'super_owner'::app_role)
);

CREATE POLICY "Staff read checkout transactions"
ON public.transactions
FOR SELECT
USING (
  is_owner()
  OR has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND (barber_id = public.get_my_barber_id() OR commission_barber_id = public.get_my_barber_id()))
);

CREATE POLICY "Staff insert checkout transactions"
ON public.transactions
FOR INSERT
WITH CHECK (
  is_owner()
  OR has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND (barber_id = public.get_my_barber_id() OR commission_barber_id = public.get_my_barber_id()))
);

-- ============================================================
-- transaction_items: scope barber access via parent transaction.
-- ============================================================
DROP POLICY IF EXISTS "Barber read transaction items" ON public.transaction_items;
DROP POLICY IF EXISTS "Barber update transaction items" ON public.transaction_items;
DROP POLICY IF EXISTS "Barber insert items" ON public.transaction_items;
DROP POLICY IF EXISTS "Staff read checkout transaction items" ON public.transaction_items;
DROP POLICY IF EXISTS "Staff insert checkout transaction items" ON public.transaction_items;

CREATE POLICY "Barber read own transaction items"
ON public.transaction_items
FOR SELECT
USING (
  has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
);

CREATE POLICY "Barber update own transaction items"
ON public.transaction_items
FOR UPDATE
USING (
  has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
);

CREATE POLICY "Barber insert own transaction items"
ON public.transaction_items
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
);

CREATE POLICY "Staff read checkout transaction items"
ON public.transaction_items
FOR SELECT
USING (
  is_owner()
  OR has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
);

CREATE POLICY "Staff insert checkout transaction items"
ON public.transaction_items
FOR INSERT
WITH CHECK (
  is_owner()
  OR has_role(auth.uid(), 'super_owner'::app_role)
  OR (is_barber() AND EXISTS (
    SELECT 1 FROM public.transactions tx
    WHERE tx.id = transaction_items.transaction_id
      AND (tx.barber_id = public.get_my_barber_id() OR tx.commission_barber_id = public.get_my_barber_id())
  ))
);
