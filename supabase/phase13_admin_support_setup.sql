-- Phase 13.2: Admin + Support role bootstrap
-- Run this in Supabase SQL editor as project postgres/admin.

create table if not exists public.internal_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner_admin', 'admin', 'support_agent', 'moderator')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table if exists public.internal_roles
  drop constraint if exists internal_roles_role_check;

alter table if exists public.internal_roles
  add constraint internal_roles_role_check
  check (role in ('owner_admin', 'admin', 'support_agent', 'moderator'));

create or replace function public.has_internal_role(target_user uuid, target_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_roles r
    where r.user_id = target_user
      and r.role = target_role
  );
$$;

alter table if exists public.internal_roles enable row level security;

drop policy if exists internal_roles_self_read on public.internal_roles;
create policy internal_roles_self_read
  on public.internal_roles
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists internal_roles_admin_manage on public.internal_roles;
create policy internal_roles_admin_manage
  on public.internal_roles
  for all
  to authenticated
  using (public.has_internal_role(auth.uid(), 'admin'))
  with check (public.has_internal_role(auth.uid(), 'admin'));

-- Bootstrap roles for PlugFeed ops accounts
insert into public.internal_roles (user_id, role)
select id, 'owner_admin'
from auth.users
where email = 'info@nalutionsolution.com'
on conflict do nothing;

insert into public.internal_roles (user_id, role)
select id, 'support_agent'
from auth.users
where email = 'support@nalutionsolution.com'
on conflict do nothing;
