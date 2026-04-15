-- Phase 8: reinforce review eligibility only after completion (closed).

alter table if exists public.job_reviews enable row level security;

drop policy if exists job_reviews_insert_policy on public.job_reviews;

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
          and jr.status = 'closed'
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
          and jr.status = 'closed'
      )
    )
  );

