-- Phase 12.1: Payment security foundation (Stripe-ready backend controls)
-- Run after phase12_billing_scaffold.sql

create extension if not exists pgcrypto;

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  event_created_at timestamptz not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_webhook_events_created
  on public.payment_webhook_events(created_at desc);

create table if not exists public.payment_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  response_snapshot jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (actor_user_id, idempotency_key)
);

create index if not exists idx_payment_idempotency_expires
  on public.payment_idempotency_keys(expires_at);

create table if not exists public.provider_billing_audit (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_billing_audit_provider
  on public.provider_billing_audit(provider_id, created_at desc);

alter table if exists public.payment_webhook_events enable row level security;
alter table if exists public.payment_idempotency_keys enable row level security;
alter table if exists public.provider_billing_audit enable row level security;

-- No direct client reads for webhook events/idempotency (service role only).
drop policy if exists payment_webhook_events_no_client_read on public.payment_webhook_events;
create policy payment_webhook_events_no_client_read
  on public.payment_webhook_events
  for select to authenticated
  using (false);

drop policy if exists payment_idempotency_owner_read on public.payment_idempotency_keys;
create policy payment_idempotency_owner_read
  on public.payment_idempotency_keys
  for select to authenticated
  using (actor_user_id = auth.uid());

drop policy if exists provider_billing_audit_owner_read on public.provider_billing_audit;
create policy provider_billing_audit_owner_read
  on public.provider_billing_audit
  for select to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_billing_audit.provider_id
        and p.owner_id = auth.uid()
    )
    or public.has_internal_role(auth.uid(), 'owner_admin')
    or public.has_internal_role(auth.uid(), 'admin')
    or public.has_internal_role(auth.uid(), 'support_agent')
  );
