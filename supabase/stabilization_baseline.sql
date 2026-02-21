-- NLink Stabilization Baseline (Schema + Security)
-- Run this in Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / guarded policy creation.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Clients: canonical columns used by onboarding/profile/dashboard.
-- ---------------------------------------------------------------------------
alter table if exists public.clients
  add column if not exists full_name text,
  add column if not exists nick_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists gender text,
  add column if not exists address text,
  add column if not exists location text,
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists email_verified boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_clients_user_id_unique
  on public.clients(user_id);

create or replace function public.set_clients_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_clients_updated_at();

-- ---------------------------------------------------------------------------
-- Providers + provider_profiles: canonical fields and constraints.
-- ---------------------------------------------------------------------------
create unique index if not exists idx_providers_owner_unique
  on public.providers(owner_id);

alter table if exists public.provider_profiles
  add column if not exists pricing_details text,
  add column if not exists social_instagram text,
  add column if not exists social_facebook text,
  add column if not exists social_linkedin text,
  add column if not exists social_tiktok text,
  add column if not exists availability_days text,
  add column if not exists availability_start text,
  add column if not exists availability_end text,
  add column if not exists service_area_zip text,
  add column if not exists service_radius_miles integer,
  add column if not exists listing_status text not null default 'draft',
  add column if not exists profile_completion integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'provider_profiles'
      and column_name = 'listing_status'
  ) then
    alter table public.provider_profiles
      drop constraint if exists provider_profiles_listing_status_check;
    alter table public.provider_profiles
      add constraint provider_profiles_listing_status_check
      check (listing_status in ('draft', 'published', 'paused'));
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'provider_profiles'
      and column_name = 'profile_completion'
  ) then
    alter table public.provider_profiles
      drop constraint if exists provider_profiles_profile_completion_check;
    alter table public.provider_profiles
      add constraint provider_profiles_profile_completion_check
      check (profile_completion >= 0 and profile_completion <= 100);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Jobs + requests: canonical status values for flow consistency.
-- ---------------------------------------------------------------------------
alter table if exists public.jobs
  add column if not exists category text,
  add column if not exists timeline text,
  add column if not exists sqft integer,
  add column if not exists client_name text,
  add column if not exists client_avatar_url text,
  add column if not exists client_location_public text,
  add column if not exists client_email_verified boolean not null default false,
  add column if not exists status text not null default 'open',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'status'
  ) then
    alter table public.jobs
      drop constraint if exists jobs_status_check;
    alter table public.jobs
      add constraint jobs_status_check
      check (status in ('open', 'in_progress', 'closed'));
  end if;
end $$;

alter table if exists public.job_requests
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists status text not null default 'pending';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_requests'
      and column_name = 'status'
  ) then
    alter table public.job_requests
      drop constraint if exists job_requests_status_check;
    alter table public.job_requests
      add constraint job_requests_status_check
      check (status in ('pending', 'accepted', 'declined', 'closed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Provider events: analytics events table for dashboard metrics.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('profile_view', 'save_click', 'contact_click', 'booking_click')),
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_events_provider
  on public.provider_events(provider_id);
create index if not exists idx_provider_events_type
  on public.provider_events(event_type);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text not null default 'unknown' check (actor_role in ('client', 'provider', 'system', 'unknown')),
  event_type text not null check (event_type in (
    'job_created',
    'job_updated',
    'job_closed',
    'job_reopened',
    'request_sent',
    'request_accepted',
    'request_declined',
    'request_closed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_events_job_id
  on public.job_events(job_id);
create index if not exists idx_job_events_event_type
  on public.job_events(event_type);

-- ---------------------------------------------------------------------------
-- RLS: enable and define minimal policies matching current product behavior.
-- ---------------------------------------------------------------------------
alter table if exists public.clients enable row level security;
alter table if exists public.providers enable row level security;
alter table if exists public.provider_profiles enable row level security;
alter table if exists public.provider_photos enable row level security;
alter table if exists public.jobs enable row level security;
alter table if exists public.job_requests enable row level security;
alter table if exists public.job_photos enable row level security;
alter table if exists public.provider_events enable row level security;
alter table if exists public.job_events enable row level security;

-- clients: only owner can read/write
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_owner_select'
  ) then
    create policy clients_owner_select
      on public.clients
      for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_owner_insert'
  ) then
    create policy clients_owner_insert
      on public.clients
      for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_owner_update'
  ) then
    create policy clients_owner_update
      on public.clients
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- job events: authenticated insert, related job participants can read
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_events' and policyname = 'job_events_insert_authenticated'
  ) then
    create policy job_events_insert_authenticated
      on public.job_events
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_events' and policyname = 'job_events_related_read'
  ) then
    create policy job_events_related_read
      on public.job_events
      for select to authenticated
      using (
        exists (
          select 1
          from public.jobs j
          where j.id = job_events.job_id
            and j.client_id = auth.uid()
        )
        or exists (
          select 1
          from public.job_requests jr
          join public.providers p on p.id = jr.provider_id
          where jr.job_id = job_events.job_id
            and p.owner_id = auth.uid()
        )
      );
  end if;
end $$;

-- providers: public read for discovery; owner write
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'providers' and policyname = 'providers_public_read'
  ) then
    create policy providers_public_read
      on public.providers
      for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'providers' and policyname = 'providers_owner_insert'
  ) then
    create policy providers_owner_insert
      on public.providers
      for insert to authenticated
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'providers' and policyname = 'providers_owner_update'
  ) then
    create policy providers_owner_update
      on public.providers
      for update to authenticated
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;
end $$;

-- provider profiles/photos: public read, owner write
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_profiles' and policyname = 'provider_profiles_public_read'
  ) then
    create policy provider_profiles_public_read
      on public.provider_profiles
      for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_profiles' and policyname = 'provider_profiles_owner_insert'
  ) then
    create policy provider_profiles_owner_insert
      on public.provider_profiles
      for insert to authenticated
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_profiles' and policyname = 'provider_profiles_owner_update'
  ) then
    create policy provider_profiles_owner_update
      on public.provider_profiles
      for update to authenticated
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_photos' and policyname = 'provider_photos_public_read'
  ) then
    create policy provider_photos_public_read
      on public.provider_photos
      for select to anon, authenticated
      using (true);
  end if;
end $$;

-- jobs: clients own write; authenticated read (current marketplace behavior)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_authenticated_read'
  ) then
    create policy jobs_authenticated_read
      on public.jobs
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_owner_insert'
  ) then
    create policy jobs_owner_insert
      on public.jobs
      for insert to authenticated
      with check (auth.uid() = client_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_owner_update'
  ) then
    create policy jobs_owner_update
      on public.jobs
      for update to authenticated
      using (auth.uid() = client_id)
      with check (auth.uid() = client_id);
  end if;
end $$;

-- job requests: provider creates; provider/client can read; client decides
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_requests' and policyname = 'job_requests_related_read'
  ) then
    create policy job_requests_related_read
      on public.job_requests
      for select to authenticated
      using (
        exists (
          select 1
          from public.jobs j
          where j.id = job_requests.job_id
            and j.client_id = auth.uid()
        )
        or exists (
          select 1
          from public.providers p
          where p.id = job_requests.provider_id
            and p.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_requests' and policyname = 'job_requests_provider_insert'
  ) then
    create policy job_requests_provider_insert
      on public.job_requests
      for insert to authenticated
      with check (
        exists (
          select 1
          from public.providers p
          where p.id = job_requests.provider_id
            and p.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_requests' and policyname = 'job_requests_client_update'
  ) then
    create policy job_requests_client_update
      on public.job_requests
      for update to authenticated
      using (
        exists (
          select 1
          from public.jobs j
          where j.id = job_requests.job_id
            and j.client_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.jobs j
          where j.id = job_requests.job_id
            and j.client_id = auth.uid()
        )
      );
  end if;
end $$;

-- job photos: authenticated read, client-owner insert/update/delete
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_photos' and policyname = 'job_photos_authenticated_read'
  ) then
    create policy job_photos_authenticated_read
      on public.job_photos
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_photos' and policyname = 'job_photos_client_write'
  ) then
    create policy job_photos_client_write
      on public.job_photos
      for all to authenticated
      using (
        exists (
          select 1
          from public.jobs j
          where j.id = job_photos.job_id
            and j.client_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.jobs j
          where j.id = job_photos.job_id
            and j.client_id = auth.uid()
        )
      );
  end if;
end $$;

-- provider events: authenticated insert; provider owner read
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_events' and policyname = 'provider_events_insert_authenticated'
  ) then
    create policy provider_events_insert_authenticated
      on public.provider_events
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_events' and policyname = 'provider_events_select_own_provider'
  ) then
    create policy provider_events_select_own_provider
      on public.provider_events
      for select to authenticated
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
