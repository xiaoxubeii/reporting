#!/usr/bin/env bash
set -euo pipefail

readonly FUND_HOST_TEST_CONTAINER='supabase-db'
readonly FUND_HOST_TEST_DATABASE='reporting_fund_host_test'
readonly FUND_HOST_TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup_fund_host_test() {
  docker exec "$FUND_HOST_TEST_CONTAINER" dropdb -U postgres --if-exists "$FUND_HOST_TEST_DATABASE" >/dev/null 2>&1 || true
}
trap cleanup_fund_host_test EXIT

if ! docker inspect "$FUND_HOST_TEST_CONTAINER" >/dev/null 2>&1; then
  echo "Supabase database container '$FUND_HOST_TEST_CONTAINER' is not running." >&2
  exit 1
fi

recreate_database() {
  docker exec "$FUND_HOST_TEST_CONTAINER" dropdb -U postgres --if-exists "$FUND_HOST_TEST_DATABASE" >/dev/null
  docker exec "$FUND_HOST_TEST_CONTAINER" createdb -U postgres -T template0 "$FUND_HOST_TEST_DATABASE"
  docker exec "$FUND_HOST_TEST_CONTAINER" pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges \
    | sed "/SET log_min_messages TO 'fatal'/d" \
    | docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" >/dev/null

  docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" >/dev/null <<'SQL'
drop trigger if exists fund_members_single_fund on public.fund_members;
drop trigger if exists lp_account_links_single_fund on public.lp_account_links;
drop trigger if exists lp_account_links_delegation_integrity on public.lp_account_links;
drop trigger if exists lp_authorized_users_single_fund on public.lp_authorized_users;
drop trigger if exists lp_investors_fund_immutable_while_linked on public.lp_investors;
drop trigger if exists lp_accounts_auth_user_single_fund on public.lp_accounts;
drop trigger if exists fund_slug_default on public.funds;
drop trigger if exists fund_slug_immutable on public.funds;
drop function if exists public.resolve_public_fund_host(text);
drop function if exists public.resolve_published_fund_site(text);
drop function if exists public.publish_fund_public_site(uuid, bigint, uuid);
drop function if exists public.publish_fund_public_site(uuid, bigint, bigint, uuid);
drop function if exists public.unpublish_fund_public_site(uuid, uuid);
drop function if exists public.unpublish_fund_public_site(uuid, bigint, uuid);
drop table if exists public.fund_public_sites;
drop function if exists public.resolve_my_lp_fund();
drop function if exists public.enforce_fund_member_single_fund();
drop function if exists public.enforce_lp_account_link_single_fund();
drop function if exists public.enforce_lp_account_link_delegation_integrity();
drop function if exists public.enforce_lp_authorized_user_single_fund();
drop function if exists public.enforce_lp_investor_fund_immutable_while_linked();
drop function if exists public.enforce_lp_account_auth_user_single_fund();
drop function if exists public.assert_lp_account_fund_compatible(uuid, uuid);
drop function if exists public.assert_user_fund_compatible(uuid, uuid);
drop function if exists public.fund_slug_default();
drop function if exists public.fund_slug_immutable();
drop function if exists public.generated_fund_slug(text, uuid);
alter table public.funds drop column if exists slug cascade;
SQL
}

recreate_database

# Prove that historical cross-graph conflicts stop the migration instead of
# being silently normalized or assigned to the request Host.
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" >/dev/null <<'SQL'
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'migration-audit@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'migration-alpha-creator@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'migration-beta-creator@example.test');
insert into public.funds (id, name, created_by) values
  ('92000000-0000-4000-8000-000000000001', 'Audit Alpha', '91000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000002', 'Audit Beta', '91000000-0000-4000-8000-000000000003');
insert into public.fund_members (fund_id, user_id) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001');
insert into public.lp_investors (id, fund_id, name) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'Audit LP');
insert into public.lp_accounts (id, auth_user_id, email, status) values
  ('94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'migration-audit@example.test', 'active');
insert into public.lp_account_links (lp_account_id, fund_id, lp_investor_id) values
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001');
SQL

readonly AUDIT_OUTPUT="$(mktemp -t reporting-fund-host-audit.XXXXXX)"
if docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/migrations/20260727000000_fund_subdomain_isolation.sql" >"$AUDIT_OUTPUT" 2>&1; then
  echo 'Migration unexpectedly accepted a historical cross-Fund identity.' >&2
  rm -f -- "$AUDIT_OUTPUT"
  exit 1
fi
if ! grep -q 'Existing auth user can access more than one Fund' "$AUDIT_OUTPUT"; then
  echo 'Migration failed for an unexpected reason:' >&2
  sed -n '1,120p' "$AUDIT_OUTPUT" >&2
  rm -f -- "$AUDIT_OUTPUT"
  exit 1
fi
rm -f -- "$AUDIT_OUTPUT"

recreate_database

# Prove that an unclaimed LP account cannot already span Funds through a
# direct link plus an authorized-user delegation. This invariant is about the
# LP account graph itself, not only accounts that already have auth_user_id.
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" >/dev/null <<'SQL'
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000011', 'migration-account-alpha@example.test'),
  ('91000000-0000-4000-8000-000000000012', 'migration-account-beta@example.test');
insert into public.funds (id, name, created_by) values
  ('92000000-0000-4000-8000-000000000011', 'Account Alpha', '91000000-0000-4000-8000-000000000011'),
  ('92000000-0000-4000-8000-000000000012', 'Account Beta', '91000000-0000-4000-8000-000000000012');
insert into public.lp_investors (id, fund_id, name) values
  ('93000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000011', 'Account Alpha LP'),
  ('93000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000012', 'Account Beta LP');
insert into public.lp_accounts (id, auth_user_id, email, status) values
  ('94000000-0000-4000-8000-000000000011', null, 'unclaimed@example.test', 'active'),
  ('94000000-0000-4000-8000-000000000012', null, 'principal-beta@example.test', 'active');
insert into public.lp_account_links (lp_account_id, fund_id, lp_investor_id) values
  ('94000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000011'),
  ('94000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000012');
insert into public.lp_authorized_users
  (authorized_user_account_id, principal_lp_account_id, lp_investor_id) values
  ('94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000012');
SQL

readonly ACCOUNT_AUDIT_OUTPUT="$(mktemp -t reporting-fund-account-audit.XXXXXX)"
if docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/migrations/20260727000000_fund_subdomain_isolation.sql" >"$ACCOUNT_AUDIT_OUTPUT" 2>&1; then
  echo 'Migration unexpectedly accepted a historical cross-Fund LP account.' >&2
  rm -f -- "$ACCOUNT_AUDIT_OUTPUT"
  exit 1
fi
if ! grep -q 'Existing LP account can access more than one Fund' "$ACCOUNT_AUDIT_OUTPUT"; then
  echo 'LP account migration audit failed for an unexpected reason:' >&2
  sed -n '1,120p' "$ACCOUNT_AUDIT_OUTPUT" >&2
  rm -f -- "$ACCOUNT_AUDIT_OUTPUT"
  exit 1
fi
rm -f -- "$ACCOUNT_AUDIT_OUTPUT"

recreate_database
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/migrations/20260727000000_fund_subdomain_isolation.sql" >/dev/null

# Prove delegation creation and principal-link removal serialize on the same
# LP-account lock. Without that coordination, each transaction can observe the
# other's uncommitted absence and commit an orphaned delegation.
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" >/dev/null <<'SQL'
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000021', 'concurrency-creator@example.test');
insert into public.funds (id, name, created_by) values
  ('92000000-0000-4000-8000-000000000021', 'Concurrency Fund', '91000000-0000-4000-8000-000000000021');
insert into public.lp_investors (id, fund_id, name) values
  ('93000000-0000-4000-8000-000000000021', '92000000-0000-4000-8000-000000000021', 'Concurrency LP');
insert into public.lp_accounts (id, auth_user_id, email, status) values
  ('94000000-0000-4000-8000-000000000021', null, 'concurrency-principal@example.test', 'active'),
  ('94000000-0000-4000-8000-000000000022', null, 'concurrency-authorized@example.test', 'active');
insert into public.lp_account_links (id, lp_account_id, fund_id, lp_investor_id) values
  ('95000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000021', '92000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000021');
SQL

readonly DELEGATION_OUTPUT="$(mktemp -t reporting-fund-delegation-insert.XXXXXX)"
readonly LINK_DELETE_OUTPUT="$(mktemp -t reporting-fund-link-delete.XXXXXX)"
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  >"$DELEGATION_OUTPUT" 2>&1 <<'SQL' &
begin;
insert into public.lp_authorized_users
  (authorized_user_account_id, principal_lp_account_id, lp_investor_id) values
  ('94000000-0000-4000-8000-000000000022', '94000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000021');
select pg_sleep(1);
commit;
SQL
readonly DELEGATION_PID=$!
sleep 0.2

if docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  >"$LINK_DELETE_OUTPUT" 2>&1 <<'SQL'
delete from public.lp_account_links
where id = '95000000-0000-4000-8000-000000000021';
SQL
then
  wait "$DELEGATION_PID"
  echo 'Concurrent principal-link deletion unexpectedly succeeded.' >&2
  rm -f -- "$DELEGATION_OUTPUT" "$LINK_DELETE_OUTPUT"
  exit 1
fi
wait "$DELEGATION_PID"
if ! grep -q 'LP investor link cannot change while delegations exist' "$LINK_DELETE_OUTPUT"; then
  echo 'Concurrent principal-link deletion failed for an unexpected reason:' >&2
  sed -n '1,120p' "$LINK_DELETE_OUTPUT" >&2
  rm -f -- "$DELEGATION_OUTPUT" "$LINK_DELETE_OUTPUT"
  exit 1
fi
rm -f -- "$DELEGATION_OUTPUT" "$LINK_DELETE_OUTPUT"

recreate_database
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/migrations/20260727000000_fund_subdomain_isolation.sql" >/dev/null
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/tests/fund_subdomain_isolation.sql" >/dev/null
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/migrations/20260728000000_fund_public_sites.sql" >/dev/null
docker exec -i "$FUND_HOST_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$FUND_HOST_TEST_DATABASE" \
  < "$FUND_HOST_TEST_ROOT/supabase/tests/fund_public_sites.sql" >/dev/null

echo 'Fund host and public site migration audit/database tests passed.'
