-- Colaboração entre pessoas sem cadastro: cada navegador recebe uma identidade
-- anônima do Supabase e entra por um convite aleatório de uso exclusivo.

create table if not exists public.collab_documents (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.collab_members (
  document_id uuid not null references public.collab_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create table if not exists public.collab_invites (
  token text primary key,
  document_id uuid not null references public.collab_documents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.collab_yjs_updates (
  id bigint generated always as identity primary key,
  room text not null,
  update_b64 text not null,
  created_at timestamptz not null default now()
);

create index if not exists collab_members_user_id_idx on public.collab_members(user_id);
create index if not exists collab_invites_document_id_idx on public.collab_invites(document_id);

alter table public.collab_documents enable row level security;
alter table public.collab_members enable row level security;
alter table public.collab_invites enable row level security;
alter table public.collab_yjs_updates enable row level security;

drop policy if exists "members read collaborative documents" on public.collab_documents;
create policy "members read collaborative documents"
  on public.collab_documents for select to authenticated
  using (exists (
    select 1 from public.collab_members m
    where m.document_id = id and m.user_id = (select auth.uid())
  ));

drop policy if exists "members read their membership" on public.collab_members;
create policy "members read their membership"
  on public.collab_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "members read collaborative updates" on public.collab_yjs_updates;
create policy "members read collaborative updates"
  on public.collab_yjs_updates for select to authenticated
  using (exists (
    select 1 from public.collab_members m
    where m.document_id::text = room and m.user_id = (select auth.uid())
  ));

drop policy if exists "members create collaborative updates" on public.collab_yjs_updates;
create policy "members create collaborative updates"
  on public.collab_yjs_updates for insert to authenticated
  with check (exists (
    select 1 from public.collab_members m
    where m.document_id::text = room and m.user_id = (select auth.uid())
  ));

grant select on public.collab_documents, public.collab_members, public.collab_yjs_updates to authenticated;
grant insert on public.collab_yjs_updates to authenticated;
grant usage, select on sequence public.collab_yjs_updates_id_seq to authenticated;

create or replace function public.create_collab_invite(p_payload jsonb, p_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_document_id uuid;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.collab_documents (payload, created_by)
  values (p_payload, v_user_id)
  returning id into v_document_id;

  insert into public.collab_members (document_id, user_id)
  values (v_document_id, v_user_id);

  insert into public.collab_yjs_updates (room, update_b64)
  values (v_document_id::text, p_state);

  insert into public.collab_invites (token, document_id, created_by)
  values (v_token, v_document_id, v_user_id);

  return jsonb_build_object('document_id', v_document_id, 'token', v_token);
end;
$$;

create or replace function public.join_collab_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.collab_documents%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select d.* into v_document
  from public.collab_invites i
  join public.collab_documents d on d.id = i.document_id
  where i.token = p_token and i.revoked_at is null;

  if not found then
    raise exception 'Invite not found or revoked';
  end if;

  insert into public.collab_members (document_id, user_id)
  values (v_document.id, v_user_id)
  on conflict do nothing;

  return jsonb_build_object('document_id', v_document.id, 'payload', v_document.payload);
end;
$$;

revoke all on function public.create_collab_invite(jsonb, text) from public, anon;
revoke all on function public.join_collab_invite(text) from public, anon;
grant execute on function public.create_collab_invite(jsonb, text) to authenticated;
grant execute on function public.join_collab_invite(text) to authenticated;

-- O provedor Yjs usa canais privados `yjs:<document uuid>`.
drop policy if exists "collaboration members receive Yjs broadcasts" on realtime.messages;
create policy "collaboration members receive Yjs broadcasts"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() like 'yjs:%'
    and exists (
      select 1 from public.collab_members m
      where m.document_id::text = substring(realtime.topic() from 5)
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "collaboration members send Yjs broadcasts" on realtime.messages;
create policy "collaboration members send Yjs broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and realtime.topic() like 'yjs:%'
    and exists (
      select 1 from public.collab_members m
      where m.document_id::text = substring(realtime.topic() from 5)
        and m.user_id = (select auth.uid())
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'collab_yjs_updates'
  ) then
    alter publication supabase_realtime add table public.collab_yjs_updates;
  end if;
end;
$$;
