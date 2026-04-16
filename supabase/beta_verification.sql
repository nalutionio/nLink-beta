-- NLink Beta Verification SQL
-- Run in Supabase SQL Editor before beta signoff.

-- --------------------------------------------------
-- 1) Core table presence + RLS status
-- Expected: all rows present, rls_enabled = true
-- --------------------------------------------------
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'clients',
    'providers',
    'provider_profiles',
    'jobs',
    'job_requests',
    'job_messages',
    'direct_messages',
    'job_reviews',
    'job_appointments',
    'message_thread_reads',
    'community_posts',
    'community_comments',
    'community_reactions',
    'community_plugs',
    'community_notifications'
  )
order by tablename;

-- --------------------------------------------------
-- 2) Policy inventory
-- Expected: policies exist for each protected table
-- --------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clients',
    'providers',
    'provider_profiles',
    'jobs',
    'job_requests',
    'job_messages',
    'direct_messages',
    'job_reviews',
    'job_appointments',
    'message_thread_reads',
    'community_posts',
    'community_comments',
    'community_reactions',
    'community_plugs',
    'community_notifications'
  )
order by tablename, policyname;

-- --------------------------------------------------
-- 3) Self-interaction guard sanity check
-- Expected: 0 rows (provider should not request own client job)
-- --------------------------------------------------
select
  jr.id as job_request_id,
  jr.job_id,
  jr.provider_id,
  p.owner_id as provider_owner_id,
  j.client_id,
  jr.status,
  jr.created_at
from job_requests jr
join providers p on p.id = jr.provider_id
join jobs j on j.id = jr.job_id
where p.owner_id = j.client_id
order by jr.created_at desc
limit 50;

-- --------------------------------------------------
-- 4) Messaging guard sanity check
-- Expected: provider->client messages before accepted proposal should be 0
-- --------------------------------------------------
select
  jm.id,
  jm.job_id,
  jm.provider_id,
  jm.client_id,
  jm.sender_role,
  jm.created_at,
  jr.status as proposal_status
from job_messages jm
left join job_requests jr
  on jr.job_id = jm.job_id
  and jr.provider_id = jm.provider_id
where jm.sender_role = 'provider'
  and coalesce(jr.status, 'none') <> 'accepted'
order by jm.created_at desc
limit 50;

-- --------------------------------------------------
-- 5) Privacy leakage check (schema-level quick scan)
-- Expected: no direct street-address columns in jobs table
-- --------------------------------------------------
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'jobs'
  and column_name in ('address', 'street', 'street_address', 'full_address', 'address_line1', 'address_line2')
order by column_name;

-- --------------------------------------------------
-- 6) Property profile adoption check
-- Expected: helps confirm beta data quality, not a hard fail
-- --------------------------------------------------
select
  count(*) as clients_total,
  count(*) filter (
    where property_profile is not null
      and property_profile::text <> '{}'::text
  ) as clients_with_property_profile
from clients;

-- --------------------------------------------------
-- 7) Quick volume snapshot
-- Expected: non-zero in active beta testing
-- --------------------------------------------------
select
  (select count(*) from clients) as clients,
  (select count(*) from providers) as providers,
  (select count(*) from jobs) as jobs,
  (select count(*) from job_requests) as job_requests,
  (select count(*) from job_messages) as job_messages,
  (select count(*) from direct_messages) as direct_messages;
