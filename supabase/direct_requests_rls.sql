-- Allow Neighbor direct request inserts into job_requests.
-- Safe to re-run, and safe even if jobs.target_provider_id does not exist yet.

drop policy if exists job_requests_client_insert_direct on public.job_requests;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'target_provider_id'
  ) then
    execute $policy$
      create policy job_requests_client_insert_direct
        on public.job_requests
        for insert to authenticated
        with check (
          exists (
            select 1
            from public.jobs j
            where j.id = job_requests.job_id
              and j.client_id = auth.uid()
              and (
                j.target_provider_id is null
                or j.target_provider_id = job_requests.provider_id
              )
          )
          and exists (
            select 1
            from public.providers p
            where p.id = job_requests.provider_id
              and p.owner_id <> auth.uid()
          )
        )
    $policy$;
  else
    execute $policy$
      create policy job_requests_client_insert_direct
        on public.job_requests
        for insert to authenticated
        with check (
          exists (
            select 1
            from public.jobs j
            where j.id = job_requests.job_id
              and j.client_id = auth.uid()
          )
          and exists (
            select 1
            from public.providers p
            where p.id = job_requests.provider_id
              and p.owner_id <> auth.uid()
          )
        )
    $policy$;
  end if;
end $$;
