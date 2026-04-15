-- Phase 7.5: Community notifications (comments / likes / plugs)

create extension if not exists pgcrypto;

create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  source_type text not null check (source_type in ('comment', 'reaction', 'plug')),
  source_id uuid not null,
  message text not null default '',
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_notifications_recipient
  on public.community_notifications(recipient_user_id, is_read, created_at desc);

create index if not exists idx_community_notifications_post
  on public.community_notifications(post_id, created_at desc);

alter table public.community_notifications enable row level security;

drop policy if exists community_notifications_select_own on public.community_notifications;
create policy community_notifications_select_own
  on public.community_notifications
  for select
  to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists community_notifications_update_own on public.community_notifications;
create policy community_notifications_update_own
  on public.community_notifications
  for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.community_create_notification(
  _recipient uuid,
  _actor uuid,
  _post_id uuid,
  _source_type text,
  _source_id uuid,
  _message text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _recipient is null or _actor is null or _post_id is null or _source_id is null then
    return;
  end if;
  if _recipient = _actor then
    return;
  end if;

  insert into public.community_notifications (
    recipient_user_id,
    actor_user_id,
    post_id,
    source_type,
    source_id,
    message
  ) values (
    _recipient,
    _actor,
    _post_id,
    _source_type,
    _source_id,
    coalesce(_message, '')
  );
end;
$$;

revoke all on function public.community_create_notification(uuid, uuid, uuid, text, uuid, text) from public;
grant execute on function public.community_create_notification(uuid, uuid, uuid, text, uuid, text) to authenticated;

create or replace function public.community_notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select p.author_user_id into owner_id
  from public.community_posts p
  where p.id = new.post_id;

  perform public.community_create_notification(
    owner_id,
    new.author_user_id,
    new.post_id,
    'comment',
    new.id,
    'New comment on your post'
  );
  return new;
end;
$$;

create or replace function public.community_notify_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select p.author_user_id into owner_id
  from public.community_posts p
  where p.id = new.post_id;

  perform public.community_create_notification(
    owner_id,
    new.user_id,
    new.post_id,
    'reaction',
    new.id,
    'Someone liked your post'
  );
  return new;
end;
$$;

create or replace function public.community_notify_post_plug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select p.author_user_id into owner_id
  from public.community_posts p
  where p.id = new.post_id;

  perform public.community_create_notification(
    owner_id,
    new.recommender_user_id,
    new.post_id,
    'plug',
    new.id,
    'Someone plugged a pro on your post'
  );
  return new;
end;
$$;

drop trigger if exists trg_community_notify_comment on public.community_comments;
create trigger trg_community_notify_comment
after insert on public.community_comments
for each row execute function public.community_notify_post_comment();

drop trigger if exists trg_community_notify_reaction on public.community_reactions;
create trigger trg_community_notify_reaction
after insert on public.community_reactions
for each row execute function public.community_notify_post_reaction();

drop trigger if exists trg_community_notify_plug on public.community_plugs;
create trigger trg_community_notify_plug
after insert on public.community_plugs
for each row execute function public.community_notify_post_plug();

