-- PlugFeed Community Phase 1 Verification
-- Run after community_phase1_foundation.sql

-- 1) Tables exist
select
  to_regclass('public.community_posts') is not null as has_community_posts,
  to_regclass('public.community_comments') is not null as has_community_comments,
  to_regclass('public.community_reactions') is not null as has_community_reactions,
  to_regclass('public.community_plugs') is not null as has_community_plugs,
  to_regclass('public.community_reports') is not null as has_community_reports,
  to_regclass('public.community_events') is not null as has_community_events;

-- 2) RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'community_posts',
    'community_comments',
    'community_reactions',
    'community_plugs',
    'community_reports',
    'community_events'
  )
order by tablename;

-- 3) Core policies exist
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename like 'community_%'
order by tablename, policyname;

-- 4) Guardrail functions exist
select
  exists (select 1 from pg_proc where proname = 'community_contains_blocked_contact') as has_fn_contact_filter,
  exists (select 1 from pg_proc where proname = 'community_validate_content_guardrails') as has_fn_content_guardrails,
  exists (select 1 from pg_proc where proname = 'community_enforce_rate_limits') as has_fn_rate_limits,
  exists (select 1 from pg_proc where proname = 'community_validate_plug_guardrails') as has_fn_plug_guardrails;

-- 5) Triggers exist
select
  tgname as trigger_name,
  relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and tgname in (
    'trg_community_posts_updated_at',
    'trg_community_posts_content_guardrails',
    'trg_community_comments_content_guardrails',
    'trg_community_posts_rate_limits',
    'trg_community_comments_rate_limits',
    'trg_community_plugs_guardrails'
  )
order by trigger_name;
