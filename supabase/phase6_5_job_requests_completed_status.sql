-- Phase 6.5: allow two-step completion handshake.
-- Plug marks "completed" first, then Neighbor confirms to "closed".

alter table if exists public.job_requests
  drop constraint if exists job_requests_status_check;

alter table if exists public.job_requests
  add constraint job_requests_status_check
  check (status in ('requested', 'pending', 'accepted', 'declined', 'completed', 'closed'));

