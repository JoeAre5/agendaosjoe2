-- 07:15 UTC = 03:15 Puerto Rico. Named scheduling is idempotent.
SELECT cron.schedule(
  'cleanup-automatic-history-daily',
  '15 7 * * *',
  $job$
DELETE FROM cron.job_run_details
WHERE start_time < now() - interval '3 days'
  AND end_time IS NOT NULL;

DELETE FROM public.acuity_webhook_log
WHERE received_at < now() - interval '90 days';
  $job$
);

-- Resolve the existing job by name, leaving its command and credentials intact.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'flush-recurring-pushes'),
  schedule := '*/5 * * * *'
);