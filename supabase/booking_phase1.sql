-- Booking Phase 1 (Home-service flow)
-- Provider proposes windows -> Neighbor confirms one -> job can be completed.

create table if not exists public.job_appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  request_id uuid not null references public.job_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  client_id uuid not null,
  status text not null default 'proposed' check (status in ('proposed', 'scheduled', 'completed', 'cancelled')),
  proposed_slots jsonb not null default '[]'::jsonb,
  selected_slot timestamptz null,
  provider_notes text null,
  client_notes text null,
  scheduled_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_appointments_request_unique unique (request_id)
);

create index if not exists idx_job_appointments_job on public.job_appointments(job_id, created_at desc);
create index if not exists idx_job_appointments_provider on public.job_appointments(provider_id, created_at desc);
create index if not exists idx_job_appointments_client on public.job_appointments(client_id, created_at desc);

create or replace function public.set_job_appointments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_job_appointments_updated_at on public.job_appointments;
create trigger trg_job_appointments_updated_at
before update on public.job_appointments
for each row execute function public.set_job_appointments_updated_at();

alter table if exists public.job_appointments enable row level security;

-- Related users can read appointments.
drop policy if exists job_appointments_related_read on public.job_appointments;
create policy job_appointments_related_read
  on public.job_appointments
  for select to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_appointments.job_id
        and j.client_id = auth.uid()
    )
    or exists (
      select 1
      from public.providers p
      where p.id = job_appointments.provider_id
        and p.owner_id = auth.uid()
    )
  );

-- Provider can create appointment proposal only after proposal is accepted.
drop policy if exists job_appointments_provider_insert on public.job_appointments;
create policy job_appointments_provider_insert
  on public.job_appointments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = job_appointments.provider_id
        and p.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.job_requests jr
      where jr.id = job_appointments.request_id
        and jr.job_id = job_appointments.job_id
        and jr.provider_id = job_appointments.provider_id
        and jr.status = 'accepted'
    )
    and job_appointments.client_id <> auth.uid()
  );

-- Provider and owning client can update their related appointment.
drop policy if exists job_appointments_related_update on public.job_appointments;
create policy job_appointments_related_update
  on public.job_appointments
  for update to authenticated
  using (
    exists (
      select 1
      from public.providers p
      where p.id = job_appointments.provider_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.jobs j
      where j.id = job_appointments.job_id
        and j.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = job_appointments.provider_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.jobs j
      where j.id = job_appointments.job_id
        and j.client_id = auth.uid()
    )
  );

