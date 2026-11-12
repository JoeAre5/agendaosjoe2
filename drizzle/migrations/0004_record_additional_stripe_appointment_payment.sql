CREATE OR REPLACE FUNCTION public.record_stripe_appointment_payment(
  p_appointment_id uuid, p_payment_intent_id text, p_amount_cents integer,
  p_tip_cents integer, p_method_type text DEFAULT 'card'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
BEGIN
  IF p_payment_intent_id IS NULL OR length(trim(p_payment_intent_id)) = 0
     OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_tip_cents IS NULL OR p_tip_cents < 0 OR p_tip_cents > p_amount_cents THEN
    RAISE EXCEPTION 'invalid_payment';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_payment_intent_id, 0));
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  SELECT * INTO v_tx FROM public.transactions
    WHERE stripe_payment_id = p_payment_intent_id AND type = 'service' AND status = 'completed'
    LIMIT 1;
  IF FOUND THEN
    IF v_tx.appointment_id IS DISTINCT FROM p_appointment_id OR v_tx.total_cents <> p_amount_cents
       OR v_tx.tip_cents <> p_tip_cents THEN RAISE EXCEPTION 'payment_conflict'; END IF;
    RETURN jsonb_build_object('idempotent', true, 'transaction_id', v_tx.id);
  END IF;
  INSERT INTO public.transactions (
    barber_id, client_id, appointment_id, shop_id, type, payment_method,
    subtotal_cents, tip_cents, total_cents, status, stripe_payment_id,
    stripe_payment_method_type, notes
  ) VALUES (
    v_appt.barber_id, v_appt.client_id, v_appt.id, v_appt.shop_id, 'service', 'stripe',
    p_amount_cents - p_tip_cents, p_tip_cents, p_amount_cents, 'completed', p_payment_intent_id,
    p_method_type, 'Appointment payment via hosted Checkout (' || coalesce(p_method_type, 'card') || ')'
  ) RETURNING * INTO v_tx;
  UPDATE public.appointments SET
    paid = true, payment_confirmed = true, payment_method = 'stripe',
    amount_paid_cents = coalesce(amount_paid_cents, 0) + p_amount_cents,
    tip_cents = coalesce(tip_cents, 0) + p_tip_cents
  WHERE id = p_appointment_id;
  RETURN jsonb_build_object('idempotent', false, 'transaction_id', v_tx.id);
END;
$$;
REVOKE ALL ON FUNCTION public.record_stripe_appointment_payment(uuid, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_appointment_payment(uuid, text, integer, integer, text) TO service_role;
COMMENT ON FUNCTION public.record_stripe_appointment_payment(uuid, text, integer, integer, text) IS 'Service-only atomic Stripe confirmation. Deduplicates by payment intent, serializes appointment updates, preserves earlier amounts and tips.';