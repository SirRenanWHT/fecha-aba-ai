-- Armazena o estado compartilhado de atividades. Execute após collaboration.sql.
create table if not exists public.collab_activities (
  document_id uuid primary key references public.collab_documents(id) on delete cascade,
  activity jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.collab_activities enable row level security;

drop policy if exists "members read shared activities" on public.collab_activities;
create policy "members read shared activities" on public.collab_activities
  for select to authenticated using (exists (
    select 1 from public.collab_members m
    where m.document_id = collab_activities.document_id
      and m.user_id = (select auth.uid())
  ));

drop policy if exists "members update shared activities" on public.collab_activities;
create policy "members update shared activities" on public.collab_activities
  for update to authenticated using (exists (
    select 1 from public.collab_members m
    where m.document_id = collab_activities.document_id
      and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.collab_members m
    where m.document_id = collab_activities.document_id
      and m.user_id = (select auth.uid())
  ));

grant select, update on public.collab_activities to authenticated;

create or replace function public.create_collab_activity_invite(p_activity jsonb, p_state text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_document_id uuid;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.collab_documents (payload, created_by)
    values (jsonb_build_object('kind', 'activity', 'activity', p_activity), v_user_id)
    returning id into v_document_id;
  insert into public.collab_members (document_id, user_id)
    values (v_document_id, v_user_id);
  insert into public.collab_activities (document_id, activity)
    values (v_document_id, p_activity);
  insert into public.collab_yjs_updates (room, update_b64)
    values (v_document_id::text, p_state);
  insert into public.collab_invites (token, document_id, created_by)
    values (v_token, v_document_id, v_user_id);
  return jsonb_build_object('document_id', v_document_id, 'token', v_token);
end;
$$;

revoke all on function public.create_collab_activity_invite(jsonb, text) from public, anon;
grant execute on function public.create_collab_activity_invite(jsonb, text) to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'collab_activities'
  ) then alter publication supabase_realtime add table public.collab_activities; end if;
end $$;
