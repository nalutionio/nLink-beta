-- Allow Plug to update their own direct-request row (requested -> pending with proposal details).
-- Safe to re-run.

drop policy if exists job_requests_provider_update on public.job_requests;
create policy job_requests_provider_update
  on public.job_requests
  for update to authenticated
  using (
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
  )
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
