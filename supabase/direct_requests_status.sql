-- Add client-initiated direct-request status to job_requests state machine.
-- Safe to re-run.

alter table if exists public.job_requests
  drop constraint if exists job_requests_status_check;

alter table if exists public.job_requests
  add constraint job_requests_status_check
  check (status in ('requested', 'pending', 'accepted', 'declined', 'completed', 'closed'));

-- Optional backfill: convert legacy direct requests from pending -> requested.
update public.job_requests
set status = 'requested'
where status = 'pending'
  and coalesce(proposal_notes, '') ilike 'Direct request from Neighbor profile booking.%'
  and coalesce(proposal_type, '') = ''
  and estimated_price_min is null
  and estimated_price_max is null;
