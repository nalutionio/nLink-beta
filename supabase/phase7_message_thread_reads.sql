-- Phase 7: cross-device message read state for accurate unread badges.

create extension if not exists pgcrypto;

create table if not exists public.message_thread_reads (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_role text not null check (viewer_role in ('client', 'provider')),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, client_id, viewer_user_id, viewer_role)
);

create index if not exists idx_message_thread_reads_viewer
  on public.message_thread_reads(viewer_user_id, viewer_role, updated_at desc);

create index if not exists idx_message_thread_reads_thread
  on public.message_thread_reads(provider_id, client_id, viewer_role);

create or replace function public.set_message_thread_reads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_message_thread_reads_updated_at on public.message_thread_reads;
create trigger trg_message_thread_reads_updated_at
before update on public.message_thread_reads
for each row execute function public.set_message_thread_reads_updated_at();

alter table public.message_thread_reads enable row level security;

drop policy if exists message_thread_reads_select_related on public.message_thread_reads;
drop policy if exists message_thread_reads_insert_related on public.message_thread_reads;
drop policy if exists message_thread_reads_update_related on public.message_thread_reads;

create policy message_thread_reads_select_related
  on public.message_thread_reads
  for select
  to authenticated
  using (
    viewer_user_id = auth.uid()
  );

create policy message_thread_reads_insert_related
  on public.message_thread_reads
  for insert
  to authenticated
  with check (
    viewer_user_id = auth.uid()
    and (
      (
        viewer_role = 'client'
        and client_id = auth.uid()
      )
      or
      (
        viewer_role = 'provider'
        and exists (
          select 1
          from public.providers p
          where p.id = message_thread_reads.provider_id
            and p.owner_id = auth.uid()
        )
      )
    )
  );

create policy message_thread_reads_update_related
  on public.message_thread_reads
  for update
  to authenticated
  using (
    viewer_user_id = auth.uid()
  )
  with check (
    viewer_user_id = auth.uid()
    and (
      (
        viewer_role = 'client'
        and client_id = auth.uid()
      )
      or
      (
        viewer_role = 'provider'
        and exists (
          select 1
          from public.providers p
          where p.id = message_thread_reads.provider_id
            and p.owner_id = auth.uid()
        )
      )
    )
  );

