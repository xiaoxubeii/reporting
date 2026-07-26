#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_FUND_ID="7b2d62d7-58cf-4684-8c31-7e4c43b9949e"
readonly EXPECTED_FUND_NAME="CCI - 中国心血管医生创新俱乐部"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly SQL_FILE="$SCRIPT_DIR/seed-investor-demo.sql"
readonly APPLY_TOKEN="investor-medtech-v1-confirmed"

fund_id=""
fund_name=""
db_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
apply=false

usage() {
  cat <<'EOF'
Usage:
  scripts/seed-investor-demo.sh \
    --fund-id 7b2d62d7-58cf-4684-8c31-7e4c43b9949e \
    --fund-name 'CCI - 中国心血管医生创新俱乐部' [--apply]

The command is dry-run by default. --apply creates a timestamped backup under
.devctl/backups/ and then atomically replaces this fund's Inbox and Deals with
five fictional clinical demo records and seeds twenty fund-scoped experts.
EOF
}

while (($# > 0)); do
  case "$1" in
    --fund-id)
      fund_id="${2:-}"
      shift 2
      ;;
    --fund-name)
      fund_name="${2:-}"
      shift 2
      ;;
    --db-container)
      db_container="${2:-}"
      shift 2
      ;;
    --apply)
      apply=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$fund_id" != "$EXPECTED_FUND_ID" || "$fund_name" != "$EXPECTED_FUND_NAME" ]]; then
  echo "Refusing to run: both the CCI fund ID and exact fund name are required." >&2
  exit 2
fi

if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "Database container '$db_container' is not available." >&2
  exit 1
fi

actual_fund_name="$(docker exec "$db_container" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
  -c "select name from public.funds where id = '$fund_id'::uuid")"
if [[ "$actual_fund_name" != "$fund_name" ]]; then
  echo "Refusing to run: live database fund identity does not match." >&2
  exit 1
fi

counts_sql="
select json_build_object(
  'inbound_emails', (select count(*) from public.inbound_emails where fund_id = '$fund_id'::uuid),
  'inbound_deals', (select count(*) from public.inbound_deals where fund_id = '$fund_id'::uuid),
  'experts', (select count(*) from public.experts where fund_id = '$fund_id'::uuid),
  'diligence_deals', (select count(*) from public.diligence_deals where fund_id = '$fund_id'::uuid),
  'other_fund_emails', (select count(*) from public.inbound_emails where fund_id <> '$fund_id'::uuid),
  'other_fund_deals', (select count(*) from public.inbound_deals where fund_id <> '$fund_id'::uuid),
  'other_fund_experts', (select count(*) from public.experts where fund_id is distinct from '$fund_id'::uuid)
);"

before_counts="$(docker exec "$db_container" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "$counts_sql")"
echo "Target: $fund_name ($fund_id)"
echo "Before: $before_counts"

if [[ "$apply" != true ]]; then
  echo "Dry-run only. Re-run with --apply to back up and replace the demo data."
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$REPO_ROOT/.devctl/backups/investor-demo-$timestamp"
mkdir -p "$backup_dir"

backup_query() {
  local file_name="$1"
  local query="$2"
  docker exec "$db_container" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
    -c "copy ($query) to stdout" >"$backup_dir/$file_name.jsonl"
}

backup_query inbound_emails \
  "select row_to_json(t)::text from public.inbound_emails t where fund_id = '$fund_id'::uuid order by created_at"
backup_query inbound_deals \
  "select row_to_json(t)::text from public.inbound_deals t where fund_id = '$fund_id'::uuid order by created_at"
backup_query parsing_reviews \
  "select row_to_json(t)::text from public.parsing_reviews t where email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid)"
backup_query routing_corrections \
  "select row_to_json(t)::text from public.routing_corrections t where email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid)"
backup_query analyst_conversations \
  "select row_to_json(t)::text from public.analyst_conversations t where deal_id in (select id from public.inbound_deals where fund_id = '$fund_id'::uuid)"
backup_query background_jobs \
  "select row_to_json(t)::text from public.background_jobs t where fund_id = '$fund_id'::uuid and kind = 'deal_research' and payload->>'dealId' in (select id::text from public.inbound_deals where fund_id = '$fund_id'::uuid)"
backup_query experts \
  "select row_to_json(t)::text from public.experts t where fund_id = '$fund_id'::uuid order by created_at"
backup_query metric_values \
  "select row_to_json(t)::text from public.metric_values t where source_email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid)"
backup_query interactions \
  "select row_to_json(t)::text from public.interactions t where email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid)"
backup_query diligence_documents \
  "select row_to_json(t)::text from public.diligence_documents t where source_email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid)"
backup_query heartbeat_threads \
  "select row_to_json(t)::text from public.heartbeat_threads t where email_id in (select id from public.inbound_emails where fund_id = '$fund_id'::uuid) or deal_id in (select id from public.inbound_deals where fund_id = '$fund_id'::uuid)"

# This is the authoritative, transactionally consistent recovery artifact. The
# JSONL files above are human-readable inspection aids; the custom dump can be
# restored with pg_restore if the operator needs the exact pre-apply database.
docker exec "$db_container" pg_dump -U postgres -d postgres --format=custom \
  --no-owner --no-privileges >"$backup_dir/database.dump"

printf '%s\n' "$before_counts" >"$backup_dir/counts-before.json"
printf '%s\n' "$fund_id" >"$backup_dir/fund-id.txt"
printf '%s\n' "$fund_name" >"$backup_dir/fund-name.txt"
cat >"$backup_dir/RESTORE.txt" <<EOF
Restore this complete local snapshot only after stopping Reporting writers:
  docker exec -i $db_container pg_restore -U postgres -d postgres --clean --if-exists < database.dump
EOF
(
  cd "$backup_dir"
  sha256sum database.dump *.jsonl counts-before.json fund-id.txt fund-name.txt >SHA256SUMS
)

docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v fund_id="$fund_id" -v fund_name="$fund_name" -v apply_token="$APPLY_TOKEN" \
  -f - <"$SQL_FILE"

after_counts="$(docker exec "$db_container" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "$counts_sql")"
printf '%s\n' "$after_counts" >"$backup_dir/counts-after.json"

echo "After:  $after_counts"
echo "Backup: $backup_dir"
