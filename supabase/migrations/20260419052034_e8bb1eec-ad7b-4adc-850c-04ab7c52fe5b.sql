-- 1. Helper function: extract last 10 digits from any phone format
CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _phone IS NULL THEN NULL
    WHEN length(regexp_replace(_phone, '[^0-9]', '', 'g')) < 10 THEN NULL
    ELSE RIGHT(regexp_replace(_phone, '[^0-9]', '', 'g'), 10)
  END
$$;

-- 2. Trigger: on insert/update of clients, if a row with same normalized phone
-- already exists, raise a friendly error so callers can recover.
-- (We avoid auto-merge on insert because admin flow already has logic
-- to pick existing clients; we just want to block silent duplicate creation.)
CREATE OR REPLACE FUNCTION public.prevent_duplicate_client_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
  _norm text;
BEGIN
  _norm := public.normalize_phone(NEW.phone);
  IF _norm IS NULL THEN
    RETURN NEW; -- nothing to check (no phone or invalid)
  END IF;

  SELECT id INTO _existing_id
  FROM public.clients
  WHERE id <> NEW.id
    AND public.normalize_phone(phone) = _norm
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_client_phone: existing_id=%', _existing_id
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_prevent_duplicate_phone ON public.clients;
CREATE TRIGGER clients_prevent_duplicate_phone
BEFORE INSERT OR UPDATE OF phone ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_client_phone();

-- 3. Unique index on normalized phone (defense-in-depth, also speeds lookups)
CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_normalized_unique
  ON public.clients (public.normalize_phone(phone))
  WHERE public.normalize_phone(phone) IS NOT NULL;

-- 4. Helper RPC: find client by normalized phone (used by admin client picker)
CREATE OR REPLACE FUNCTION public.find_client_by_phone(_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients
  WHERE public.normalize_phone(phone) = public.normalize_phone(_phone)
  LIMIT 1
$$;