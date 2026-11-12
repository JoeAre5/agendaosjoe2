-- Add delete policy for transactions (owner only)
CREATE POLICY "Owner delete transactions"
ON public.transactions
FOR DELETE
USING (is_owner());

-- Add delete policy for transaction_items (owner only)
CREATE POLICY "Owner delete transaction items"
ON public.transaction_items
FOR DELETE
USING (is_owner());

-- Drop existing FK if any and re-add with CASCADE
ALTER TABLE public.transaction_items
DROP CONSTRAINT IF EXISTS transaction_items_transaction_id_fkey;

ALTER TABLE public.transaction_items
ADD CONSTRAINT transaction_items_transaction_id_fkey
FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
ON DELETE CASCADE;