-- Job funnel analytics events for NLink beta.

create extension if not exists pgcrypto;

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text not null default 'unknown' check (actor_role in ('client', 'provider', 'system', 'unknown')),
  event_type text not null check (event_type in (
    'job_created',
    'job_updated',
    'job_closed',
    'job_reopened',
    'request_sent',
    'request_accepted',
    'request_declined',
    'request_closed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_events_job_id on public.job_events(job_id);
create index if not exists idx_job_events_event_type on public.job_events(event_type);
create index if not exists idx_job_events_created_at on public.job_events(created_at desc);

alter table public.job_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_events'
      and policyname = 'job_events_insert_authenticated'
  ) then
    create policy job_events_insert_authenticated
      on public.job_events
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_events'
      and policyname = 'job_events_related_read'
  ) then
    create policy job_events_related_read
      on public.job_events
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.jobs j
          where j.id = job_events.job_id
            and j.client_id = auth.uid()
        )
        or exists (
          select 1
          from public.job_requests jr
          join public.providers p on p.id = jr.provider_id
          where jr.job_id = job_events.job_id
            and p.owner_id = auth.uid()
        )
      );
  end if;
end $$;
