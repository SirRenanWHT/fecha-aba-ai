-- Execute depois de shared-activities.sql para habilitar recorrência mensal
-- com criação única da próxima atividade compartilhada.

create table if not exists public.shared_activity_recurrence_claims (
  series_id text not null,
  due_date date not null,
  document_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (series_id, due_date),
  unique (document_id)
);

alter table public.shared_activity_recurrence_claims enable row level security;
revoke all on public.shared_activity_recurrence_claims from anon, authenticated;
grant select, insert on public.shared_activity_recurrence_claims to service_role;

create or replace function public.save_collab_activity(p_document_id uuid, p_activity jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous jsonb;
  v_recurrence jsonb;
  v_series_id text;
  v_day integer;
  v_base_date date;
  v_next_date date;
  v_next_room uuid;
  v_next_activity jsonb;
  v_next_subtasks jsonb;
  v_now timestamptz := now();
  v_claimed integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.collab_members m
    where m.document_id = p_document_id and m.user_id = v_user_id
  ) then raise exception 'Not a member of this activity'; end if;

  select ca.activity into v_previous
  from public.collab_activities ca
  where ca.document_id = p_document_id
  for update;
  if not found then raise exception 'Shared activity not found'; end if;

  update public.collab_activities
  set activity = p_activity, updated_at = v_now
  where document_id = p_document_id;

  if v_previous ->> 'status' = 'done' or p_activity ->> 'status' <> 'done' then
    return jsonb_build_object('saved', true);
  end if;

  v_recurrence := p_activity -> 'recurrence';
  if v_recurrence ->> 'frequency' <> 'monthly' or coalesce(p_activity ->> 'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('saved', true);
  end if;

  v_series_id := v_recurrence ->> 'seriesId';
  v_day := (v_recurrence ->> 'dayOfMonth')::integer;
  if coalesce(v_series_id, '') = '' or v_day is null or v_day < 1 or v_day > 31 then
    return jsonb_build_object('saved', true);
  end if;

  v_base_date := greatest(
    (p_activity ->> 'dueDate')::date,
    (v_now at time zone 'America/Sao_Paulo')::date
  );
  v_next_date := make_date(
    extract(year from v_base_date)::integer,
    extract(month from v_base_date)::integer,
    least(v_day, extract(day from (date_trunc('month', v_base_date) + interval '1 month' - interval '1 day'))::integer)
  );
  if v_next_date <= v_base_date then
    v_base_date := (date_trunc('month', v_base_date) + interval '1 month')::date;
    v_next_date := make_date(
      extract(year from v_base_date)::integer,
      extract(month from v_base_date)::integer,
      least(v_day, extract(day from (date_trunc('month', v_base_date) + interval '1 month' - interval '1 day'))::integer)
    );
  end if;

  v_next_room := gen_random_uuid();
  insert into public.shared_activity_recurrence_claims (series_id, due_date, document_id)
  values (v_series_id, v_next_date, v_next_room)
  on conflict (series_id, due_date) do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then return jsonb_build_object('saved', true); end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'title', item -> 'title',
      'done', false
    )
  ), '[]'::jsonb) into v_next_subtasks
  from jsonb_array_elements(coalesce(p_activity -> 'subtasks', '[]'::jsonb)) as subtasks(item);

  v_next_activity := (p_activity - 'completedAt') || jsonb_build_object(
    'id', gen_random_uuid()::text,
    'status', 'todo',
    'progress', 0,
    'subtasks', v_next_subtasks,
    'dueDate', to_char(v_next_date, 'YYYY-MM-DD'),
    'createdAt', v_now,
    'updatedAt', v_now
  );

  insert into public.collab_documents (id, payload, created_by)
  values (
    v_next_room,
    jsonb_build_object('kind', 'activity', 'activity', v_next_activity),
    v_user_id
  );
  insert into public.collab_members (document_id, user_id)
  select v_next_room, m.user_id
  from public.collab_members m
  where m.document_id = p_document_id
  on conflict do nothing;
  insert into public.collab_activities (document_id, activity)
  values (v_next_room, v_next_activity);

  return jsonb_build_object(
    'saved', true,
    'next', jsonb_build_object('document_id', v_next_room, 'activity', v_next_activity)
  );
end;
$$;

revoke all on function public.save_collab_activity(uuid, jsonb) from public, anon;
grant execute on function public.save_collab_activity(uuid, jsonb) to authenticated;
