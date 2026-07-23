#!/usr/bin/env bash
set -euo pipefail

echo "== Harness QA =="

if [[ -f package.json ]] && command -v node >/dev/null 2>&1; then
  if node - <<'NODE'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
process.exit(pkg.scripts && pkg.scripts.e2e ? 0 : 1);
NODE
  then
    npm run e2e
    exit 0
  fi
fi

if [[ -f index.html ]]; then
  grep -qi '<html' index.html
  echo "Static HTML smoke check passed."
  exit 0
fi

echo "No automated QA target found. Use gstack /qa for browser-visible changes."
