-- ─── P0 Fix: Reorder ensure_client_exists() lookup priority ──────────────────
-- Root cause: old function matched ONLY by name (ILIKE), failing when DB has
-- nicknames like "La antorcha humana Ronald" while webhook sends "Ronald Lopez".
-- This forced a new client INSERT, which then tripped the
-- prevent_duplicate_client_phone trigger (ERRCODE 23505), aborting the
-- entire appointment transaction.
--
-- Fix: try phone (normalized) → email (lower exact) → name (legacy) → INSERT.
-- Tiebreaker: most-active client wins, then oldest record.
-- Never updates the matched client row; only stamps client_id on appointment.
--
-- ─── EMERGENCY ROLLBACK REFERENCE — original function body ───────────────────
-- CREATE OR REPLACE FUNCTION public.ensure_client_exists() ... (name-only match)
-- See migration history for full prior body. To revert: re-run prior migration
-- 20260415* that defined the original ensure_client_exists.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_client_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  found_client_id uuid;
  norm_phone text;
  norm_email text;
  name_parts text[];
  f_name text;
  l_name text;
BEGIN
  -- Skip if client_id is already set (caller / pre-resolve already linked it)
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip anonymized / deleted rows
  IF NEW.client_name IS NULL
     OR trim(NEW.client_name) = ''
     OR trim(NEW.client_name) = 'Cliente eliminado' THEN
    RETURN NEW;
  END IF;

  -- ─── 1. PHONE MATCH (preferred — last 10 digits, format-agnostic) ─────────
  norm_phone := public.normalize_phone(NEW.client_phone);
  IF norm_phone IS NOT NULL THEN
    SELECT id INTO found_client_id
    FROM public.clients
    WHERE public.normalize_phone(phone) = norm_phone
    ORDER BY total_visits DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- ─── 2. EMAIL MATCH (case-insensitive exact) ──────────────────────────────
  IF found_client_id IS NULL AND NEW.client_email IS NOT NULL AND trim(NEW.client_email) <> '' THEN
    norm_email := lower(trim(NEW.client_email));
    SELECT id INTO found_client_id
    FROM public.clients
    WHERE lower(email) = norm_email
    ORDER BY total_visits DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- ─── 3. NAME MATCH (legacy fallback — only when no phone/email signal) ────
  IF found_client_id IS NULL THEN
    SELECT id INTO found_client_id
    FROM public.clients
    WHERE (
      (first_name || ' ' || COALESCE(last_name, '')) ILIKE trim(NEW.client_name)
      OR (first_name ILIKE split_part(trim(NEW.client_name), ' ', 1)
          AND COALESCE(last_name, '') ILIKE COALESCE(nullif(substring(trim(NEW.client_name) from position(' ' in trim(NEW.client_name)) + 1), ''), ''))
    )
    AND (
      (NEW.client_phone IS NOT NULL AND phone = NEW.client_phone)
      OR (NEW.client_email IS NOT NULL AND email = NEW.client_email)
      OR (NEW.client_phone IS NULL AND NEW.client_email IS NULL)
    )
    ORDER BY total_visits DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- ─── 4. CREATE NEW CLIENT (only if all matches missed) ────────────────────
  IF found_client_id IS NULL THEN
    name_parts := string_to_array(trim(NEW.client_name), ' ');
    f_name := name_parts[1];
    l_name := CASE
      WHEN array_length(name_parts, 1) > 1
      THEN array_to_string(name_parts[2:], ' ')
      ELSE NULL
    END;

    INSERT INTO public.clients (first_name, last_name, phone, email)
    VALUES (f_name, l_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO found_client_id;
  END IF;

  -- Stamp on appointment ONLY. Never update the matched client row.
  NEW.client_id := found_client_id;
  RETURN NEW;
END;
$function$;