-- Proposal sheet fields for provider -> client proposal transparency
-- Run in Supabase SQL editor.

alter table if exists public.job_requests
  add column if not exists proposal_type text check (proposal_type in ('inspection_first', 'direct_service', 'hybrid')),
  add column if not exists estimated_price_min numeric,
  add column if not exists estimated_price_max numeric,
  add column if not exists pricing_basis text check (pricing_basis in ('fixed', 'hourly', 'per_sqft', 'after_inspection')),
  add column if not exists inspection_fee numeric,
  add column if not exists inspection_fee_creditable boolean not null default false,
  add column if not exists inspection_fee_waivable boolean not null default false,
  add column if not exists proposal_notes text;

create index if not exists idx_job_requests_proposal_type on public.job_requests(proposal_type);
