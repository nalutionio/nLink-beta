-- Phase 9 cleanup: remove legacy provider job-messages that violate current guardrails.
-- Guard rule today:
--   provider message allowed only if
--   (a) matching request status in accepted/completed/closed
--   (b) client started the thread first (earlier or same-time client message)

delete from public.job_messages jm
where jm.sender_role = 'provider'
  and (
    not exists (
      select 1
      from public.job_requests jr
      where jr.job_id = jm.job_id
        and jr.provider_id = jm.provider_id
        and jr.status in ('accepted', 'completed', 'closed')
    )
    or not exists (
      select 1
      from public.job_messages prior_client
      where prior_client.job_id = jm.job_id
        and prior_client.provider_id = jm.provider_id
        and prior_client.client_id = jm.client_id
        and prior_client.sender_role = 'client'
        and prior_client.created_at <= jm.created_at
    )
  );

