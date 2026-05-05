-- Phase 13.2: Admin/Support privilege pack
-- Grants:
--  - owner_admin/admin: full read/write on operational tables
--  - support_agent/moderator: read on operational tables + moderation write on community reports/posts/comments

-- helper is created in phase13_admin_support_setup.sql
-- public.has_internal_role(auth.uid(), 'owner_admin'|'admin'|'support_agent'|'moderator')

do $$
declare
  t text;
begin
  foreach t in array ARRAY[
    'clients',
    'providers',
    'jobs',
    'job_requests',
    'job_appointments',
    'job_messages',
    'direct_messages',
    'community_posts',
    'community_comments',
    'community_reactions',
    'community_plugs',
    'community_reports',
    'community_notifications',
    'provider_billing_profiles',
    'provider_usage_monthly'
  ]::text[]
  loop
    execute format('alter table if exists public.%I enable row level security', t);

    execute format('
      do $inner$
      begin
        if not exists (
          select 1 from pg_policies
          where schemaname = ''public''
            and tablename = %L
            and policyname = %L
        ) then
          create policy %I
            on public.%I
            for all
            to authenticated
            using (
              public.has_internal_role(auth.uid(), ''owner_admin'')
              or public.has_internal_role(auth.uid(), ''admin'')
            )
            with check (
              public.has_internal_role(auth.uid(), ''owner_admin'')
              or public.has_internal_role(auth.uid(), ''admin'')
            );
        end if;
      end
      $inner$;',
      t,
      t || '_admin_all',
      t || '_admin_all',
      t
    );

    execute format('
      do $inner$
      begin
        if not exists (
          select 1 from pg_policies
          where schemaname = ''public''
            and tablename = %L
            and policyname = %L
        ) then
          create policy %I
            on public.%I
            for select
            to authenticated
            using (
              public.has_internal_role(auth.uid(), ''owner_admin'')
              or public.has_internal_role(auth.uid(), ''admin'')
              or public.has_internal_role(auth.uid(), ''support_agent'')
              or public.has_internal_role(auth.uid(), ''moderator'')
            );
        end if;
      end
      $inner$;',
      t,
      t || '_support_read',
      t || '_support_read',
      t
    );
  end loop;
end $$;

-- support moderation actions (limited writes) for community triage
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_posts'
      and policyname = 'community_posts_support_update'
  ) then
    create policy community_posts_support_update
      on public.community_posts
      for update
      to authenticated
      using (
        public.has_internal_role(auth.uid(), 'owner_admin')
        or public.has_internal_role(auth.uid(), 'admin')
        or public.has_internal_role(auth.uid(), 'support_agent')
      )
      with check (
        public.has_internal_role(auth.uid(), 'owner_admin')
        or public.has_internal_role(auth.uid(), 'admin')
        or public.has_internal_role(auth.uid(), 'support_agent')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_comments'
      and policyname = 'community_comments_support_delete'
  ) then
    create policy community_comments_support_delete
      on public.community_comments
      for delete
      to authenticated
      using (
        public.has_internal_role(auth.uid(), 'owner_admin')
        or public.has_internal_role(auth.uid(), 'admin')
        or public.has_internal_role(auth.uid(), 'support_agent')
        or public.has_internal_role(auth.uid(), 'moderator')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_reports'
      and policyname = 'community_reports_support_delete'
  ) then
    create policy community_reports_support_delete
      on public.community_reports
      for delete
      to authenticated
      using (
        public.has_internal_role(auth.uid(), 'owner_admin')
        or public.has_internal_role(auth.uid(), 'admin')
        or public.has_internal_role(auth.uid(), 'support_agent')
        or public.has_internal_role(auth.uid(), 'moderator')
      );
  end if;
end $$;
