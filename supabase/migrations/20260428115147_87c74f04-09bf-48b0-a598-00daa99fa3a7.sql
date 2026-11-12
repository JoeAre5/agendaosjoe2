DROP FUNCTION IF EXISTS public.danger_force_cancel_appointment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.danger_hard_delete_appointment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.danger_hard_delete_appointments_bulk(uuid[], text) CASCADE;
DROP FUNCTION IF EXISTS public.danger_nuke_clients_bulk(uuid[], text) CASCADE;
DROP FUNCTION IF EXISTS public.danger_nuke_user_by_email(text) CASCADE;