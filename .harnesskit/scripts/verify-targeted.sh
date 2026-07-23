#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit verify-targeted =="

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

if [[ -f package.json ]]; then
  run_if_script_exists typecheck
  run_if_script_exists lint
  run_if_script_exists test
fi

if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
  cargo test
fi

if [[ -f go.mod ]] && command -v go >/dev/null 2>&1; then
  go test ./...
fi

if [[ -d tests ]] && command -v python3 >/dev/null 2>&1; then
  if find tests -name 'test_*.py' -o -name '*_test.py' | grep -q .; then
    python3 -m unittest discover -s tests
  fi
fi

echo "HarnessKit verify-targeted complete."
