-- Phase 7.5 follow-up: preserve actor role on reactions for dual-role users.

alter table if exists public.community_reactions
  add column if not exists actor_role text null check (actor_role in ('client', 'provider'));

alter table if exists public.community_reactions
  add column if not exists actor_provider_id uuid null references public.providers(id) on delete set null;

