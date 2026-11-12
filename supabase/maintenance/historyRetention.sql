-- Daily housekeeping only. Never include operational business tables here.
DELETE FROM cron.job_run_details
WHERE start_time < now() - interval '3 days'
  AND end_time IS NOT NULL;

DELETE FROM public.acuity_webhook_log
WHERE received_at < now() - interval '90 days';