-- ─── 1. broadcasts ──────────────────────────────────────────────────────────
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pill_es text,
  pill_en text,
  title_es text NOT NULL,
  title_en text NOT NULL,
  body_es text NOT NULL,
  body_en text NOT NULL,
  hero_image_url text,
  cta_label_es text,
  cta_label_en text,
  cta_url text,
  status text NOT NULL DEFAULT 'draft', -- draft | sending | sent | failed
  audience_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access broadcasts"
ON public.broadcasts FOR ALL TO authenticated
USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "Service role full access broadcasts"
ON public.broadcasts FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER touch_broadcasts_updated_at
BEFORE UPDATE ON public.broadcasts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_broadcasts_sent_at ON public.broadcasts (sent_at DESC NULLS LAST);

-- ─── 2. broadcast_receipts ─────────────────────────────────────────────────
CREATE TABLE public.broadcast_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  push_success boolean NOT NULL DEFAULT false,
  push_error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE (broadcast_id, client_id)
);

ALTER TABLE public.broadcast_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read broadcast_receipts"
ON public.broadcast_receipts FOR SELECT TO authenticated
USING (is_owner());

CREATE POLICY "Client read own receipts"
ON public.broadcast_receipts FOR SELECT TO authenticated
USING (is_client() AND client_id = get_my_client_id());

CREATE POLICY "Client update own receipts"
ON public.broadcast_receipts FOR UPDATE TO authenticated
USING (is_client() AND client_id = get_my_client_id())
WITH CHECK (is_client() AND client_id = get_my_client_id());

CREATE POLICY "Service role full access broadcast_receipts"
ON public.broadcast_receipts FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_broadcast_receipts_client_unread
  ON public.broadcast_receipts (client_id) WHERE opened_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX idx_broadcast_receipts_broadcast ON public.broadcast_receipts (broadcast_id);

-- ─── 3. storage bucket for hero images ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('broadcast-images', 'broadcast-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read broadcast images"
ON storage.objects FOR SELECT
USING (bucket_id = 'broadcast-images');

CREATE POLICY "Owner upload broadcast images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'broadcast-images' AND is_owner());

CREATE POLICY "Owner update broadcast images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'broadcast-images' AND is_owner());

CREATE POLICY "Owner delete broadcast images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'broadcast-images' AND is_owner());