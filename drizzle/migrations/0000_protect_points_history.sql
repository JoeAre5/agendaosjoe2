CREATE TABLE public.client_rewards_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('ledger','redemption')),
  original_client_id uuid NOT NULL,
  phone10 text,
  email text,
  row_data jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  restored_to_client_id uuid,
  restored_at timestamptz
);
GRANT ALL ON public.client_rewards_archive TO service_role;
GRANT SELECT ON public.client_rewards_archive TO authenticated;
ALTER TABLE public.client_rewards_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read rewards archive" ON public.client_rewards_archive FOR SELECT TO authenticated USING (public.is_owner() OR public.is_super_admin());
CREATE INDEX idx_rewards_archive_phone ON public.client_rewards_archive (phone10) WHERE restored_at IS NULL;

CREATE OR REPLACE FUNCTION public.archive_client_rewards_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _keep uuid;
BEGIN
  SELECT entity_id INTO _keep FROM public.audit_log
  WHERE action = 'merge_clients' AND created_at = now() AND metadata->'discard'->>'id' = OLD.id::text
  ORDER BY created_at DESC LIMIT 1;
  IF _keep IS NOT NULL AND _keep <> OLD.id THEN
    UPDATE public.client_rewards_ledger SET client_id = _keep WHERE client_id = OLD.id;
    UPDATE public.client_rewards_ledger SET source_referral_client_id = _keep WHERE source_referral_client_id = OLD.id;
    UPDATE public.client_benefit_redemptions r SET client_id = _keep WHERE r.client_id = OLD.id
      AND (r.gift_year IS NULL OR NOT EXISTS (SELECT 1 FROM public.client_benefit_redemptions x WHERE x.client_id = _keep AND x.gift_year = r.gift_year));
  END IF;
  INSERT INTO public.client_rewards_archive (kind, original_client_id, phone10, email, row_data)
  SELECT 'ledger', OLD.id, public.normalize_phone(OLD.phone), lower(trim(OLD.email)), to_jsonb(l)
  FROM public.client_rewards_ledger l WHERE l.client_id = OLD.id;
  INSERT INTO public.client_rewards_archive (kind, original_client_id, phone10, email, row_data)
  SELECT 'redemption', OLD.id, public.normalize_phone(OLD.phone), lower(trim(OLD.email)), to_jsonb(r)
  FROM public.client_benefit_redemptions r WHERE r.client_id = OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER trg_archive_client_rewards BEFORE DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.archive_client_rewards_before_delete();

CREATE OR REPLACE FUNCTION public.restore_archived_client_rewards()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p text := public.normalize_phone(NEW.phone); _e text := lower(trim(NEW.email)); a record; _n int := 0;
BEGIN
  IF NEW.auth_user_id IS NULL OR _p IS NULL THEN RETURN NEW; END IF;
  FOR a IN SELECT * FROM public.client_rewards_archive
           WHERE restored_at IS NULL AND phone10 = _p
             AND (email IS NULL OR _e IS NULL OR email = _e)
           ORDER BY kind DESC, archived_at LOOP
    BEGIN
      IF a.kind = 'ledger' THEN
        INSERT INTO public.client_rewards_ledger
        SELECT (jsonb_populate_record(NULL::public.client_rewards_ledger, a.row_data || jsonb_build_object('client_id', NEW.id))).*
        ON CONFLICT (id) DO NOTHING;
      ELSE
        INSERT INTO public.client_benefit_redemptions
        SELECT (jsonb_populate_record(NULL::public.client_benefit_redemptions, a.row_data || jsonb_build_object('client_id', NEW.id))).*
        ON CONFLICT DO NOTHING;
      END IF;
      UPDATE public.client_rewards_archive SET restored_to_client_id = NEW.id, restored_at = now() WHERE id = a.id;
      _n := _n + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  IF _n > 0 THEN
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 'rewards_restored_from_archive', 'client', NEW.id, jsonb_build_object('rows', _n));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_restore_client_rewards AFTER INSERT OR UPDATE OF auth_user_id, phone ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.restore_archived_client_rewards();

CREATE OR REPLACE FUNCTION public.flag_rewards_ledger_anomaly()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 'rewards_alert_points_deleted', 'client', OLD.client_id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  IF NEW.points < 0 AND NEW.source_type NOT IN ('redemption','cancellation_reversal','manual_adjust') THEN
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), 'rewards_alert_unexpected_drop', 'client', NEW.client_id, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_flag_rewards_ledger AFTER INSERT OR DELETE ON public.client_rewards_ledger
FOR EACH ROW EXECUTE FUNCTION public.flag_rewards_ledger_anomaly();

REVOKE EXECUTE ON FUNCTION public.archive_client_rewards_before_delete(), public.restore_archived_client_rewards(), public.flag_rewards_ledger_anomaly() FROM PUBLIC, anon, authenticated;