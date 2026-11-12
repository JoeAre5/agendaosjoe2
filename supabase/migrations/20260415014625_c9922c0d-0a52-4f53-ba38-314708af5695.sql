-- Backfill the missing client record for Charlie's Google test account
INSERT INTO public.clients (first_name, last_name, email, auth_user_id, is_guest, account_verified, booking_source)
VALUES ('Charlie', 'Corchado', 'app.pulse.tool@gmail.com', 'cf1726cf-0aab-4d5b-ab9b-340876e316a9', false, true, 'self-signup')
ON CONFLICT DO NOTHING;
