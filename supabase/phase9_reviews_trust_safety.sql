-- Phase 9: Reviews trust + safety guardrails
-- Run in Supabase SQL Editor after Phase 8 migrations.

alter table if exists public.job_reviews enable row level security;

-- Keep review text concise and moderation-friendly.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_reviews_text_length_chk'
  ) then
    alter table public.job_reviews
      add constraint job_reviews_text_length_chk
      check (review_text is null or char_length(review_text) <= 600);
  end if;
end $$;

-- Normalize and moderate review text before write.
create or replace function public.guard_job_reviews_text()
returns trigger
language plpgsql
as $$
declare
  normalized_text text;
begin
  normalized_text := regexp_replace(coalesce(new.review_text, ''), '[[:space:]]+', ' ', 'g');
  normalized_text := btrim(normalized_text);

  if normalized_text = '' then
    new.review_text := null;
  else
    -- Block contact details and links in review text.
    if normalized_text ~* '(http://|https://|www[.]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}|[0-9]{10}|[0-9]{3}[[:space:].-][0-9]{3}[[:space:].-][0-9]{4})' then
      raise exception 'Review text cannot include links, phone numbers, or email addresses.';
    end if;
    new.review_text := normalized_text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_job_reviews_guard_text on public.job_reviews;
create trigger trg_job_reviews_guard_text
before insert or update on public.job_reviews
for each row execute function public.guard_job_reviews_text();

-- Harden insert policy so reviews must match the exact closed relationship.
drop policy if exists job_reviews_insert_policy on public.job_reviews;

create policy job_reviews_insert_policy
  on public.job_reviews
  for insert
  to authenticated
  with check (
    reviewer_user_id = auth.uid()
    and reviewee_user_id <> reviewer_user_id
    and (
      (
        reviewer_role = 'client'
        and reviewee_role = 'provider'
        and client_id = auth.uid()
        and exists (
          select 1
          from public.jobs j
          where j.id = job_reviews.job_id
            and j.client_id = auth.uid()
        )
        and exists (
          select 1
          from public.providers p
          where p.id = job_reviews.provider_id
            and p.owner_id = job_reviews.reviewee_user_id
        )
        and exists (
          select 1
          from public.job_requests jr
          where jr.job_id = job_reviews.job_id
            and jr.provider_id = job_reviews.provider_id
            and jr.status = 'closed'
            and (job_reviews.job_request_id is null or jr.id = job_reviews.job_request_id)
        )
      )
      or
      (
        reviewer_role = 'provider'
        and reviewee_role = 'client'
        and exists (
          select 1
          from public.providers p
          where p.id = job_reviews.provider_id
            and p.owner_id = auth.uid()
        )
        and reviewee_user_id = client_id
        and exists (
          select 1
          from public.jobs j
          where j.id = job_reviews.job_id
            and j.client_id = job_reviews.client_id
        )
        and exists (
          select 1
          from public.job_requests jr
          where jr.job_id = job_reviews.job_id
            and jr.provider_id = job_reviews.provider_id
            and jr.status = 'closed'
            and (job_reviews.job_request_id is null or jr.id = job_reviews.job_request_id)
        )
      )
    )
  );
