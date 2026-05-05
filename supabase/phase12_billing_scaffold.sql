-- Phase 12: Billing + quota scaffold (Stripe-ready, no live charge logic yet)

create table if not exists public.provider_billing_profiles (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'pro', 'pro_plus')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_price_id text null,
  current_period_end timestamptz null,
  proposal_quota_monthly integer not null default 10 check (proposal_quota_monthly >= 0),
  direct_request_quota_monthly integer not null default 3 check (direct_request_quota_monthly >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_usage_monthly (
  provider_id uuid not null references public.providers(id) on delete cascade,
  usage_month date not null,
  proposals_used integer not null default 0 check (proposals_used >= 0),
  direct_requests_used integer not null default 0 check (direct_requests_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, usage_month)
);

create index if not exists idx_provider_usage_monthly_month on public.provider_usage_monthly (usage_month desc);

create or replace function public.set_provider_billing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_provider_billing_updated_at on public.provider_billing_profiles;
create trigger trg_provider_billing_updated_at
before update on public.provider_billing_profiles
for each row execute function public.set_provider_billing_updated_at();

drop trigger if exists trg_provider_usage_monthly_updated_at on public.provider_usage_monthly;
create trigger trg_provider_usage_monthly_updated_at
before update on public.provider_usage_monthly
for each row execute function public.set_provider_billing_updated_at();

alter table if exists public.provider_billing_profiles enable row level security;
alter table if exists public.provider_usage_monthly enable row level security;

drop policy if exists provider_billing_owner_read on public.provider_billing_profiles;
create policy provider_billing_owner_read
  on public.provider_billing_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.providers p
      where p.id = provider_billing_profiles.provider_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists provider_billing_owner_insert on public.provider_billing_profiles;
create policy provider_billing_owner_insert
  on public.provider_billing_profiles
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = provider_billing_profiles.provider_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists provider_usage_owner_read on public.provider_usage_monthly;
create policy provider_usage_owner_read
  on public.provider_usage_monthly
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.providers p
      where p.id = provider_usage_monthly.provider_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists provider_usage_owner_insert on public.provider_usage_monthly;
create policy provider_usage_owner_insert
  on public.provider_usage_monthly
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = provider_usage_monthly.provider_id
        and p.owner_id = auth.uid()
    )
  );

