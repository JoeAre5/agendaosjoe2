
SELECT cron.unschedule(9);
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'),
  schedule => '15 seconds'
);
