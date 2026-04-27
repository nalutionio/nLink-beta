-- Phase 9 cleanup for legacy review rows created before strict guardrails.
-- Safe for beta test environments.

-- 1) Remove impossible self-reviews.
delete from public.job_reviews
where reviewer_user_id = reviewee_user_id;

-- 2) Remove reviews that are not tied to a closed job/provider relationship.
delete from public.job_reviews r
where not exists (
  select 1
  from public.job_requests jr
  where jr.job_id = r.job_id
    and jr.provider_id = r.provider_id
    and jr.status = 'closed'
);

