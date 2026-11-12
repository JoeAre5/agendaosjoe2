
-- 1. Patch ensure_client_exists to skip anonymized rows
CREATE OR REPLACE FUNCTION public.ensure_client_exists()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  found_client_id uuid;
  name_parts text[];
  f_name text;
  l_name text;
BEGIN
  -- Skip if client_id is already set
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if no client_name
  IF NEW.client_name IS NULL OR trim(NEW.client_name) = '' THEN
    RETURN NEW;
  END IF;

  -- Skip anonymized / deleted rows
  IF trim(NEW.client_name) = 'Cliente eliminado' THEN
    RETURN NEW;
  END IF;

  -- Try to find existing client by name + phone or name + email
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
  LIMIT 1;

  -- If not found, create the client
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

  NEW.client_id := found_client_id;
  RETURN NEW;
END;
$function$;

-- 2. Create delete_client_safely function
CREATE OR REPLACE FUNCTION public.delete_client_safely(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client record;
  _appt_count int;
  _tx_count int;
  _wait_count int;
  _dup_count int;
  _dup_ids uuid[];
BEGIN
  -- Fetch client to delete
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  IF _client IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', _client_id;
  END IF;

  -- Find duplicate profiles (same normalized name + matching phone or email)
  SELECT array_agg(id), count(*)::int INTO _dup_ids, _dup_count
  FROM public.clients
  WHERE id != _client_id
    AND lower(trim(first_name)) = lower(trim(_client.first_name))
    AND lower(trim(COALESCE(last_name, ''))) = lower(trim(COALESCE(_client.last_name, '')))
    AND (
      (phone IS NOT NULL AND phone = _client.phone)
      OR (email IS NOT NULL AND email = _client.email)
    );

  IF _dup_ids IS NULL THEN
    _dup_ids := '{}';
    _dup_count := 0;
  END IF;

  -- Anonymize appointments for target + duplicates
  WITH updated AS (
    UPDATE public.appointments
    SET client_id = NULL,
        client_name = 'Cliente eliminado',
        client_phone = NULL,
        client_email = NULL
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _appt_count FROM updated;

  -- Nullify transactions
  WITH updated AS (
    UPDATE public.transactions
    SET client_id = NULL
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM updated;

  -- Nullify waitlist
  WITH updated AS (
    UPDATE public.waitlist
    SET client_id = NULL
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _wait_count FROM updated;

  -- Delete duplicates
  DELETE FROM public.clients WHERE id = ANY(_dup_ids);

  -- Delete the target client
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointments_cleaned', _appt_count,
    'transactions_cleaned', _tx_count,
    'waitlist_cleaned', _wait_count,
    'duplicates_removed', _dup_count
  );
END;
$function$;
