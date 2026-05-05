-- Phase 13.2 RBAC permissions matrix

create table if not exists public.internal_permissions (
  key text primary key,
  description text not null
);

create table if not exists public.internal_role_permissions (
  role text not null check (role in ('owner_admin', 'admin', 'support_agent', 'moderator')),
  permission_key text not null references public.internal_permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_key)
);

alter table if exists public.internal_role_permissions
  drop constraint if exists internal_role_permissions_role_check;

alter table if exists public.internal_role_permissions
  add constraint internal_role_permissions_role_check
  check (role in ('owner_admin', 'admin', 'support_agent', 'moderator'));

insert into public.internal_permissions (key, description) values
  ('dashboard.view', 'View admin/support dashboards'),
  ('reports.view', 'View reports and disputes'),
  ('reports.resolve', 'Resolve reports'),
  ('community.hide_post', 'Hide/archive community posts'),
  ('community.remove_comment', 'Delete community comments'),
  ('users.suspend', 'Suspend users'),
  ('users.restore', 'Restore users'),
  ('plugs.verify', 'Verify/unverify providers'),
  ('matching.manual_link', 'Manual neighbor-to-plug linking'),
  ('billing.view', 'View billing/revenue'),
  ('billing.manage', 'Manage billing settings'),
  ('roles.manage', 'Assign/remove internal roles')
on conflict (key) do nothing;

-- Owner Admin: full permissions
insert into public.internal_role_permissions (role, permission_key)
select 'owner_admin', key from public.internal_permissions
on conflict do nothing;

-- Admin
insert into public.internal_role_permissions (role, permission_key) values
  ('admin', 'dashboard.view'),
  ('admin', 'reports.view'),
  ('admin', 'reports.resolve'),
  ('admin', 'community.hide_post'),
  ('admin', 'community.remove_comment'),
  ('admin', 'users.suspend'),
  ('admin', 'users.restore'),
  ('admin', 'plugs.verify'),
  ('admin', 'matching.manual_link'),
  ('admin', 'billing.view')
on conflict do nothing;

-- Support Agent
insert into public.internal_role_permissions (role, permission_key) values
  ('support_agent', 'dashboard.view'),
  ('support_agent', 'reports.view'),
  ('support_agent', 'reports.resolve'),
  ('support_agent', 'community.hide_post'),
  ('support_agent', 'community.remove_comment'),
  ('support_agent', 'matching.manual_link')
on conflict do nothing;

-- Moderator
insert into public.internal_role_permissions (role, permission_key) values
  ('moderator', 'dashboard.view'),
  ('moderator', 'reports.view'),
  ('moderator', 'reports.resolve'),
  ('moderator', 'community.hide_post'),
  ('moderator', 'community.remove_comment')
on conflict do nothing;

create or replace function public.has_internal_permission(target_user uuid, permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_roles r
    join public.internal_role_permissions rp on rp.role = r.role
    where r.user_id = target_user
      and rp.permission_key = permission_name
  );
$$;

alter table if exists public.internal_permissions enable row level security;
alter table if exists public.internal_role_permissions enable row level security;

drop policy if exists internal_permissions_admin_read on public.internal_permissions;
create policy internal_permissions_admin_read
  on public.internal_permissions
  for select
  to authenticated
  using (public.has_internal_role(auth.uid(), 'owner_admin') or public.has_internal_role(auth.uid(), 'admin'));

drop policy if exists internal_role_permissions_admin_read on public.internal_role_permissions;
create policy internal_role_permissions_admin_read
  on public.internal_role_permissions
  for select
  to authenticated
  using (public.has_internal_role(auth.uid(), 'owner_admin') or public.has_internal_role(auth.uid(), 'admin'));
