-- Phase 6: allow provider-side job flows to read Neighbor profile fields
-- needed for updated avatar/name/property profile in proposals + job detail.

alter table if exists public.clients enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'clients_provider_related_select'
  ) then
    create policy clients_provider_related_select
      on public.clients
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.providers p
          where p.owner_id = auth.uid()
            and exists (
              select 1
              from public.jobs j
              where j.client_id = clients.user_id
                and j.client_id <> auth.uid()
                and (
                  j.status = 'open'
                  or exists (
                    select 1
                    from public.job_requests jr
                    where jr.job_id = j.id
                      and jr.provider_id = p.id
                  )
                )
            )
        )
      );
  end if;
end $$;

