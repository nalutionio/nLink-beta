alter table if exists public.job_appointments
  add column if not exists client_shared_address text,
  add column if not exists client_shared_at timestamptz;
