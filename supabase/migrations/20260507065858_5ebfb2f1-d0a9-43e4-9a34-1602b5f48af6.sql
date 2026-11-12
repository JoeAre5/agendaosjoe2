INSERT INTO public.launch_checklist (category, title, description, status, weight, sort_order, confirmed_at, confirmed_by_note)
VALUES (
  'seguridad',
  'Security audit - 83 warnings reviewed, OTP expiry fixed, public buckets verified',
  'Linter run 2026-05-07: 0 errors, 83 WARN (77 cosmetic SECURITY DEFINER grants, 5 public bucket listings, 1 OTP expiry). OTP expiry shortened to 1h. Public buckets audited: product-images, barber-avatars, broadcast-images, blog-covers, author-avatars, email-assets — all contain only non-sensitive image assets (UUID-named).',
  'done',
  1,
  100,
  now(),
  'Auto-completed by audit on 2026-05-07'
);

UPDATE public.launch_checklist
SET status = 'done', updated_at = now(), confirmed_at = now(),
    confirmed_by_note = 'Verified via linter + manual bucket audit 2026-05-07'
WHERE id = '3be68665-e0fa-4979-ade0-0fcb021e14ef';