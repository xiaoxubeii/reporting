#!/usr/bin/env bash
set -euo pipefail

readonly IDENTITY_TEST_CONTAINER="${FUND_IDENTITY_TEST_CONTAINER:-supabase-db}"
readonly IDENTITY_TEST_DATABASE='reporting_fund_identity_onboarding_test'
readonly IDENTITY_TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly IDENTITY_TEST_TMP="$(mktemp -d -t reporting-fund-identity.XXXXXX)"

cleanup_identity_test() {
  docker exec "$IDENTITY_TEST_CONTAINER" dropdb -U postgres --if-exists \
    "$IDENTITY_TEST_DATABASE" >/dev/null 2>&1 || true
  case "$IDENTITY_TEST_TMP" in
    /tmp/reporting-fund-identity.*) rm -rf -- "$IDENTITY_TEST_TMP" ;;
  esac
}
trap cleanup_identity_test EXIT

if ! docker inspect "$IDENTITY_TEST_CONTAINER" >/dev/null 2>&1; then
  echo "Supabase database container '$IDENTITY_TEST_CONTAINER' is not running." >&2
  exit 1
fi

docker exec "$IDENTITY_TEST_CONTAINER" dropdb -U postgres --if-exists \
  "$IDENTITY_TEST_DATABASE" >/dev/null
docker exec "$IDENTITY_TEST_CONTAINER" createdb -U postgres -T template0 \
  "$IDENTITY_TEST_DATABASE"

docker exec "$IDENTITY_TEST_CONTAINER" pg_dump -U postgres -d postgres \
  --schema-only --no-owner --no-privileges \
  | sed "/SET log_min_messages TO 'fatal'/d" \
  | docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
      -U postgres -d "$IDENTITY_TEST_DATABASE" >/dev/null

# Seed pre-migration identity state so the forward migration proves that it
# preserves differing legacy identities and backfills profile/mailbox history.
docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
  -U postgres -d "$IDENTITY_TEST_DATABASE" >/dev/null <<'SQL'
insert into auth.users (id, email, email_confirmed_at)
values ('97000000-0000-4000-8000-000000000001', 'legacy-founder@example.test', now());

insert into public.funds (id, name, slug, email_subdomain, created_by)
values (
  '97100000-0000-4000-8000-000000000001',
  'Legacy Identity Fund',
  'legacy-web',
  'legacy-mail',
  '97000000-0000-4000-8000-000000000001'
);

insert into public.fund_members (fund_id, user_id, role, display_name)
values (
  '97100000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  'admin',
  'Legacy Founder'
)
on conflict (fund_id, user_id) do update
set role = excluded.role,
    display_name = excluded.display_name;

update public.fund_members
set display_name = 'Legacy Founder'
where fund_id = '97100000-0000-4000-8000-000000000001'
  and user_id = '97000000-0000-4000-8000-000000000001';

select public.fund_email_set_user_mailbox(
  '97100000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  'legacy-founder',
  'Legacy Founder'
);
SQL

docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
  -U postgres -d "$IDENTITY_TEST_DATABASE" \
  < "$IDENTITY_TEST_ROOT/supabase/migrations/20260729000000_fund_identity_onboarding.sql" \
  >/dev/null

docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
  -U postgres -d "$IDENTITY_TEST_DATABASE" >/dev/null <<'SQL'
do $$
begin
  if not exists (
    select 1 from public.funds
    where id = '97100000-0000-4000-8000-000000000001'
      and slug = 'legacy-web'
      and email_subdomain = 'legacy-mail'
  ) then
    raise exception 'legacy Fund identity changed during migration';
  end if;

  if not exists (
    select 1 from public.user_profiles
    where user_id = '97000000-0000-4000-8000-000000000001'
      and full_name = 'Legacy Founder'
  ) then
    raise exception 'legacy display name was not conservatively backfilled';
  end if;

  if not exists (
    select 1 from public.fund_email_mailboxes
    where fund_id = '97100000-0000-4000-8000-000000000001'
      and local_part = 'legacy-founder'
      and claimed_by_user_id = '97000000-0000-4000-8000-000000000001'
      and claimed_at is not null
  ) then
    raise exception 'legacy mailbox claimant was not retained';
  end if;
end
$$;
SQL

docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
  -U postgres -d "$IDENTITY_TEST_DATABASE" \
  < "$IDENTITY_TEST_ROOT/supabase/tests/fund_identity_onboarding.sql" >/dev/null

run_sql_capture() {
  local sql="$1"
  local output_file="$2"
  timeout 12s docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
    -U postgres -d "$IDENTITY_TEST_DATABASE" -Atc "$sql" >"$output_file" 2>&1
}

wait_capture() {
  local pid="$1"
  local -n status_ref="$2"
  set +e
  wait "$pid"
  status_ref=$?
  set -e
}

assert_success() {
  local status="$1"
  local output_file="$2"
  local label="$3"
  if [[ "$status" -ne 0 ]]; then
    echo "$label failed:" >&2
    sed -n '1,100p' "$output_file" >&2
    exit 1
  fi
}

assert_one_success() {
  local first_status="$1"
  local second_status="$2"
  local first_file="$3"
  local second_file="$4"
  local label="$5"
  if [[ "$first_status" -eq 124 || "$second_status" -eq 124 ]]; then
    echo "$label timed out; possible database deadlock." >&2
    exit 1
  fi
  if [[ "$first_status" -eq 0 && "$second_status" -eq 0 ]] \
    || [[ "$first_status" -ne 0 && "$second_status" -ne 0 ]]; then
    echo "$label expected exactly one success, got $first_status and $second_status." >&2
    sed -n '1,80p' "$first_file" >&2
    sed -n '1,80p' "$second_file" >&2
    exit 1
  fi
}

docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 \
  -U postgres -d "$IDENTITY_TEST_DATABASE" >/dev/null <<'SQL'
insert into auth.users (id, email, email_confirmed_at) values
  ('97200000-0000-4000-8000-000000000001', 'race-founder@example.test', now()),
  ('97200000-0000-4000-8000-000000000002', 'race-member@example.test', now()),
  ('97200000-0000-4000-8000-000000000003', 'bootstrap-a@example.test', now()),
  ('97200000-0000-4000-8000-000000000004', 'bootstrap-b@example.test', now()),
  ('97200000-0000-4000-8000-000000000005', 'identity-race@example.test', now()),
  ('97200000-0000-4000-8000-000000000006', 'mailbox-a@example.test', now()),
  ('97200000-0000-4000-8000-000000000007', 'mailbox-b@example.test', now());

select * from public.bootstrap_fund_identity(
  '97200000-0000-4000-8000-000000000001',
  'Race Base Fund', 'race-base', 'encrypted-test-key'
);

select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'race-base'),
  'race-member@example.test', 'member', repeat('3', 64),
  now() + interval '1 day', '97200000-0000-4000-8000-000000000001'
);
select public.confirm_fund_member_invitation_delivery(
  (select id from public.fund_member_invitations where token_hash = repeat('3', 64)),
  (select id from public.funds where slug = 'race-base'),
  '97200000-0000-4000-8000-000000000001'
);
SQL

# The same verified user accepting the same token concurrently gets two
# successful idempotent results but only one membership.
readonly ACCEPT_A="$IDENTITY_TEST_TMP/accept-a"
readonly ACCEPT_B="$IDENTITY_TEST_TMP/accept-b"
run_sql_capture "select * from public.accept_fund_member_invitation(repeat('3',64),'97200000-0000-4000-8000-000000000002')" "$ACCEPT_A" &
readonly ACCEPT_PID_A=$!
run_sql_capture "select * from public.accept_fund_member_invitation(repeat('3',64),'97200000-0000-4000-8000-000000000002')" "$ACCEPT_B" &
readonly ACCEPT_PID_B=$!
wait_capture "$ACCEPT_PID_A" ACCEPT_STATUS_A
wait_capture "$ACCEPT_PID_B" ACCEPT_STATUS_B
assert_success "$ACCEPT_STATUS_A" "$ACCEPT_A" 'Concurrent invitation acceptance A'
assert_success "$ACCEPT_STATUS_B" "$ACCEPT_B" 'Concurrent invitation acceptance B'

docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -Atc "
do \$\$
begin
  if (select count(*) from public.fund_members where user_id='97200000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'concurrent acceptance created duplicate membership';
  end if;
end
\$\$;
" >/dev/null

# Exercise RLS with production-like table privileges: a member cannot update
# the Fund row, while its founder admin can. The policy—not an absent grant—is
# what must make the first UPDATE return zero rows.
docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -c \
  'grant select, update on table public.funds to authenticated' >/dev/null
readonly MEMBER_RLS="$IDENTITY_TEST_TMP/member-rls"
readonly FOUNDER_RLS="$IDENTITY_TEST_TMP/founder-rls"
docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -Atc "
set role authenticated;
select set_config('request.jwt.claim.sub','97200000-0000-4000-8000-000000000002',false);
with changed as (
  update public.funds set name='Member Must Not Write' where slug='race-base' returning 1
) select count(*) from changed;
" >"$MEMBER_RLS"
docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -Atc "
set role authenticated;
select set_config('request.jwt.claim.sub','97200000-0000-4000-8000-000000000001',false);
with changed as (
  update public.funds set name='Founder RLS Write' where slug='race-base' returning 1
) select count(*) from changed;
" >"$FOUNDER_RLS"
if [[ "$(tail -n 1 "$MEMBER_RLS" | tr -d '[:space:]')" != '0' ]] \
  || [[ "$(tail -n 1 "$FOUNDER_RLS" | tr -d '[:space:]')" != '1' ]]; then
  echo 'Fund update RLS did not distinguish member from founder admin.' >&2
  exit 1
fi

# Same-user first claim is serialized and idempotent.
readonly CLAIM_A="$IDENTITY_TEST_TMP/claim-a"
readonly CLAIM_B="$IDENTITY_TEST_TMP/claim-b"
run_sql_capture "select public.fund_email_set_user_mailbox((select id from public.funds where slug='race-base'),'97200000-0000-4000-8000-000000000002','race-member','Race Member')" "$CLAIM_A" &
readonly CLAIM_PID_A=$!
run_sql_capture "select public.fund_email_set_user_mailbox((select id from public.funds where slug='race-base'),'97200000-0000-4000-8000-000000000002','race-member','Race Member')" "$CLAIM_B" &
readonly CLAIM_PID_B=$!
wait_capture "$CLAIM_PID_A" CLAIM_STATUS_A
wait_capture "$CLAIM_PID_B" CLAIM_STATUS_B
assert_success "$CLAIM_STATUS_A" "$CLAIM_A" 'Concurrent same-user mailbox claim A'
assert_success "$CLAIM_STATUS_B" "$CLAIM_B" 'Concurrent same-user mailbox claim B'

# Duplicate Fund identity reservation has exactly one atomic winner.
readonly BOOTSTRAP_A="$IDENTITY_TEST_TMP/bootstrap-a"
readonly BOOTSTRAP_B="$IDENTITY_TEST_TMP/bootstrap-b"
run_sql_capture "select * from public.bootstrap_fund_identity('97200000-0000-4000-8000-000000000003','Concurrent Fund A','concurrent-fund','encrypted-test-key')" "$BOOTSTRAP_A" &
readonly BOOTSTRAP_PID_A=$!
run_sql_capture "select * from public.bootstrap_fund_identity('97200000-0000-4000-8000-000000000004','Concurrent Fund B','concurrent-fund','encrypted-test-key')" "$BOOTSTRAP_B" &
readonly BOOTSTRAP_PID_B=$!
wait_capture "$BOOTSTRAP_PID_A" BOOTSTRAP_STATUS_A
wait_capture "$BOOTSTRAP_PID_B" BOOTSTRAP_STATUS_B
assert_one_success "$BOOTSTRAP_STATUS_A" "$BOOTSTRAP_STATUS_B" \
  "$BOOTSTRAP_A" "$BOOTSTRAP_B" 'Concurrent Fund bootstrap'

# Bootstrap and invitation acceptance for the same auth identity use one lock
# order: one transition wins, the other fails without hanging or cross-Fund
# partial state.
docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -c "select public.create_fund_member_invitation(
    (select id from public.funds where slug='race-base'),
    'identity-race@example.test','member',repeat('4',64),now()+interval '1 day',
    '97200000-0000-4000-8000-000000000001')" >/dev/null
docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -c "select public.confirm_fund_member_invitation_delivery(
    (select id from public.fund_member_invitations where token_hash=repeat('4',64)),
    (select id from public.funds where slug='race-base'),
    '97200000-0000-4000-8000-000000000001')" >/dev/null

readonly IDENTITY_ACCEPT="$IDENTITY_TEST_TMP/identity-accept"
readonly IDENTITY_BOOTSTRAP="$IDENTITY_TEST_TMP/identity-bootstrap"
run_sql_capture "select * from public.accept_fund_member_invitation(repeat('4',64),'97200000-0000-4000-8000-000000000005')" "$IDENTITY_ACCEPT" &
readonly IDENTITY_ACCEPT_PID=$!
run_sql_capture "select * from public.bootstrap_fund_identity('97200000-0000-4000-8000-000000000005','Identity Race Fund','identity-race','encrypted-test-key')" "$IDENTITY_BOOTSTRAP" &
readonly IDENTITY_BOOTSTRAP_PID=$!
wait_capture "$IDENTITY_ACCEPT_PID" IDENTITY_ACCEPT_STATUS
wait_capture "$IDENTITY_BOOTSTRAP_PID" IDENTITY_BOOTSTRAP_STATUS
assert_one_success "$IDENTITY_ACCEPT_STATUS" "$IDENTITY_BOOTSTRAP_STATUS" \
  "$IDENTITY_ACCEPT" "$IDENTITY_BOOTSTRAP" 'Bootstrap versus invitation acceptance'

# Different users racing for one local part have one winner and the address is
# never released or duplicated.
docker exec -i "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" >/dev/null <<'SQL'
insert into public.fund_members (fund_id, user_id, invited_by, role) values
  ((select id from public.funds where slug='race-base'), '97200000-0000-4000-8000-000000000006', '97200000-0000-4000-8000-000000000001', 'member'),
  ((select id from public.funds where slug='race-base'), '97200000-0000-4000-8000-000000000007', '97200000-0000-4000-8000-000000000001', 'member');
SQL

readonly LOCAL_A="$IDENTITY_TEST_TMP/local-a"
readonly LOCAL_B="$IDENTITY_TEST_TMP/local-b"
run_sql_capture "select public.fund_email_set_user_mailbox((select id from public.funds where slug='race-base'),'97200000-0000-4000-8000-000000000006','shared-race','Mailbox A')" "$LOCAL_A" &
readonly LOCAL_PID_A=$!
run_sql_capture "select public.fund_email_set_user_mailbox((select id from public.funds where slug='race-base'),'97200000-0000-4000-8000-000000000007','shared-race','Mailbox B')" "$LOCAL_B" &
readonly LOCAL_PID_B=$!
wait_capture "$LOCAL_PID_A" LOCAL_STATUS_A
wait_capture "$LOCAL_PID_B" LOCAL_STATUS_B
assert_one_success "$LOCAL_STATUS_A" "$LOCAL_STATUS_B" "$LOCAL_A" "$LOCAL_B" \
  'Concurrent different-user mailbox claim'

docker exec "$IDENTITY_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres \
  -d "$IDENTITY_TEST_DATABASE" -Atc "
do \$\$
begin
  if (select count(*) from public.fund_email_mailboxes where local_part='shared-race') <> 1 then
    raise exception 'concurrent mailbox race did not retain exactly one address';
  end if;
end
\$\$;
" >/dev/null

echo 'Fund identity onboarding migration, behavior, and concurrency tests passed.'
