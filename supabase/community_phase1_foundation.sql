-- PlugFeed Community Phase 1 Foundation
-- Purpose: data model + guardrail baseline (no UI dependency).
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.community_contains_blocked_contact(content text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(content, '') ~* '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' -- email
    or coalesce(content, '') ~* '(https?://|www\.)'                     -- url
    or coalesce(content, '') ~* '(\+?\d[\d\-\s\(\)]{7,}\d)';            -- phone-ish
$$;

create or replace function public.community_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('client', 'provider')),
  author_provider_id uuid null references public.providers(id) on delete set null,
  post_type text not null check (post_type in ('ask', 'need_help', 'showcase', 'recommendation', 'tip', 'advice', 'completed_update')),
  body text not null check (char_length(trim(body)) between 3 and 2000),
  location_text text null,
  service_category text null,
  service_name text null,
  tags text[] not null default '{}',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_role_identity_check check (
    (author_role = 'provider' and author_provider_id is not null)
    or
    (author_role = 'client' and author_provider_id is null)
  ),
  constraint community_posts_provider_type_check check (
    author_role <> 'provider'
    or post_type in ('showcase', 'tip', 'advice', 'completed_update')
  )
);

create index if not exists idx_community_posts_created
  on public.community_posts(created_at desc);
create index if not exists idx_community_posts_author
  on public.community_posts(author_user_id, author_role);
create index if not exists idx_community_posts_service
  on public.community_posts(service_category, service_name);

drop trigger if exists trg_community_posts_updated_at on public.community_posts;
create trigger trg_community_posts_updated_at
before update on public.community_posts
for each row execute function public.community_set_updated_at();

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('client', 'provider')),
  author_provider_id uuid null references public.providers(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now(),
  constraint community_comments_role_identity_check check (
    (author_role = 'provider' and author_provider_id is not null)
    or
    (author_role = 'client' and author_provider_id is null)
  )
);

create index if not exists idx_community_comments_post
  on public.community_comments(post_id, created_at desc);
create index if not exists idx_community_comments_author
  on public.community_comments(author_user_id, author_role);

create table if not exists public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'helpful', 'thanks')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_community_reactions_unique
  on public.community_reactions(post_id, user_id, reaction_type);

create table if not exists public.community_plugs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  recommender_user_id uuid not null references auth.users(id) on delete cascade,
  plugged_provider_id uuid not null references public.providers(id) on delete cascade,
  note text null check (char_length(coalesce(note, '')) <= 300),
  created_at timestamptz not null default now(),
  constraint community_plugs_unique_per_post unique (post_id, recommender_user_id, plugged_provider_id)
);

create index if not exists idx_community_plugs_post
  on public.community_plugs(post_id, created_at desc);
create index if not exists idx_community_plugs_provider
  on public.community_plugs(plugged_provider_id);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 400),
  created_at timestamptz not null default now()
);

create index if not exists idx_community_reports_target
  on public.community_reports(target_type, target_id, created_at desc);

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text null check (actor_role in ('client', 'provider')),
  event_type text not null check (
    event_type in (
      'community_post_created',
      'community_comment_created',
      'community_reaction_added',
      'community_plug_created',
      'community_cta_swipe',
      'community_cta_post_job',
      'community_cta_request_proposal',
      'community_cta_view_plug'
    )
  ),
  post_id uuid null references public.community_posts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_events_type_created
  on public.community_events(event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Guardrails: content and anti-abuse checks
-- ---------------------------------------------------------------------------
create or replace function public.community_validate_content_guardrails()
returns trigger
language plpgsql
as $$
begin
  if public.community_contains_blocked_contact(new.body) then
    raise exception 'Contact info and external links are not allowed in community content.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_posts_content_guardrails on public.community_posts;
create trigger trg_community_posts_content_guardrails
before insert or update on public.community_posts
for each row execute function public.community_validate_content_guardrails();

drop trigger if exists trg_community_comments_content_guardrails on public.community_comments;
create trigger trg_community_comments_content_guardrails
before insert or update on public.community_comments
for each row execute function public.community_validate_content_guardrails();

create or replace function public.community_enforce_rate_limits()
returns trigger
language plpgsql
as $$
declare
  recent_count integer;
begin
  if tg_table_name = 'community_posts' then
    if new.author_role = 'provider' then
      select count(*) into recent_count
      from public.community_posts p
      where p.author_user_id = new.author_user_id
        and p.created_at >= now() - interval '1 day';
      if recent_count >= 8 then
        raise exception 'Provider post limit reached for today.';
      end if;
    else
      select count(*) into recent_count
      from public.community_posts p
      where p.author_user_id = new.author_user_id
        and p.created_at >= now() - interval '1 day';
      if recent_count >= 12 then
        raise exception 'Daily post limit reached.';
      end if;
    end if;
  end if;

  if tg_table_name = 'community_comments' then
    if new.author_role = 'provider' then
      select count(*) into recent_count
      from public.community_comments c
      where c.author_user_id = new.author_user_id
        and c.created_at >= now() - interval '10 minutes';
      if recent_count >= 20 then
        raise exception 'Provider comment rate limit reached. Please slow down.';
      end if;
    else
      select count(*) into recent_count
      from public.community_comments c
      where c.author_user_id = new.author_user_id
        and c.created_at >= now() - interval '10 minutes';
      if recent_count >= 30 then
        raise exception 'Comment rate limit reached. Please slow down.';
      end if;
    end if;

    if exists (
      select 1
      from public.community_comments c
      where c.author_user_id = new.author_user_id
        and lower(trim(c.body)) = lower(trim(new.body))
        and c.created_at >= now() - interval '24 hours'
    ) then
      raise exception 'Duplicate comment detected. Please avoid repetitive posting.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_posts_rate_limits on public.community_posts;
create trigger trg_community_posts_rate_limits
before insert on public.community_posts
for each row execute function public.community_enforce_rate_limits();

drop trigger if exists trg_community_comments_rate_limits on public.community_comments;
create trigger trg_community_comments_rate_limits
before insert on public.community_comments
for each row execute function public.community_enforce_rate_limits();

create or replace function public.community_validate_plug_guardrails()
returns trigger
language plpgsql
as $$
declare
  provider_owner_id uuid;
begin
  select p.owner_id into provider_owner_id
  from public.providers p
  where p.id = new.plugged_provider_id;

  if provider_owner_id is null then
    raise exception 'Plug target not found.';
  end if;

  if provider_owner_id = new.recommender_user_id then
    raise exception 'You cannot plug your own provider profile.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_plugs_guardrails on public.community_plugs;
create trigger trg_community_plugs_guardrails
before insert on public.community_plugs
for each row execute function public.community_validate_plug_guardrails();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_plugs enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_events enable row level security;

do $$
begin
  -- community_posts
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and policyname = 'community_posts_select_authenticated'
  ) then
    create policy community_posts_select_authenticated
      on public.community_posts
      for select to authenticated
      using (is_archived = false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and policyname = 'community_posts_insert_own'
  ) then
    create policy community_posts_insert_own
      on public.community_posts
      for insert to authenticated
      with check (
        author_user_id = auth.uid()
        and (
          (author_role = 'client' and author_provider_id is null)
          or
          (
            author_role = 'provider'
            and exists (
              select 1
              from public.providers p
              where p.id = community_posts.author_provider_id
                and p.owner_id = auth.uid()
            )
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and policyname = 'community_posts_update_own'
  ) then
    create policy community_posts_update_own
      on public.community_posts
      for update to authenticated
      using (author_user_id = auth.uid())
      with check (author_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and policyname = 'community_posts_delete_own'
  ) then
    create policy community_posts_delete_own
      on public.community_posts
      for delete to authenticated
      using (author_user_id = auth.uid());
  end if;

  -- community_comments
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_comments' and policyname = 'community_comments_select_authenticated'
  ) then
    create policy community_comments_select_authenticated
      on public.community_comments
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_comments' and policyname = 'community_comments_insert_own'
  ) then
    create policy community_comments_insert_own
      on public.community_comments
      for insert to authenticated
      with check (
        author_user_id = auth.uid()
        and exists (select 1 from public.community_posts cp where cp.id = community_comments.post_id and cp.is_archived = false)
        and (
          (author_role = 'client' and author_provider_id is null)
          or
          (
            author_role = 'provider'
            and exists (
              select 1
              from public.providers p
              where p.id = community_comments.author_provider_id
                and p.owner_id = auth.uid()
            )
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_comments' and policyname = 'community_comments_update_own'
  ) then
    create policy community_comments_update_own
      on public.community_comments
      for update to authenticated
      using (author_user_id = auth.uid())
      with check (author_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_comments' and policyname = 'community_comments_delete_own'
  ) then
    create policy community_comments_delete_own
      on public.community_comments
      for delete to authenticated
      using (author_user_id = auth.uid());
  end if;

  -- community_reactions
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_reactions' and policyname = 'community_reactions_select_authenticated'
  ) then
    create policy community_reactions_select_authenticated
      on public.community_reactions
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_reactions' and policyname = 'community_reactions_insert_own'
  ) then
    create policy community_reactions_insert_own
      on public.community_reactions
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.community_posts cp where cp.id = community_reactions.post_id and cp.is_archived = false)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_reactions' and policyname = 'community_reactions_delete_own'
  ) then
    create policy community_reactions_delete_own
      on public.community_reactions
      for delete to authenticated
      using (user_id = auth.uid());
  end if;

  -- community_plugs
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_plugs' and policyname = 'community_plugs_select_authenticated'
  ) then
    create policy community_plugs_select_authenticated
      on public.community_plugs
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_plugs' and policyname = 'community_plugs_insert_own'
  ) then
    create policy community_plugs_insert_own
      on public.community_plugs
      for insert to authenticated
      with check (
        recommender_user_id = auth.uid()
        and exists (select 1 from public.community_posts cp where cp.id = community_plugs.post_id and cp.is_archived = false)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_plugs' and policyname = 'community_plugs_delete_own'
  ) then
    create policy community_plugs_delete_own
      on public.community_plugs
      for delete to authenticated
      using (recommender_user_id = auth.uid());
  end if;

  -- community_reports
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_reports' and policyname = 'community_reports_insert_own'
  ) then
    create policy community_reports_insert_own
      on public.community_reports
      for insert to authenticated
      with check (reporter_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_reports' and policyname = 'community_reports_select_own'
  ) then
    create policy community_reports_select_own
      on public.community_reports
      for select to authenticated
      using (reporter_user_id = auth.uid());
  end if;

  -- community_events
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_events' and policyname = 'community_events_insert_authenticated'
  ) then
    create policy community_events_insert_authenticated
      on public.community_events
      for insert to authenticated
      with check (actor_user_id is null or actor_user_id = auth.uid());
  end if;
end $$;
