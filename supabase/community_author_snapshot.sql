-- Community author snapshot fields for stable avatar/name rendering
-- Run once in Supabase SQL editor.

alter table if exists public.community_posts
  add column if not exists author_name text,
  add column if not exists author_avatar_url text,
  add column if not exists author_subtitle text;

alter table if exists public.community_comments
  add column if not exists author_name text,
  add column if not exists author_avatar_url text;

-- Backfill post snapshots from current provider/client records.
update public.community_posts cp
set
  author_name = coalesce(
    cp.author_name,
    p.name
  ),
  author_avatar_url = coalesce(
    cp.author_avatar_url,
    p.avatar_url
  ),
  author_subtitle = coalesce(
    cp.author_subtitle,
    concat(coalesce(p.category, 'Service'), ' • Verified Plug')
  )
from public.providers p
where cp.author_role = 'provider'
  and cp.author_provider_id = p.id;

update public.community_posts cp
set
  author_name = coalesce(cp.author_name, c.full_name),
  author_avatar_url = coalesce(cp.author_avatar_url, c.avatar_url),
  author_subtitle = coalesce(cp.author_subtitle, 'Neighbor')
from public.clients c
where cp.author_role = 'client'
  and c.user_id = cp.author_user_id;

-- Backfill comment snapshots from current provider/client records.
update public.community_comments cc
set
  author_name = coalesce(
    cc.author_name,
    p.name
  ),
  author_avatar_url = coalesce(
    cc.author_avatar_url,
    p.avatar_url
  )
from public.providers p
where cc.author_role = 'provider'
  and cc.author_provider_id = p.id;

update public.community_comments cc
set
  author_name = coalesce(cc.author_name, c.full_name),
  author_avatar_url = coalesce(cc.author_avatar_url, c.avatar_url)
from public.clients c
where cc.author_role = 'client'
  and c.user_id = cc.author_user_id;
