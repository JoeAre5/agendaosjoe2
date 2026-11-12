-- Re-tag appointments that the commitDraft helper left as 'unknown'.
-- The eligibility trigger fires on UPDATE so points become correct automatically.
UPDATE public.appointments
   SET booking_source = CASE
         WHEN created_by_role = 'client_app' THEN 'pwa'
         ELSE 'public_site'
       END
 WHERE booking_source = 'unknown'
   AND payment_confirmed = true
   AND created_by_role IN ('client_app', 'public_site');