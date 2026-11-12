-- ============================================================
-- Shop Media library: owner-curated marketing assets for barbers
-- ============================================================

CREATE TABLE public.shop_media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_es text NOT NULL,
  name_en text NOT NULL,
  description_es text,
  description_en text,
  sort_order integer NOT NULL DEFAULT 0,
  is_public_to_barbers boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_media_folders TO authenticated;
GRANT ALL ON public.shop_media_folders TO service_role;
ALTER TABLE public.shop_media_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage folders"
  ON public.shop_media_folders FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Staff can view visible folders"
  ON public.shop_media_folders FOR SELECT
  USING (public.is_owner() OR (public.is_barber() AND is_public_to_barbers = true));

CREATE TRIGGER update_shop_media_folders_updated_at
  BEFORE UPDATE ON public.shop_media_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================

CREATE TABLE public.shop_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.shop_media_folders(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  title text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_media_assets_folder_idx ON public.shop_media_assets(folder_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_media_assets TO authenticated;
GRANT ALL ON public.shop_media_assets TO service_role;
ALTER TABLE public.shop_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage assets"
  ON public.shop_media_assets FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Staff can view assets in visible folders"
  ON public.shop_media_assets FOR SELECT
  USING (
    public.is_owner() OR (
      public.is_barber() AND EXISTS (
        SELECT 1 FROM public.shop_media_folders f
        WHERE f.id = folder_id AND f.is_public_to_barbers = true
      )
    )
  );

CREATE TRIGGER update_shop_media_assets_updated_at
  BEFORE UPDATE ON public.shop_media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Storage RLS on the shop-media bucket (bucket is private; we'll
-- serve signed URLs for downloads).
-- ============================================================

CREATE POLICY "Owners full access to shop-media objects"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'shop-media' AND public.is_owner())
  WITH CHECK (bucket_id = 'shop-media' AND public.is_owner());

CREATE POLICY "Staff can read shop-media objects in visible folders"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shop-media' AND (
      public.is_owner() OR (
        public.is_barber() AND EXISTS (
          SELECT 1
          FROM public.shop_media_assets a
          JOIN public.shop_media_folders f ON f.id = a.folder_id
          WHERE a.storage_path = storage.objects.name
            AND f.is_public_to_barbers = true
        )
      )
    )
  );

-- ============================================================
-- Seed starter folders
-- ============================================================

INSERT INTO public.shop_media_folders (slug, name_es, name_en, description_es, description_en, sort_order, is_public_to_barbers) VALUES
  ('tiktok-stories',     'TikTok / Stories',     'TikTok / Stories',     'Vertical 9:16 para TikTok y Stories',     'Vertical 9:16 for TikTok and Stories',     10, true),
  ('instagram-feed',     'Instagram Feed',       'Instagram Feed',       'Cuadrado 1:1 y vertical 4:5 para el feed', 'Square 1:1 and vertical 4:5 for the feed', 20, true),
  ('instagram-carousel', 'Instagram Carousel',   'Instagram Carousel',   'Sets de imágenes para carruseles',         'Image sets for carousels',                 30, true),
  ('facebook-horizontal','Facebook / Horizontal','Facebook / Horizontal','Horizontal 16:9 para Facebook y YouTube',  'Horizontal 16:9 for Facebook and YouTube', 40, true);
