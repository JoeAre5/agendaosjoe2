UPDATE public.launch_checklist
SET status = 'done', confirmed_at = now(), confirmed_by_note = 'Verified end-to-end with new Replies tab + Filo reply wizard'
WHERE id IN ('e8232a3a-669a-44ca-a117-642e2aa824df','5b1d6723-e7d9-4598-9fd5-aa7f8c9580ef');