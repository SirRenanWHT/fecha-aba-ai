-- Deduplicação: um lembrete por dispositivo, atividade, vencimento e etapa.
-- Execute após shared-activities.sql e push-subscriptions.sql.
create table if not exists public.shared_activity_push_deliveries (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  activity_id text not null,
  due_date date not null,
  stage text not null check (stage in ('tomorrow', 'today')),
  created_at timestamptz not null default now(),
  unique (subscription_id, activity_id, due_date, stage)
);

alter table public.shared_activity_push_deliveries enable row level security;
revoke all on public.shared_activity_push_deliveries from anon, authenticated;
grant select, insert, delete on public.shared_activity_push_deliveries to service_role;
grant usage, select on sequence public.shared_activity_push_deliveries_id_seq to service_role;
