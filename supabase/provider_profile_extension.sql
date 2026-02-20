-- NLink provider profile extension
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.provider_profiles (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tagline text,
  services text[] not null default '{}',
  availability text,
  address text,
  phone text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_profiles_owner_id on public.provider_profiles(owner_id);

create or replace function public.set_provider_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_provider_profiles_updated_at on public.provider_profiles;
create trigger trg_provider_profiles_updated_at
before update on public.provider_profiles
for each row execute function public.set_provider_profiles_updated_at();

alter table public.provider_profiles enable row level security;

-- Public read so client discovery can render full profile details.
drop policy if exists "provider_profiles_public_read" on public.provider_profiles;
create policy "provider_profiles_public_read"
on public.provider_profiles
for select
using (true);

-- Providers can create their own extended profile data.
drop policy if exists "provider_profiles_owner_insert" on public.provider_profiles;
create policy "provider_profiles_owner_insert"
on public.provider_profiles
for insert
to authenticated
with check (auth.uid() = owner_id);

-- Providers can update only their own rows.
drop policy if exists "provider_profiles_owner_update" on public.provider_profiles;
create policy "provider_profiles_owner_update"
on public.provider_profiles
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Optional: allow owner delete.
drop policy if exists "provider_profiles_owner_delete" on public.provider_profiles;
create policy "provider_profiles_owner_delete"
on public.provider_profiles
for delete
to authenticated
using (auth.uid() = owner_id);
