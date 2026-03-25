-- PlugFeed auth metadata repair
-- Use when one account starts failing REST calls (ERR_CONNECTION_RESET / CLOSED)
-- due to oversized or stale user_metadata values.

-- 1) Inspect current metadata size (replace with affected email)
select
  id,
  email,
  octet_length(coalesce(raw_user_meta_data::text, '{}')) as metadata_bytes,
  raw_user_meta_data
from auth.users
where email = 'REPLACE_WITH_EMAIL';

-- 2) Remove heavy/stale keys but keep needed lightweight fields
update auth.users
set raw_user_meta_data =
  (
    coalesce(raw_user_meta_data, '{}'::jsonb)
      - 'client_banner_url'
      - 'provider_banner_url'
      - 'client_property_profile'
  )
where email = 'REPLACE_WITH_EMAIL';

-- 3) Verify after cleanup
select
  id,
  email,
  octet_length(coalesce(raw_user_meta_data::text, '{}')) as metadata_bytes_after,
  raw_user_meta_data
from auth.users
where email = 'REPLACE_WITH_EMAIL';
