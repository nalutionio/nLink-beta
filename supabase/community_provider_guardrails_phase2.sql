-- PlugFeed Community Phase 2 - Provider Guardrails
-- Run after:
-- 1) community_phase1_foundation.sql
-- 2) direct_messages.sql
-- 3) job_messages.sql

create extension if not exists pgcrypto;

-- 1) Violation tracking for provider-side moderation escalation.
create table if not exists public.provider_guardrail_violations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null check (source_table in ('community_posts', 'community_comments', 'community_plugs', 'direct_messages', 'job_messages')),
  source_id uuid null,
  rule_code text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_guardrail_violations_provider_created
  on public.provider_guardrail_violations(provider_id, created_at desc);

create index if not exists idx_provider_guardrail_violations_owner_created
  on public.provider_guardrail_violations(owner_user_id, created_at desc);

alter table public.provider_guardrail_violations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_guardrail_violations'
      and policyname = 'provider_guardrail_violations_select_owner'
  ) then
    create policy provider_guardrail_violations_select_owner
      on public.provider_guardrail_violations
      for select
      to authenticated
      using (owner_user_id = auth.uid());
  end if;
end $$;

-- Admin/service role can insert directly as needed.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_guardrail_violations'
      and policyname = 'provider_guardrail_violations_insert_service'
  ) then
    create policy provider_guardrail_violations_insert_service
      on public.provider_guardrail_violations
      for insert
      to service_role
      with check (true);
  end if;
end $$;

-- 2) Helper: count recent violations.
create or replace function public.provider_guardrail_violation_count(
  _provider_id uuid,
  _lookback interval default interval '7 days'
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.provider_guardrail_violations v
  where v.provider_id = _provider_id
    and v.created_at >= now() - _lookback
$$;

revoke all on function public.provider_guardrail_violation_count(uuid, interval) from public;
grant execute on function public.provider_guardrail_violation_count(uuid, interval) to authenticated;

-- 3) Helper: check if provider can direct-message a client.
-- Rule: neighbor controls contact. Provider DM only after neighbor started direct thread.
create or replace function public.provider_can_direct_message_client(
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
    from public.providers p
    where p.id = _provider_id
  )
  and public.client_started_direct_thread(_provider_id, _client_id)
$$;

revoke all on function public.provider_can_direct_message_client(uuid, uuid) from public;
grant execute on function public.provider_can_direct_message_client(uuid, uuid) to authenticated;

-- 4) Helper: check if provider can message client in a job thread.
-- Rule remains: accepted proposal + client messaged first.
create or replace function public.provider_can_job_message_client(
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
    from public.job_requests jr
    where jr.job_id = _job_id
      and jr.provider_id = _provider_id
      and jr.status = 'accepted'
  )
  and public.client_started_job_thread(_job_id, _provider_id, _client_id)
$$;

revoke all on function public.provider_can_job_message_client(uuid, uuid, uuid) from public;
grant execute on function public.provider_can_job_message_client(uuid, uuid, uuid) to authenticated;

-- 5) Public neighbor identity view for provider/community rendering.
-- Only safe fields, no private address/contact.
create or replace view public.community_neighbor_public as
select
  c.user_id,
  coalesce(nullif(trim(c.full_name), ''), 'Neighbor') as display_name,
  c.avatar_url,
  case
    when c.location is null or trim(c.location) = '' then null
    else
      case
        when array_length(regexp_split_to_array(c.location, '\s*,\s*'), 1) >= 2
        then trim((regexp_split_to_array(c.location, '\s*,\s*'))[array_length(regexp_split_to_array(c.location, '\s*,\s*'), 1)-1])
             || ', ' ||
             trim((regexp_split_to_array(c.location, '\s*,\s*'))[array_length(regexp_split_to_array(c.location, '\s*,\s*'), 1)])
        else trim(c.location)
      end
  end as city_state
from public.clients c;

-- View access to authenticated users only.
revoke all on public.community_neighbor_public from public;
grant select on public.community_neighbor_public to authenticated;

-- 6) Optional verification query (run manually):
-- select
--   to_regclass('public.provider_guardrail_violations') is not null as has_provider_guardrail_violations,
--   exists(select 1 from pg_proc where proname='provider_can_direct_message_client') as has_provider_dm_guard,
--   exists(select 1 from pg_proc where proname='provider_can_job_message_client') as has_provider_job_dm_guard,
--   to_regclass('public.community_neighbor_public') is not null as has_community_neighbor_public_view;
