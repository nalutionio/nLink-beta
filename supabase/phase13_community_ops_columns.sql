-- Phase 13.4: Community ops columns for admin moderation controls

alter table if exists public.community_posts
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_highlighted boolean not null default false;

create index if not exists idx_community_posts_pin_highlight
  on public.community_posts(is_pinned desc, is_highlighted desc, created_at desc);
