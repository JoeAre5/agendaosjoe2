CREATE OR REPLACE FUNCTION public.normalize_email(_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(lower(trim(coalesce(_email, ''))), '')
$$;

CREATE OR REPLACE FUNCTION public.merge_clients(_keep_id uuid, _discard_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _keep record;
  _discard record;
  _appts int := 0;
  _appt_members int := 0;
  _tx int := 0;
  _drafts int := 0;
  _wait int := 0;
  _wait_members int := 0;
  _loyalty_balance int := 0;
  _loyalty_tx int := 0;
  _reviews int := 0;
  _refs_referrer int := 0;
  _refs_referred int := 0;
  _attr int := 0;
  _push int := 0;
  _bcast int := 0;
  _notifications int := 0;
  _pending_pushes int := 0;
  _pwa_installs int := 0;
  _contacts int := 0;
  _filho_attempts int := 0;
  _recruitment int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;
  IF _keep_id IS NULL OR _discard_id IS NULL OR _keep_id = _discard_id THEN
    RAISE EXCEPTION 'invalid merge ids';
  END IF;

  SELECT * INTO _keep FROM public.clients WHERE id = _keep_id FOR UPDATE;
  IF _keep IS NULL THEN RAISE EXCEPTION 'keep client not found'; END IF;
  SELECT * INTO _discard FROM public.clients WHERE id = _discard_id FOR UPDATE;
  IF _discard IS NULL THEN RAISE EXCEPTION 'discard client not found'; END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 'merge_clients', 'client', _keep_id,
          jsonb_build_object('keep', to_jsonb(_keep), 'discard', to_jsonb(_discard)));

  WITH u AS (UPDATE public.appointments SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
  SELECT count(*)::int INTO _appts FROM u;

  BEGIN
    WITH u AS (UPDATE public.appointments SET booked_for_member_id = _keep_id WHERE booked_for_member_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _appt_members FROM u;
  EXCEPTION WHEN undefined_column THEN _appt_members := 0; END;

  WITH u AS (UPDATE public.transactions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
  SELECT count(*)::int INTO _tx FROM u;

  BEGIN
    WITH u AS (UPDATE public.booking_drafts SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _drafts FROM u;
  EXCEPTION WHEN undefined_column OR undefined_table THEN _drafts := 0; END;

  BEGIN
    WITH u AS (UPDATE public.waitlist SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _wait FROM u;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.waitlist WHERE client_id = _discard_id;
  WHEN undefined_table THEN _wait := 0; END;

  BEGIN
    WITH u AS (UPDATE public.waitlist_members SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _wait_members FROM u;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.waitlist_members WHERE client_id = _discard_id;
  WHEN undefined_table THEN _wait_members := 0; END;

  BEGIN
    INSERT INTO public.loyalty_points (client_id, balance, tier, updated_at)
    SELECT _keep_id, balance, tier, now()
    FROM public.loyalty_points
    WHERE client_id = _discard_id
    ON CONFLICT (client_id) DO UPDATE
      SET balance = public.loyalty_points.balance + EXCLUDED.balance,
          tier = CASE
            WHEN public.loyalty_points.balance + EXCLUDED.balance >= 500 THEN 'gold'
            WHEN public.loyalty_points.balance + EXCLUDED.balance >= 200 THEN 'silver'
            ELSE public.loyalty_points.tier
          END,
          updated_at = now();
    GET DIAGNOSTICS _loyalty_balance = ROW_COUNT;
    DELETE FROM public.loyalty_points WHERE client_id = _discard_id;
  EXCEPTION WHEN undefined_table THEN _loyalty_balance := 0; END;

  BEGIN
    WITH u AS (UPDATE public.loyalty_transactions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _loyalty_tx FROM u;
  EXCEPTION WHEN undefined_table THEN _loyalty_tx := 0; END;

  BEGIN
    WITH u AS (UPDATE public.reviews SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _reviews FROM u;
  EXCEPTION WHEN undefined_table THEN _reviews := 0; END;

  BEGIN
    WITH u AS (UPDATE public.referrals SET referrer_client_id = _keep_id WHERE referrer_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _refs_referrer FROM u;
    WITH u AS (UPDATE public.referrals SET referred_client_id = _keep_id WHERE referred_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _refs_referred FROM u;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    UPDATE public.referral_attributions ra
    SET referred_client_id = _keep_id
    WHERE ra.referred_client_id = _discard_id
      AND NOT EXISTS (
        SELECT 1 FROM public.referral_attributions x
        WHERE x.code = ra.code AND x.conversion_type = ra.conversion_type
          AND x.referred_client_id = _keep_id
      );
    GET DIAGNOSTICS _attr = ROW_COUNT;
    DELETE FROM public.referral_attributions WHERE referred_client_id = _discard_id;
  EXCEPTION WHEN undefined_table THEN _attr := 0; END;

  BEGIN
    WITH u AS (UPDATE public.push_subscriptions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _push FROM u;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.push_subscriptions WHERE client_id = _discard_id;
  WHEN undefined_table THEN _push := 0; END;

  BEGIN
    UPDATE public.broadcast_receipts br
    SET client_id = _keep_id
    WHERE br.client_id = _discard_id
      AND NOT EXISTS (
        SELECT 1 FROM public.broadcast_receipts x
        WHERE x.broadcast_id = br.broadcast_id AND x.client_id = _keep_id
      );
    GET DIAGNOSTICS _bcast = ROW_COUNT;
    DELETE FROM public.broadcast_receipts WHERE client_id = _discard_id;
  EXCEPTION WHEN undefined_table THEN _bcast := 0; END;

  BEGIN
    WITH u AS (UPDATE public.notification_dispatch_log SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _notifications FROM u;
  EXCEPTION WHEN undefined_table THEN _notifications := 0; END;

  BEGIN
    WITH u AS (UPDATE public.pending_recurring_pushes SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _pending_pushes FROM u;
  EXCEPTION WHEN undefined_table THEN _pending_pushes := 0; END;

  BEGIN
    WITH u AS (UPDATE public.pwa_installs SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _pwa_installs FROM u;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.pwa_installs WHERE client_id = _discard_id;
  WHEN undefined_table THEN _pwa_installs := 0; END;

  BEGIN
    WITH u AS (UPDATE public.contact_submissions SET matched_client_id = _keep_id WHERE matched_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _contacts FROM u;
  EXCEPTION WHEN undefined_table THEN _contacts := 0; END;

  BEGIN
    WITH u AS (UPDATE public.filho_identity_attempts SET matched_client_id = _keep_id WHERE matched_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _filho_attempts FROM u;
  EXCEPTION WHEN undefined_table THEN _filho_attempts := 0; END;

  BEGIN
    WITH u AS (UPDATE public.recruitment_submissions SET matched_client_id = _keep_id WHERE matched_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _recruitment FROM u;
  EXCEPTION WHEN undefined_table THEN _recruitment := 0; END;

  UPDATE public.clients
  SET email = CASE WHEN public.normalize_email(clients.email) IS NULL THEN _discard.email ELSE clients.email END,
      phone = CASE WHEN public.normalize_phone(clients.phone) IS NULL THEN _discard.phone ELSE clients.phone END,
      first_name = COALESCE(NULLIF(first_name, ''), _discard.first_name),
      last_name = COALESCE(NULLIF(last_name, ''), _discard.last_name),
      auth_user_id = COALESCE(auth_user_id, _discard.auth_user_id),
      acuity_client_id = COALESCE(acuity_client_id, _discard.acuity_client_id),
      preferred_barber_id = COALESCE(preferred_barber_id, _discard.preferred_barber_id),
      is_guest = CASE WHEN auth_user_id IS NOT NULL OR _discard.auth_user_id IS NOT NULL THEN false ELSE is_guest END,
      account_verified = account_verified OR COALESCE(_discard.account_verified, false),
      notify_email_marketing = notify_email_marketing OR COALESCE(_discard.notify_email_marketing, false),
      notify_sms_marketing = notify_sms_marketing OR COALESCE(_discard.notify_sms_marketing, false),
      notify_whatsapp_marketing = notify_whatsapp_marketing OR COALESCE(_discard.notify_whatsapp_marketing, false),
      notify_push_appointments = notify_push_appointments OR COALESCE(_discard.notify_push_appointments, false),
      notify_email_appointments = notify_email_appointments OR COALESCE(_discard.notify_email_appointments, false),
      notify_sms_appointments = notify_sms_appointments OR COALESCE(_discard.notify_sms_appointments, false),
      notify_whatsapp_appointments = notify_whatsapp_appointments OR COALESCE(_discard.notify_whatsapp_appointments, false),
      newsletter_opt_in = newsletter_opt_in OR COALESCE(_discard.newsletter_opt_in, false),
      newsletter_opt_in_at = COALESCE(newsletter_opt_in_at, _discard.newsletter_opt_in_at),
      newsletter_source = COALESCE(newsletter_source, _discard.newsletter_source),
      newsletter_language = COALESCE(NULLIF(newsletter_language, ''), _discard.newsletter_language),
      onboarding_completed = onboarding_completed OR COALESCE(_discard.onboarding_completed, false),
      onboarding_completed_at = COALESCE(onboarding_completed_at, _discard.onboarding_completed_at),
      notifications_enabled = notifications_enabled OR COALESCE(_discard.notifications_enabled, false),
      notifications_permission_asked = notifications_permission_asked OR COALESCE(_discard.notifications_permission_asked, false),
      avatar_url = COALESCE(avatar_url, _discard.avatar_url),
      date_of_birth = COALESCE(date_of_birth, _discard.date_of_birth),
      gender = COALESCE(gender, _discard.gender),
      stripe_customer_id = COALESCE(stripe_customer_id, _discard.stripe_customer_id),
      default_payment_method_id = COALESCE(default_payment_method_id, _discard.default_payment_method_id),
      card_brand = COALESCE(card_brand, _discard.card_brand),
      card_last4 = COALESCE(card_last4, _discard.card_last4),
      preferred_payment_method = COALESCE(preferred_payment_method, _discard.preferred_payment_method),
      ath_phone = COALESCE(ath_phone, _discard.ath_phone),
      ath_phone_last4 = COALESCE(ath_phone_last4, _discard.ath_phone_last4),
      notes = NULLIF(trim(concat_ws(E'\n', NULLIF(clients.notes, ''), NULLIF(_discard.notes, ''))), ''),
      updated_at = now()
  WHERE id = _keep_id;

  DELETE FROM public.clients WHERE id = _discard_id;

  UPDATE public.clients SET
    total_visits = COALESCE((SELECT count(*) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'), 0),
    total_spent_cents = COALESCE((SELECT COALESCE(sum(total_cents), 0) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'), 0),
    last_visit_at = COALESCE(
      (SELECT max(created_at) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'),
      (SELECT max(starts_at) FROM public.appointments WHERE client_id = _keep_id AND status <> 'cancelled')
    ),
    updated_at = now()
  WHERE id = _keep_id;

  RETURN jsonb_build_object('success', true, 'kept_id', _keep_id, 'discarded_id', _discard_id, 'appointments_moved', _appts, 'transactions_moved', _tx);
END;
$$;

DO $$
DECLARE
  g record;
  keep_id uuid;
  discard_id uuid;
BEGIN
  FOR g IN
    SELECT public.normalize_email(email) AS email_key,
           array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids
    FROM public.clients
    WHERE public.normalize_email(email) IS NOT NULL
    GROUP BY public.normalize_email(email)
    HAVING count(*) > 1
  LOOP
    keep_id := g.ids[1];
    FOREACH discard_id IN ARRAY g.ids[2:array_length(g.ids, 1)] LOOP
      PERFORM public.merge_clients(keep_id, discard_id);
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_client_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
  _norm_phone text;
  _norm_email text;
BEGIN
  _norm_phone := public.normalize_phone(NEW.phone);
  _norm_email := public.normalize_email(NEW.email);

  IF _norm_phone IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.clients WHERE id <> NEW.id AND public.normalize_phone(phone) = _norm_phone LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_client_phone: existing_id=%', _existing_id USING ERRCODE = '23505';
    END IF;
  END IF;

  IF _norm_email IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.clients WHERE id <> NEW.id AND public.normalize_email(email) = _norm_email LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_client_email: existing_id=%', _existing_id USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_prevent_duplicate_phone ON public.clients;
DROP TRIGGER IF EXISTS clients_prevent_duplicate_identity ON public.clients;
CREATE TRIGGER clients_prevent_duplicate_identity
BEFORE INSERT OR UPDATE OF phone, email ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_client_identity();

DROP INDEX IF EXISTS public.clients_phone_normalized_unique;
CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_normalized_unique ON public.clients (public.normalize_phone(phone)) WHERE public.normalize_phone(phone) IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clients_email_normalized_unique ON public.clients (public.normalize_email(email)) WHERE public.normalize_email(email) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_client_by_identity(_phone text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (SELECT public.normalize_phone(_phone) AS norm_phone, public.normalize_email(_email) AS norm_email)
  SELECT c.id
  FROM public.clients c, input i
  WHERE (i.norm_phone IS NOT NULL AND public.normalize_phone(c.phone) = i.norm_phone)
     OR (i.norm_email IS NOT NULL AND public.normalize_email(c.email) = i.norm_email)
  ORDER BY CASE WHEN i.norm_phone IS NOT NULL AND public.normalize_phone(c.phone) = i.norm_phone THEN 0 ELSE 1 END,
           c.total_visits DESC NULLS LAST,
           c.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.find_client_by_phone(_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.find_client_by_identity(_phone, NULL)
$$;

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
  IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.client_name IS NULL OR trim(NEW.client_name) = '' OR trim(NEW.client_name) = 'Cliente eliminado' THEN RETURN NEW; END IF;

  found_client_id := public.find_client_by_identity(NEW.client_phone, NEW.client_email);

  IF found_client_id IS NULL AND NEW.client_phone IS NULL AND NEW.client_email IS NULL THEN
    SELECT id INTO found_client_id
    FROM public.clients
    WHERE ((first_name || ' ' || COALESCE(last_name, '')) ILIKE trim(NEW.client_name)
      OR (first_name ILIKE split_part(trim(NEW.client_name), ' ', 1)
          AND COALESCE(last_name, '') ILIKE COALESCE(nullif(substring(trim(NEW.client_name) from position(' ' in trim(NEW.client_name)) + 1), ''), '')))
    ORDER BY total_visits DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  IF found_client_id IS NULL THEN
    name_parts := string_to_array(trim(NEW.client_name), ' ');
    f_name := name_parts[1];
    l_name := CASE WHEN array_length(name_parts, 1) > 1 THEN array_to_string(name_parts[2:], ' ') ELSE NULL END;
    INSERT INTO public.clients (first_name, last_name, phone, email)
    VALUES (f_name, l_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO found_client_id;
  END IF;

  NEW.client_id := found_client_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_client_groups()
RETURNS TABLE(group_key text, match_type text, client_ids uuid[], client_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  RETURN QUERY
  WITH email_groups AS (
    SELECT public.normalize_email(email) AS k, 'email'::text AS mt, array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM public.clients
    WHERE public.normalize_email(email) IS NOT NULL
    GROUP BY public.normalize_email(email)
    HAVING count(*) >= 2
  ),
  phone_groups AS (
    SELECT public.normalize_phone(phone) AS k, 'phone'::text AS mt, array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM public.clients
    WHERE public.normalize_phone(phone) IS NOT NULL
    GROUP BY public.normalize_phone(phone)
    HAVING count(*) >= 2
  )
  SELECT k, mt, ids, n FROM email_groups
  UNION ALL
  SELECT k, mt, ids, n FROM phone_groups
  ORDER BY n DESC, mt;
END;
$$;