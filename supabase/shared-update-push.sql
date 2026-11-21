-- Deduplicates shared-content update alerts per device, room, and five-minute window.
-- Execute after push-subscriptions.sql and collaboration.sql.
create table if not exists public.shared_update_push_deliveries (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  document_id uuid not null references public.collab_documents(id) on delete cascade,
  window_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, document_id, window_start)
);

alter table public.shared_update_push_deliveries enable row level security;
revoke all on public.shared_update_push_deliveries from anon, authenticated;
grant select, insert, delete on public.shared_update_push_deliveries to service_role;
grant usage, select on sequence public.shared_update_push_deliveries_id_seq to service_role;
