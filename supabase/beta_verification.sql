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
-- Expected: 0 rows
-- Rule: provider job-messages require
--   (a) request status in accepted/completed/closed
--   (b) client started the thread first (earlier client message)
-- --------------------------------------------------
select
  jm.id,
  jm.job_id,
  jm.provider_id,
  jm.client_id,
  jm.created_at
from job_messages jm
where jm.sender_role = 'provider'
  and (
    not exists (
      select 1
      from job_requests jr
      where jr.job_id = jm.job_id
        and jr.provider_id = jm.provider_id
        and jr.status in ('accepted', 'completed', 'closed')
    )
    or not exists (
      select 1
      from job_messages prior_client
      where prior_client.job_id = jm.job_id
        and prior_client.provider_id = jm.provider_id
        and prior_client.client_id = jm.client_id
        and prior_client.sender_role = 'client'
        and prior_client.created_at <= jm.created_at
    )
  )
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

-- --------------------------------------------------
-- 8) Review trust/safety sanity checks
-- Expected: all return 0 rows
-- --------------------------------------------------

-- 8a) No self-reviews.
select
  id,
  job_id,
  reviewer_user_id,
  reviewee_user_id,
  reviewer_role,
  reviewee_role
from job_reviews
where reviewer_user_id = reviewee_user_id
limit 50;

-- 8b) Reviews only on closed relationships.
select
  r.id,
  r.job_id,
  r.provider_id,
  r.created_at
from job_reviews r
where not exists (
  select 1
  from job_requests jr
  where jr.job_id = r.job_id
    and jr.provider_id = r.provider_id
    and jr.status = 'closed'
)
limit 50;

-- 8c) No links/contact details in review text.
select
  id,
  job_id,
  review_text
from job_reviews
where review_text ~* '(http://|https://|www[.]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}|[0-9]{10}|[0-9]{3}[[:space:].-][0-9]{3}[[:space:].-][0-9]{4})'
limit 50;
