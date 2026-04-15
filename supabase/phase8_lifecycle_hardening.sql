-- Phase 8: Booking + Job lifecycle hardening
-- Enforces request status transitions and keeps job/job_appointment states in sync.

create or replace function public.enforce_job_request_status_transition()
returns trigger
language plpgsql
as $$
declare
  old_status text := coalesce(old.status, '');
  new_status text := coalesce(new.status, '');
  allowed boolean := false;
begin
  if old_status = new_status then
    return new;
  end if;

  allowed := (
    (old_status = 'requested' and new_status in ('pending', 'declined'))
    or (old_status = 'pending' and new_status in ('accepted', 'declined'))
    or (old_status = 'accepted' and new_status in ('completed', 'closed'))
    or (old_status = 'completed' and new_status = 'closed')
  );

  if not allowed then
    raise exception 'Invalid job request status transition: % -> %', old_status, new_status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_job_requests_status_transition on public.job_requests;
create trigger trg_job_requests_status_transition
before update of status on public.job_requests
for each row execute function public.enforce_job_request_status_transition();

create or replace function public.sync_job_lifecycle_from_requests()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.status, '') = 'accepted' then
    -- Exactly one active accepted request per job.
    update public.job_requests
    set status = 'declined'
    where job_id = new.job_id
      and id <> new.id
      and status in ('pending', 'requested');

    update public.jobs
    set status = 'in_progress'
    where id = new.job_id
      and status <> 'closed';
  end if;

  if coalesce(new.status, '') = 'completed' then
    update public.jobs
    set status = 'in_progress'
    where id = new.job_id
      and status <> 'closed';
  end if;

  if coalesce(new.status, '') = 'closed' then
    update public.job_appointments
    set
      status = 'completed',
      completed_at = coalesce(completed_at, now())
    where request_id = new.id
      and status <> 'completed';

    -- Close job only when no active requests remain.
    if not exists (
      select 1
      from public.job_requests jr
      where jr.job_id = new.job_id
        and jr.status in ('accepted', 'completed')
    ) then
      update public.jobs
      set status = 'closed'
      where id = new.job_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_job_requests_lifecycle_sync on public.job_requests;
create trigger trg_job_requests_lifecycle_sync
after update of status on public.job_requests
for each row execute function public.sync_job_lifecycle_from_requests();

