UPDATE public.launch_checklist
SET status = 'done', confirmed_at = now(), confirmed_by_note = 'SEO localizado por idioma + indexable; legales sin noindex'
WHERE id IN ('99353e9f-0872-48be-a33c-3ee7a9514e61','3022b6b2-7025-4e31-a5cc-25729c3b3dcf');