import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cleanup = readFileSync("supabase/maintenance/historyRetention.sql", "utf8");
const scheduling = readFileSync("supabase/maintenance/historySchedule.sql", "utf8");

describe("authorized automatic-history housekeeping SQL", () => {
  it("keeps three days of task history and excludes unfinished tasks", () => {
    expect(cleanup).toMatch(/DELETE FROM cron\.job_run_details\s+WHERE start_time < now\(\) - interval '3 days'\s+AND end_time IS NOT NULL;/);
  });
  it("keeps 90 days of Acuity webhook notices", () => {
    expect(cleanup).toMatch(/DELETE FROM public\.acuity_webhook_log\s+WHERE received_at < now\(\) - interval '90 days';/);
  });
  it("schedules precisely the same cleanup once daily at 03:15 Puerto Rico", () => {
    expect(scheduling).toContain("'15 7 * * *'");
    const command = scheduling.split("$job$")[1]?.trim();
    const withoutComment = cleanup.split("\n").filter(line => !line.startsWith("--")).join("\n").trim();
    expect(command).toBe(withoutComment);
  });
  it("changes only recurring-push cadence to five minutes", () => {
    expect(scheduling).toMatch(/cron\.alter_job\(\s*\(SELECT jobid FROM cron\.job WHERE jobname = 'flush-recurring-pushes'\),\s*schedule := '\*\/5 \* \* \* \*'\s*\)/);
  });
  it("deletes only the two approved history tables, never business or operator records", () => {
    const targets = [...cleanup.matchAll(/DELETE FROM ([\w.]+)/g)].map(match => match[1]);
    expect(targets).toEqual(["cron.job_run_details", "public.acuity_webhook_log"]);
    expect(cleanup).not.toMatch(/\b(UPDATE|INSERT|TRUNCATE|DROP|CALL|EXECUTE)\b/i);
  });
});