-- Phase 13.3: Admin console operational tables (tickets + audit log)

create extension if not exists pgcrypto;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  subject text not null check (char_length(trim(subject)) > 0),
  body text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_status_created
  on public.support_tickets(status, created_at desc);

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  action_type text not null,
  target_type text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_action_logs_created
  on public.admin_action_logs(created_at desc);

alter table if exists public.support_tickets enable row level security;
alter table if exists public.admin_action_logs enable row level security;

drop policy if exists support_tickets_admin_all on public.support_tickets;
create policy support_tickets_admin_all
  on public.support_tickets
  for all to authenticated
  using (
    public.has_internal_role(auth.uid(), 'owner_admin')
    or public.has_internal_role(auth.uid(), 'admin')
    or public.has_internal_role(auth.uid(), 'support_agent')
  )
  with check (
    public.has_internal_role(auth.uid(), 'owner_admin')
    or public.has_internal_role(auth.uid(), 'admin')
    or public.has_internal_role(auth.uid(), 'support_agent')
  );

drop policy if exists support_tickets_requester_read on public.support_tickets;
create policy support_tickets_requester_read
  on public.support_tickets
  for select to authenticated
  using (requester_user_id = auth.uid());

drop policy if exists admin_action_logs_admin_read on public.admin_action_logs;
create policy admin_action_logs_admin_read
  on public.admin_action_logs
  for select to authenticated
  using (
    public.has_internal_role(auth.uid(), 'owner_admin')
    or public.has_internal_role(auth.uid(), 'admin')
    or public.has_internal_role(auth.uid(), 'support_agent')
    or public.has_internal_role(auth.uid(), 'moderator')
  );

drop policy if exists admin_action_logs_admin_insert on public.admin_action_logs;
create policy admin_action_logs_admin_insert
  on public.admin_action_logs
  for insert to authenticated
  with check (
    public.has_internal_role(auth.uid(), 'owner_admin')
    or public.has_internal_role(auth.uid(), 'admin')
    or public.has_internal_role(auth.uid(), 'support_agent')
    or public.has_internal_role(auth.uid(), 'moderator')
  );
