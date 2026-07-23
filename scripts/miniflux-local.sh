#!/usr/bin/env bash

set -euo pipefail

deployment_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
secrets_dir="${deployment_root}/.miniflux-secrets"
runtime_secrets_dir="${secrets_dir}/runtime"
base_compose="${deployment_root}/compose.miniflux.yml"
init_compose="${deployment_root}/compose.miniflux.init.yml"

mkdir -p "${secrets_dir}"
chmod 700 "${secrets_dir}"
mkdir -p "${runtime_secrets_dir}"
chmod 700 "${runtime_secrets_dir}"

cleanup_bootstrap_runtime_secrets() {
  rm -f \
    "${runtime_secrets_dir}/admin_username" \
    "${runtime_secrets_dir}/admin_password"
}

trap cleanup_bootstrap_runtime_secrets EXIT

write_secret() {
  local target_path="$1"
  local secret_value="$2"

  if [[ -s "${target_path}" ]]; then
    return
  fi

  umask 077
  printf '%s' "${secret_value}" > "${target_path}"
  chmod 600 "${target_path}"
}

replace_secret() {
  local target_path="$1"
  local secret_value="$2"

  umask 077
  printf '%s' "${secret_value}" > "${target_path}"
  chmod 600 "${target_path}"
}

write_secret "${secrets_dir}/database_password" "$(openssl rand -hex 32)"

database_password="$(<"${secrets_dir}/database_password")"
if [[ ! "${database_password}" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'The Miniflux database password must be a 64-character hexadecimal value.\n' >&2
  exit 1
fi
replace_secret \
  "${secrets_dir}/database_url" \
  "postgres://miniflux:${database_password}@database/miniflux?sslmode=disable"
unset database_password

# Docker Compose bind-mount secrets keep the source ownership and mode. The
# private copies remain 0600; these short-lived runtime copies are readable by
# Miniflux's unprivileged UID and protected by their 0700 parent directory.
install -m 0644 "${secrets_dir}/database_password" "${runtime_secrets_dir}/database_password"
install -m 0644 "${secrets_dir}/database_url" "${runtime_secrets_dir}/database_url"

docker compose -f "${base_compose}" up -d --wait database

# POSTGRES_PASSWORD_FILE is only applied when a new volume is initialized.
# Synchronize the role on every run so a restored volume and regenerated local
# secret cannot drift into an unrecoverable credential mismatch.
docker compose -f "${base_compose}" exec -T database sh -eu -c '
  database_password="$(cat /run/secrets/miniflux_database_password)"
  {
    printf "ALTER ROLE miniflux WITH PASSWORD '\''"
    printf "%s" "${database_password}"
    printf "'\'';\n"
  } | psql -v ON_ERROR_STOP=1 -U miniflux -d miniflux >/dev/null
  unset database_password
'

# Start without bootstrap variables first. This also runs schema migrations and
# removes bootstrap variables from any interrupted previous attempt.
docker compose -f "${base_compose}" up -d --wait

admin_count="$(
  docker compose -f "${base_compose}" exec -T database \
    psql -U miniflux -d miniflux -Atc \
    "select count(*) from users where is_admin is true"
)"

if [[ "${admin_count}" == "0" ]]; then
  write_secret "${secrets_dir}/admin_username" "admin"
  write_secret "${secrets_dir}/admin_password" "$(openssl rand -hex 24)"

  install -m 0644 "${secrets_dir}/admin_username" "${runtime_secrets_dir}/admin_username"
  install -m 0644 "${secrets_dir}/admin_password" "${runtime_secrets_dir}/admin_password"

  docker compose \
    -f "${base_compose}" \
    -f "${init_compose}" \
    up -d --wait --force-recreate miniflux

  admin_count="$(
    docker compose -f "${base_compose}" exec -T database \
      psql -U miniflux -d miniflux -Atc \
      "select count(*) from users where is_admin is true"
  )"
  if [[ "${admin_count}" == "0" ]]; then
    printf 'Miniflux admin bootstrap did not create an administrator.\n' >&2
    exit 1
  fi

  # Recreate without bootstrap credentials in the long-running container.
  docker compose \
    -f "${base_compose}" \
    up -d --wait --force-recreate miniflux
fi

cleanup_bootstrap_runtime_secrets
trap - EXIT
rm -f "${secrets_dir}/initialized"

if [[ -s "${secrets_dir}/admin_username" && -s "${secrets_dir}/admin_password" ]]; then
  node "${deployment_root}/scripts/miniflux-provisioner-key.mjs" \
    --base-url "http://127.0.0.1:${MINIFLUX_PORT:-8085}" \
    --secret-dir "${secrets_dir}"
fi

printf 'Miniflux is available at http://127.0.0.1:%s\n' "${MINIFLUX_PORT:-8085}"
if [[ -s "${secrets_dir}/admin_username" && -s "${secrets_dir}/admin_password" ]]; then
  printf 'Initial admin credentials are stored in %s (mode 0600; they may have been rotated).\n' "${secrets_dir}"
else
  printf 'An existing admin was detected; bootstrap credentials are not stored locally.\n'
fi
