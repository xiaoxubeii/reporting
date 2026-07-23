#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit verify-full =="

run_if_script_exists() {
  local script_name="$1"
  if [[ ! -f package.json ]] || ! command -v node >/dev/null 2>&1; then
    return 0
  fi
  if node - "$script_name" <<'NODE'
const fs = require('fs');
const script = process.argv[2];
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
process.exit(pkg.scripts && pkg.scripts[script] ? 0 : 1);
NODE
  then
    if command -v npm >/dev/null 2>&1; then
      npm run "$script_name"
    else
      echo "npm not found; cannot run package script: $script_name" >&2
      exit 1
    fi
  fi
}

./.harnesskit/scripts/verify-fast.sh
HARNESS_VERIFY_TARGETED=1 HARNESS_VERIFY_FULL=0 ./.harnesskit/scripts/verify-targeted.sh

if [[ -f package.json ]]; then
  run_if_script_exists build
  run_if_script_exists e2e
fi

echo "HarnessKit verify-full complete."
