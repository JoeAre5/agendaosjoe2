UPDATE public.clients
SET notify_sms_appointments = true,
    notify_whatsapp_appointments = true,
    notify_email_appointments = true,
    notify_sms_marketing = true,
    notify_whatsapp_marketing = true,
    notify_email_marketing = true,
    notify_push_appointments = true
WHERE notifications_enabled = true;