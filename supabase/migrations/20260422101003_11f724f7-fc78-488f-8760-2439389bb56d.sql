alter table public.booking_drafts
  add column if not exists paypal_order_id text;

create index if not exists booking_drafts_paypal_order_id_idx
  on public.booking_drafts(paypal_order_id)
  where paypal_order_id is not null;