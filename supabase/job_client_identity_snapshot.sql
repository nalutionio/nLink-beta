-- Add snapshot identity fields to jobs so provider-facing views do not depend
-- on reading private clients rows directly.

alter table if exists public.jobs
  add column if not exists client_name text,
  add column if not exists client_avatar_url text,
  add column if not exists client_location_public text,
  add column if not exists client_email_verified boolean not null default false;

-- Optional backfill for existing jobs.
-- Keeps current rows usable in provider-facing views.
update public.jobs j
set
  client_name = coalesce(j.client_name, c.full_name, split_part(c.email, '@', 1), 'Client'),
  client_avatar_url = coalesce(j.client_avatar_url, c.avatar_url),
  client_location_public = coalesce(
    j.client_location_public,
    nullif(trim(c.location), ''),
    nullif(trim(j.location), '')
  ),
  client_email_verified = coalesce(j.client_email_verified, c.email_verified, false)
from public.clients c
where c.user_id = j.client_id
  and (
    j.client_name is null
    or j.client_avatar_url is null
    or j.client_location_public is null
    or j.client_email_verified is distinct from true
  );
