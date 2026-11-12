
CREATE OR REPLACE FUNCTION public.ensure_client_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    -- Split name into first/last
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

  -- Link the appointment to the client
  NEW.client_id := found_client_id;
  RETURN NEW;
END;
$$;

-- Attach trigger to appointments table
CREATE TRIGGER trg_ensure_client_exists
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.ensure_client_exists();
