#!/usr/bin/env bash
set -euo pipefail

readonly EXPERT_TEST_CONTAINER='supabase-db'
readonly EXPERT_TEST_DATABASE='reporting_expert_validation_test'
readonly EXPERT_TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly EXPERT_TEST_TMP="$(mktemp -d -t reporting-expert-validation.XXXXXX)"

cleanup_expert_test() {
  docker exec "$EXPERT_TEST_CONTAINER" dropdb -U postgres --if-exists "$EXPERT_TEST_DATABASE" >/dev/null 2>&1 || true
  case "$EXPERT_TEST_TMP" in
    /tmp/reporting-expert-validation.*) rm -rf -- "$EXPERT_TEST_TMP" ;;
  esac
}
trap cleanup_expert_test EXIT

if ! docker inspect "$EXPERT_TEST_CONTAINER" >/dev/null 2>&1; then
  echo "Supabase database container '$EXPERT_TEST_CONTAINER' is not running." >&2
  exit 1
fi

docker exec "$EXPERT_TEST_CONTAINER" dropdb -U postgres --if-exists "$EXPERT_TEST_DATABASE" >/dev/null
docker exec "$EXPERT_TEST_CONTAINER" createdb -U postgres -T template0 "$EXPERT_TEST_DATABASE"

# Clone schema only: the test database must have the real auth/public helpers and
# constraints, but it must never copy application data. The Supabase postgres
# role cannot set this one realtime function option in a new database, and the
# option is unrelated to the expert-validation migration.
docker exec "$EXPERT_TEST_CONTAINER" pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges \
  | sed "/SET log_min_messages TO 'fatal'/d" \
  | docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" >/dev/null

# The source database may already have this migration applied. Remove only the
# feature-owned objects from the isolated clone so the migration itself is what
# recreates and validates them below. Base application tables and user data are
# never touched.
docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" >/dev/null <<'SQL'
drop function if exists public.match_experts(uuid, extensions.vector, integer);
drop function if exists public.guard_diligence_expert_eligibility() cascade;
drop function if exists public.confirm_expert_candidate(uuid, uuid, uuid, text, text, text, text, text);
drop function if exists public.merge_expert_candidates(uuid, uuid, text, jsonb);
drop table if exists public.expert_candidates cascade;
drop table if exists public.diligence_expert_requests cascade;
drop table if exists public.experts cascade;
drop function if exists public.guard_diligence_expert_request_write();
drop function if exists public.enqueue_ingest_if_deal_idle(uuid, uuid, uuid[], uuid, text);
drop index if exists public.memo_agent_jobs_active_dedupe_unique;
drop index if exists public.diligence_documents_id_deal_fund_unique;
drop index if exists public.diligence_deals_id_fund_unique;
SQL

docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" \
  < "$EXPERT_TEST_ROOT/supabase/migrations/20260722010000_expert_validation.sql" >/dev/null
docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" \
  < "$EXPERT_TEST_ROOT/supabase/migrations/20260725020000_expert_directory_discovery.sql" >/dev/null
docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" \
  < "$EXPERT_TEST_ROOT/supabase/tests/expert_validation.sql" >/dev/null
docker exec -i "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" \
  < "$EXPERT_TEST_ROOT/supabase/tests/expert_directory_discovery.sql" >/dev/null

run_competing_update() {
  local sql="$1"
  local output_file="$2"
  docker exec "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" -Atc "$sql" >"$output_file"
}

assert_one_winner() {
  local first_file="$1"
  local second_file="$2"
  local label="$3"
  local first_count second_count
  first_count="$(tr -d '[:space:]' < "$first_file")"
  second_count="$(tr -d '[:space:]' < "$second_file")"
  if [[ ! "$first_count" =~ ^[01]$ || ! "$second_count" =~ ^[01]$ || $((first_count + second_count)) -ne 1 ]]; then
    echo "$label expected exactly one winner, got '$first_count' and '$second_count'." >&2
    exit 1
  fi
}

readonly ISSUE_A="$EXPERT_TEST_TMP/issue-a"
readonly ISSUE_B="$EXPERT_TEST_TMP/issue-b"
run_competing_update "with won as (update public.diligence_expert_requests set status='invited', token_hash=repeat('d',64), expires_at=now()+interval '1 day', invited_at=now() where id='40000000-0000-0000-0000-000000000001' and status='draft' and token_hash is null returning 1) select count(*) from won" "$ISSUE_A" &
readonly ISSUE_PID_A=$!
run_competing_update "with won as (update public.diligence_expert_requests set status='invited', token_hash=repeat('e',64), expires_at=now()+interval '1 day', invited_at=now() where id='40000000-0000-0000-0000-000000000001' and status='draft' and token_hash is null returning 1) select count(*) from won" "$ISSUE_B" &
readonly ISSUE_PID_B=$!
wait "$ISSUE_PID_A"
wait "$ISSUE_PID_B"
assert_one_winner "$ISSUE_A" "$ISSUE_B" 'Concurrent invitation issue'

CURRENT_TOKEN="$(docker exec "$EXPERT_TEST_CONTAINER" psql -U postgres -d "$EXPERT_TEST_DATABASE" -Atc "select token_hash from public.diligence_expert_requests where id='40000000-0000-0000-0000-000000000001'")"
readonly CURRENT_TOKEN
if [[ ! "$CURRENT_TOKEN" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'Invitation fixture did not produce a valid token hash.' >&2
  exit 1
fi

readonly REISSUE_A="$EXPERT_TEST_TMP/reissue-a"
readonly REISSUE_B="$EXPERT_TEST_TMP/reissue-b"
run_competing_update "with won as (update public.diligence_expert_requests set token_hash=repeat('f',64), expires_at=now()+interval '2 days', invited_at=now() where id='40000000-0000-0000-0000-000000000001' and status='invited' and token_hash='$CURRENT_TOKEN' and response_markdown is null returning 1) select count(*) from won" "$REISSUE_A" &
readonly REISSUE_PID_A=$!
run_competing_update "with won as (update public.diligence_expert_requests set token_hash=repeat('1',64), expires_at=now()+interval '2 days', invited_at=now() where id='40000000-0000-0000-0000-000000000001' and status='invited' and token_hash='$CURRENT_TOKEN' and response_markdown is null returning 1) select count(*) from won" "$REISSUE_B" &
readonly REISSUE_PID_B=$!
wait "$REISSUE_PID_A"
wait "$REISSUE_PID_B"
assert_one_winner "$REISSUE_A" "$REISSUE_B" 'Concurrent invitation reissue'

readonly SUBMIT_A="$EXPERT_TEST_TMP/submit-a"
readonly SUBMIT_B="$EXPERT_TEST_TMP/submit-b"
run_competing_update "with won as (update public.diligence_expert_requests set status='submitted', response_markdown='Concurrent answer A', submitted_at=now() where id='40000000-0000-0000-0000-000000000001' and status='invited' and expires_at>now() and response_markdown is null returning 1) select count(*) from won" "$SUBMIT_A" &
readonly SUBMIT_PID_A=$!
run_competing_update "with won as (update public.diligence_expert_requests set status='submitted', response_markdown='Concurrent answer B', submitted_at=now() where id='40000000-0000-0000-0000-000000000001' and status='invited' and expires_at>now() and response_markdown is null returning 1) select count(*) from won" "$SUBMIT_B" &
readonly SUBMIT_PID_B=$!
wait "$SUBMIT_PID_A"
wait "$SUBMIT_PID_B"
assert_one_winner "$SUBMIT_A" "$SUBMIT_B" 'Concurrent expert submission'

docker exec "$EXPERT_TEST_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$EXPERT_TEST_DATABASE" -Atc "
do \$\$
begin
  if (select status from public.diligence_expert_requests where id='40000000-0000-0000-0000-000000000001') <> 'submitted' then
    raise exception 'concurrent submission did not reach submitted';
  end if;
  if (select response_markdown from public.diligence_expert_requests where id='40000000-0000-0000-0000-000000000001') not in ('Concurrent answer A','Concurrent answer B') then
    raise exception 'concurrent submission did not preserve the winning answer';
  end if;
end
\$\$;
" >/dev/null

echo 'Expert validation database and concurrency tests passed.'
