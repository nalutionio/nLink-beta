-- Prevent self-interactions for dual-role accounts
-- Run this on existing projects where baseline policies are already created.

-- 1) Providers cannot send proposals to their own client jobs
drop policy if exists job_requests_provider_insert on public.job_requests;
create policy job_requests_provider_insert
  on public.job_requests
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = job_requests.provider_id
        and p.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.jobs j
      where j.id = job_requests.job_id
        and j.client_id <> auth.uid()
    )
  );

-- 2) Prevent client/provider from messaging themselves
drop policy if exists job_messages_insert_related on public.job_messages;
create policy job_messages_insert_related
  on public.job_messages
  for insert to authenticated
  with check (
    (
      sender_role = 'client'
      and sender_user_id = auth.uid()
      and client_id = auth.uid()
      and exists (
        select 1
        from public.jobs j
        where j.id = job_messages.job_id
          and j.client_id = auth.uid()
      )
      and exists (
        select 1
        from public.job_requests jr
        where jr.job_id = job_messages.job_id
          and jr.provider_id = job_messages.provider_id
          and jr.status in ('pending', 'accepted', 'closed')
      )
      and exists (
        select 1
        from public.providers p
        where p.id = job_messages.provider_id
          and p.owner_id <> auth.uid()
      )
    )
    or
    (
      sender_role = 'provider'
      and sender_user_id = auth.uid()
      and exists (
        select 1
        from public.providers p
        where p.id = job_messages.provider_id
          and p.owner_id = auth.uid()
      )
      and exists (
        select 1
        from public.job_requests jr
        where jr.job_id = job_messages.job_id
          and jr.provider_id = job_messages.provider_id
          and jr.status in ('pending', 'accepted', 'closed')
      )
      and client_id <> auth.uid()
    )
  );
