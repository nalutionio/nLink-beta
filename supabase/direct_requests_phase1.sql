alter table if exists public.jobs
  add column if not exists target_provider_id uuid references public.providers(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'target_provider_id'
  ) then
    execute 'create index if not exists idx_jobs_target_provider_open on public.jobs(target_provider_id, status, created_at desc)';
  end if;
end $$;
