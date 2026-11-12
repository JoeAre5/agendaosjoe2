create table if not exists public.debug_logs (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  payload jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists debug_logs_tag_created_idx on public.debug_logs(tag, created_at desc);

alter table public.debug_logs enable row level security;

drop policy if exists "Owner read debug_logs" on public.debug_logs;
create policy "Owner read debug_logs"
  on public.debug_logs for select
  to authenticated
  using (public.is_owner());

drop policy if exists "Service role full access debug_logs" on public.debug_logs;
create policy "Service role full access debug_logs"
  on public.debug_logs for all
  to service_role
  using (true) with check (true);