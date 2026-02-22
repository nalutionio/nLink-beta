-- Job-scoped two-way reviews (client -> provider, provider -> client)

create extension if not exists pgcrypto;

create table if not exists public.job_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_request_id uuid null references public.job_requests(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('client', 'provider')),
  reviewee_user_id uuid not null references auth.users(id) on delete cascade,
  reviewee_role text not null check (reviewee_role in ('client', 'provider')),
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_job_reviews_unique_reviewer_per_job
  on public.job_reviews(job_id, reviewer_user_id, reviewer_role);

create index if not exists idx_job_reviews_provider_role
  on public.job_reviews(provider_id, reviewee_role, created_at desc);

create index if not exists idx_job_reviews_client_role
  on public.job_reviews(client_id, reviewee_role, created_at desc);

create or replace function public.set_job_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_job_reviews_updated_at on public.job_reviews;
create trigger trg_job_reviews_updated_at
before update on public.job_reviews
for each row execute function public.set_job_reviews_updated_at();

alter table public.job_reviews enable row level security;

-- Read:
-- - providers can read reviews about themselves
-- - clients can read reviews about themselves
-- - authenticated users can read provider-facing reviews (marketplace display)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_reviews'
      and policyname = 'job_reviews_select_policy'
  ) then
    create policy job_reviews_select_policy
      on public.job_reviews
      for select
      to authenticated, anon
      using (
        reviewee_role = 'provider'
        or reviewer_user_id = auth.uid()
        or reviewee_user_id = auth.uid()
      );
  end if;
end $$;

-- Insert:
-- - client can review provider only for own job + matching request relationship.
-- - provider can review client only for own provider request relationship.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_reviews'
      and policyname = 'job_reviews_insert_policy'
  ) then
    create policy job_reviews_insert_policy
      on public.job_reviews
      for insert
      to authenticated
      with check (
        (
          reviewer_role = 'client'
          and reviewee_role = 'provider'
          and reviewer_user_id = auth.uid()
          and client_id = auth.uid()
          and exists (
            select 1
            from public.jobs j
            where j.id = job_reviews.job_id
              and j.client_id = auth.uid()
          )
          and exists (
            select 1
            from public.job_requests jr
            where jr.job_id = job_reviews.job_id
              and jr.provider_id = job_reviews.provider_id
              and jr.status in ('accepted', 'closed')
          )
        )
        or
        (
          reviewer_role = 'provider'
          and reviewee_role = 'client'
          and reviewer_user_id = auth.uid()
          and exists (
            select 1
            from public.providers p
            where p.id = job_reviews.provider_id
              and p.owner_id = auth.uid()
          )
          and exists (
            select 1
            from public.job_requests jr
            where jr.job_id = job_reviews.job_id
              and jr.provider_id = job_reviews.provider_id
              and jr.status in ('accepted', 'closed')
          )
        )
      );
  end if;
end $$;
