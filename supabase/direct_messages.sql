-- Direct client -> provider messaging (no job thread required)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('client', 'provider')),
  message_text text not null check (char_length(trim(message_text)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_direct_messages_thread
  on public.direct_messages(provider_id, client_id, created_at desc);

alter table public.direct_messages enable row level security;

create or replace function public.client_started_direct_thread(
  _provider_id uuid,
  _client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.direct_messages dm
    where dm.provider_id = _provider_id
      and dm.client_id = _client_id
      and dm.sender_role = 'client'
  );
$$;

revoke all on function public.client_started_direct_thread(uuid, uuid) from public;
grant execute on function public.client_started_direct_thread(uuid, uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_messages'
      and policyname = 'direct_messages_select_related'
  ) then
    drop policy direct_messages_select_related on public.direct_messages;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_messages'
      and policyname = 'direct_messages_insert_client'
  ) then
    drop policy direct_messages_insert_client on public.direct_messages;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'direct_messages'
      and policyname = 'direct_messages_insert_provider'
  ) then
    drop policy direct_messages_insert_provider on public.direct_messages;
  end if;

  create policy direct_messages_select_related
    on public.direct_messages
    for select
    to authenticated
    using (
      client_id = auth.uid()
      or exists (
        select 1
        from public.providers p
        where p.id = direct_messages.provider_id
          and p.owner_id = auth.uid()
      )
    );

  create policy direct_messages_insert_client
    on public.direct_messages
    for insert
    to authenticated
    with check (
      sender_role = 'client'
      and sender_user_id = auth.uid()
      and client_id = auth.uid()
      and exists (
        select 1
        from public.providers p
        where p.id = direct_messages.provider_id
          and p.owner_id <> auth.uid()
      )
    );

  create policy direct_messages_insert_provider
    on public.direct_messages
    for insert
    to authenticated
    with check (
      sender_role = 'provider'
      and sender_user_id = auth.uid()
      and exists (
        select 1
        from public.providers p
        where p.id = direct_messages.provider_id
          and p.owner_id = auth.uid()
      )
      and public.client_started_direct_thread(
        direct_messages.provider_id,
        direct_messages.client_id
      )
      and client_id <> auth.uid()
    );
end $$;
