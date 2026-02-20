-- Provider lifecycle + analytics extensions for NLink beta.
-- Run in Supabase SQL editor.

alter table if exists public.provider_profiles
  add column if not exists listing_status text not null default 'draft'
  check (listing_status in ('draft', 'published', 'paused'));

alter table if exists public.provider_profiles
  add column if not exists profile_completion integer not null default 0
  check (profile_completion >= 0 and profile_completion <= 100);

create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('profile_view', 'save_click', 'contact_click', 'booking_click')),
  created_at timestamptz not null default now()
);

create index if not exists provider_events_provider_idx
  on public.provider_events(provider_id);

create index if not exists provider_events_type_idx
  on public.provider_events(event_type);

alter table public.provider_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_events'
      and policyname = 'provider_events_insert_authenticated'
  ) then
    create policy provider_events_insert_authenticated
      on public.provider_events
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_events'
      and policyname = 'provider_events_select_own_provider'
  ) then
    create policy provider_events_select_own_provider
      on public.provider_events
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.providers p
          where p.id = provider_events.provider_id
            and p.owner_id = auth.uid()
        )
      );
  end if;
end $$;
