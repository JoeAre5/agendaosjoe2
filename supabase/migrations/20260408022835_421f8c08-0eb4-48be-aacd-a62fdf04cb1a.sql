
-- Barber can update products (for stock decrement)
CREATE POLICY "Barber update product stock"
ON public.products FOR UPDATE TO authenticated
USING (is_barber())
WITH CHECK (is_barber());

-- Barber can update transactions (for status after payment)  
CREATE POLICY "Barber update own transactions"
ON public.transactions FOR UPDATE TO authenticated
USING (is_barber());

-- Owner can update transactions
CREATE POLICY "Owner update transactions"
ON public.transactions FOR UPDATE TO authenticated
USING (is_owner());

-- Barber can read own transactions
CREATE POLICY "Barber read own transactions"
ON public.transactions FOR SELECT TO authenticated
USING (is_barber());

-- Barber can read transaction items
CREATE POLICY "Barber read transaction items"
ON public.transaction_items FOR SELECT TO authenticated
USING (is_barber());

-- Enable realtime for transactions (ATH Movil polling)
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
