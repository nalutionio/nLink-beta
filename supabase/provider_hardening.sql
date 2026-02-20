-- NLink provider hardening
-- Run in Supabase SQL editor after provider_profile_extension.sql

create extension if not exists pgcrypto;

-- 1) Add richer provider profile fields used by the new provider UX
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
  add column if not exists service_radius_miles integer;

-- 2) Backfill owner_id where possible
update public.provider_profiles pp
set owner_id = p.owner_id
from public.providers p
where pp.provider_id = p.id
  and (pp.owner_id is distinct from p.owner_id);

-- 3) De-duplicate providers by owner (keep latest)
with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.providers
  where owner_id is not null
),
keepers as (
  select owner_id, id as keep_id
  from ranked
  where rn = 1
),
dupes as (
  select r.id as old_id, k.keep_id, r.owner_id
  from ranked r
  join keepers k on k.owner_id = r.owner_id
  where r.rn > 1
)
update public.provider_photos ph
set provider_id = d.keep_id
from dupes d
where ph.provider_id = d.old_id;

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.providers
  where owner_id is not null
),
keepers as (
  select owner_id, id as keep_id
  from ranked
  where rn = 1
),
dupes as (
  select r.id as old_id, k.keep_id, r.owner_id
  from ranked r
  join keepers k on k.owner_id = r.owner_id
  where r.rn > 1
)
update public.provider_profiles pp
set provider_id = d.keep_id, owner_id = d.owner_id
from dupes d
where pp.provider_id = d.old_id;

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.providers
  where owner_id is not null
)
delete from public.providers p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- 4) Enforce one-provider-per-owner going forward
create unique index if not exists idx_providers_owner_unique
  on public.providers(owner_id);
