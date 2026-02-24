-- Job-scoped messaging between clients and providers

create extension if not exists pgcrypto;

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('client', 'provider')),
  message_text text not null check (char_length(trim(message_text)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_messages_conversation
  on public.job_messages(job_id, provider_id, client_id, created_at desc);

create index if not exists idx_job_messages_sender
  on public.job_messages(sender_user_id, created_at desc);

alter table public.job_messages enable row level security;

-- Read:
-- - client on the job can read
-- - provider owner on the provider can read
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_messages'
      and policyname = 'job_messages_select_related'
  ) then
    create policy job_messages_select_related
      on public.job_messages
      for select
      to authenticated
      using (
        client_id = auth.uid()
        or exists (
          select 1
          from public.providers p
          where p.id = job_messages.provider_id
            and p.owner_id = auth.uid()
        )
      );
  end if;
end $$;

-- Helper to check if client has already initiated a thread.
-- SECURITY DEFINER avoids policy self-recursion when reading job_messages from an insert policy.
create or replace function public.client_started_job_thread(
  _job_id uuid,
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
    from public.job_messages jm
    where jm.job_id = _job_id
      and jm.provider_id = _provider_id
      and jm.client_id = _client_id
      and jm.sender_role = 'client'
  );
$$;

revoke all on function public.client_started_job_thread(uuid, uuid, uuid) from public;
grant execute on function public.client_started_job_thread(uuid, uuid, uuid) to authenticated;

-- Insert:
-- - client can send only after proposal is accepted
-- - provider can send only after proposal is accepted AND client has already messaged first
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_messages'
      and policyname = 'job_messages_insert_related'
  ) then
    drop policy job_messages_insert_related on public.job_messages;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_messages'
      and policyname = 'job_messages_insert_client'
  ) then
    drop policy job_messages_insert_client on public.job_messages;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_messages'
      and policyname = 'job_messages_insert_provider'
  ) then
    drop policy job_messages_insert_provider on public.job_messages;
  end if;

  create policy job_messages_insert_client
    on public.job_messages
    for insert
    to authenticated
    with check (
      sender_role = 'client'
      and sender_user_id = auth.uid()
      and client_id = auth.uid()
      and exists (
        select 1
        from public.jobs j
        where j.id = job_messages.job_id
          and j.client_id = auth.uid()
      )
      and exists (
        select 1
        from public.job_requests jr
        where jr.job_id = job_messages.job_id
          and jr.provider_id = job_messages.provider_id
          and jr.status = 'accepted'
      )
      and exists (
        select 1
        from public.providers p
        where p.id = job_messages.provider_id
          and p.owner_id <> auth.uid()
      )
    );

  create policy job_messages_insert_provider
    on public.job_messages
    for insert
    to authenticated
    with check (
      sender_role = 'provider'
      and sender_user_id = auth.uid()
      and exists (
        select 1
        from public.providers p
        where p.id = job_messages.provider_id
          and p.owner_id = auth.uid()
      )
      and exists (
        select 1
        from public.job_requests jr
        where jr.job_id = job_messages.job_id
          and jr.provider_id = job_messages.provider_id
          and jr.status = 'accepted'
      )
      and public.client_started_job_thread(
        job_messages.job_id,
        job_messages.provider_id,
        job_messages.client_id
      )
      and client_id <> auth.uid()
    );
end $$;
