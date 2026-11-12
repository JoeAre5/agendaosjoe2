
ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS social_facebook text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_tiktok text,
  ADD COLUMN IF NOT EXISTS ig_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_bookable boolean NOT NULL DEFAULT true;

ALTER TABLE public.barbers_public
  ADD COLUMN IF NOT EXISTS social_facebook text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_tiktok text,
  ADD COLUMN IF NOT EXISTS ig_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_bookable boolean NOT NULL DEFAULT true;

-- Update sync trigger to include new fields
CREATE OR REPLACE FUNCTION public.sync_barbers_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.barbers_public (
    id, name, avatar_url, color, description, acuity_calendar_id,
    show_in_checkout, is_default_checkout_barber, is_active, created_at,
    social_facebook, social_instagram, social_tiktok, ig_photos, is_bookable
  )
  VALUES (
    NEW.id, NEW.name, NEW.avatar_url, NEW.color, NEW.description, NEW.acuity_calendar_id,
    NEW.show_in_checkout, NEW.is_default_checkout_barber, NEW.is_active, NEW.created_at,
    NEW.social_facebook, NEW.social_instagram, NEW.social_tiktok,
    COALESCE(NEW.ig_photos, '{}'::text[]), COALESCE(NEW.is_bookable, true)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    color = EXCLUDED.color,
    description = EXCLUDED.description,
    acuity_calendar_id = EXCLUDED.acuity_calendar_id,
    show_in_checkout = EXCLUDED.show_in_checkout,
    is_default_checkout_barber = EXCLUDED.is_default_checkout_barber,
    is_active = EXCLUDED.is_active,
    created_at = EXCLUDED.created_at,
    social_facebook = EXCLUDED.social_facebook,
    social_instagram = EXCLUDED.social_instagram,
    social_tiktok = EXCLUDED.social_tiktok,
    ig_photos = EXCLUDED.ig_photos,
    is_bookable = EXCLUDED.is_bookable;
  RETURN NEW;
END;
$function$;

-- Backfill barbers_public from current barbers
UPDATE public.barbers_public p
SET social_facebook = b.social_facebook,
    social_instagram = b.social_instagram,
    social_tiktok = b.social_tiktok,
    ig_photos = COALESCE(b.ig_photos, '{}'::text[]),
    is_bookable = COALESCE(b.is_bookable, true)
FROM public.barbers b
WHERE p.id = b.id;

-- Mark Yvette as not bookable (matches by name; safe if missing)
UPDATE public.barbers SET is_bookable = false WHERE name ILIKE 'Yvette%';

-- Public storage bucket for barber gallery (IG grid + uploaded assets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('barber-gallery', 'barber-gallery', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read barber-gallery"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'barber-gallery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owner write barber-gallery"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'barber-gallery' AND public.is_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owner update barber-gallery"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'barber-gallery' AND public.is_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owner delete barber-gallery"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'barber-gallery' AND public.is_owner());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
