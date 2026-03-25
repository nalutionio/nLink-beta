-- PlugFeed Community Phase 1 Behavior Tests
-- Run in Supabase SQL Editor AFTER:
-- 1) community_phase1_foundation.sql
-- 2) community_phase1_verification.sql
--
-- This script validates DB-enforced guardrails (constraints + triggers).
-- It creates temporary test data and cleans it up.

drop table if exists tmp_phase1_test_results;
create temporary table tmp_phase1_test_results (
  test_name text,
  expected text,
  actual text,
  passed boolean,
  details text
);

do $$
declare
  v_owner_user_id uuid;
  v_client_user_id uuid;
  v_provider_id_self uuid;
  v_provider_id_other uuid;
  v_post_id uuid;
  v_failed boolean;
  i integer;
begin
  -- Pick baseline identities.
  select p.owner_id, p.id
  into v_owner_user_id, v_provider_id_self
  from public.providers p
  where p.owner_id is not null
  order by p.created_at asc nulls last
  limit 1;

  select u.id
  into v_client_user_id
  from auth.users u
  where (v_owner_user_id is null or u.id <> v_owner_user_id)
  order by u.created_at asc nulls last
  limit 1;

  if v_client_user_id is null then
    v_client_user_id := v_owner_user_id;
  end if;

  select p.id
  into v_provider_id_other
  from public.providers p
  where p.owner_id is distinct from v_owner_user_id
  order by p.created_at asc nulls last
  limit 1;

  if v_owner_user_id is null or v_provider_id_self is null or v_client_user_id is null then
    insert into tmp_phase1_test_results(test_name, expected, actual, passed, details)
    values (
      'precheck_identities',
      'Need at least 1 provider + 1 user',
      'missing test identities',
      false,
      'Create at least one provider account and one user account, then rerun.'
    );
    return;
  end if;

  -- 1) provider role without provider_id must fail
  v_failed := false;
  begin
    insert into public.community_posts(author_user_id, author_role, author_provider_id, post_type, body)
    values (v_owner_user_id, 'provider', null, 'showcase', 'test provider missing profile id');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'provider_requires_author_provider_id',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 2) client role with provider_id set must fail
  v_failed := false;
  begin
    insert into public.community_posts(author_user_id, author_role, author_provider_id, post_type, body)
    values (v_client_user_id, 'client', v_provider_id_self, 'ask', 'test client with provider id set');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'client_must_not_set_author_provider_id',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 3) provider disallowed post type must fail
  v_failed := false;
  begin
    insert into public.community_posts(author_user_id, author_role, author_provider_id, post_type, body)
    values (v_owner_user_id, 'provider', v_provider_id_self, 'ask', 'provider ask post should fail');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'provider_post_type_restriction',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 4) blocked contact/link in post must fail
  v_failed := false;
  begin
    insert into public.community_posts(author_user_id, author_role, post_type, body)
    values (v_client_user_id, 'client', 'ask', 'Call me at 555-111-2222 or visit https://example.com');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'post_blocks_contact_or_links',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 5) valid client post must pass (used by comment/plug tests)
  v_failed := false;
  begin
    insert into public.community_posts(author_user_id, author_role, post_type, body, service_category)
    values (v_client_user_id, 'client', 'ask', 'Need roof inspection this weekend', 'Home Repair')
    returning id into v_post_id;
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'valid_client_post_insert',
    'PASS insert',
    case when v_failed then 'FAILED (unexpected)' else 'INSERTED as expected' end,
    not v_failed,
    case when v_failed then 'Cannot continue some tests without post_id.' else null end
  );

  if v_post_id is null then
    return;
  end if;

  -- 6) blocked contact/link in comment must fail
  v_failed := false;
  begin
    insert into public.community_comments(post_id, author_user_id, author_role, body)
    values (v_post_id, v_client_user_id, 'client', 'Email me: test@email.com');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'comment_blocks_contact_or_links',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 7) duplicate comment block (same author + same body within 24h)
  v_failed := false;
  begin
    insert into public.community_comments(post_id, author_user_id, author_role, body)
    values (v_post_id, v_client_user_id, 'client', 'duplicate-check-comment');
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    begin
      insert into public.community_comments(post_id, author_user_id, author_role, body)
      values (v_post_id, v_client_user_id, 'client', 'duplicate-check-comment');
      v_failed := false;
    exception when others then
      v_failed := true;
    end;
  end if;

  insert into tmp_phase1_test_results values (
    'duplicate_comment_block',
    '2nd insert should FAIL',
    case when v_failed then 'FAILED as expected' else '2nd INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 8) provider comment rate limit (21st comment in 10 minutes should fail)
  v_failed := false;
  begin
    for i in 1..21 loop
      insert into public.community_comments(post_id, author_user_id, author_role, author_provider_id, body)
      values (v_post_id, v_owner_user_id, 'provider', v_provider_id_self, 'provider-rate-test-' || i::text);
    end loop;
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'provider_comment_rate_limit',
    'Burst should FAIL at limit',
    case when v_failed then 'FAILED as expected' else 'All inserts passed (check limits)' end,
    v_failed,
    null
  );

  -- 9) self-plug should fail
  v_failed := false;
  begin
    insert into public.community_plugs(post_id, recommender_user_id, plugged_provider_id, note)
    values (v_post_id, v_owner_user_id, v_provider_id_self, 'self plug should fail');
  exception when others then
    v_failed := true;
  end;
  insert into tmp_phase1_test_results values (
    'self_plug_block',
    'FAIL insert',
    case when v_failed then 'FAILED as expected' else 'INSERTED (unexpected)' end,
    v_failed,
    null
  );

  -- 10) valid plug of other provider should pass (if another provider exists)
  if v_provider_id_other is null then
    insert into tmp_phase1_test_results values (
      'valid_plug_other_provider',
      'PASS insert',
      'SKIPPED',
      true,
      'No second provider found in this environment.'
    );
  else
    v_failed := false;
    begin
      insert into public.community_plugs(post_id, recommender_user_id, plugged_provider_id, note)
      values (v_post_id, v_client_user_id, v_provider_id_other, 'recommended by community test');
    exception when others then
      v_failed := true;
    end;
    insert into tmp_phase1_test_results values (
      'valid_plug_other_provider',
      'PASS insert',
      case when v_failed then 'FAILED (unexpected)' else 'INSERTED as expected' end,
      not v_failed,
      null
    );
  end if;

  -- cleanup rows created in this script
  delete from public.community_plugs where post_id = v_post_id;
  delete from public.community_comments where post_id = v_post_id;
  delete from public.community_posts where id = v_post_id;
end $$;

select *
from tmp_phase1_test_results
order by passed asc, test_name asc;
