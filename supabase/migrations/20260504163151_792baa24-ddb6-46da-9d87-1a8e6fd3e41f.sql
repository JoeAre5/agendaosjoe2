-- Allow owner to add/edit/delete custom checklist items.
-- Status changes will still be made by us (AI) via service role per UX agreement —
-- we just don't expose a status toggle in the UI.
CREATE POLICY "Owner manage launch_checklist"
ON public.launch_checklist
FOR ALL
TO authenticated
USING (is_owner())
WITH CHECK (is_owner());