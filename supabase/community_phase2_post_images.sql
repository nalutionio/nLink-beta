-- PlugFeed Community Phase 2: optional post image support
-- Run in Supabase SQL Editor.

alter table if exists public.community_posts
  add column if not exists image_url text;

-- Keep this nullable for beta; older posts have no image.
comment on column public.community_posts.image_url is 'Optional image URL attached to a community post.';
