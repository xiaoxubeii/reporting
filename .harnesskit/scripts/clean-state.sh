#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit clean-state =="

for required in AGENTS.md .harnesskit/state/feature_list.json .harnesskit/state/progress.md .harnesskit/rules/feature-plan.md; do
  if [[ ! -s "$required" ]]; then
    echo "Missing or empty required file: $required" >&2
    exit 1
  fi
done

if grep -R -n -E 'BOOTSTRAP_ONLY|NOT_ARCHITECTURE_COMPLIANT|TEMP_ADAPTER' . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude=clean-state.sh \
  --exclude='*.md' >/dev/null 2>&1; then
  echo "Bootstrap shortcut marker remains in completed code" >&2
  exit 1
fi

node - <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('.harnesskit/state/feature_list.json', 'utf8'));
const allowed = new Set(state.status_values || []);
if (!Array.isArray(state.features)) {
  console.error('features must be an array');
  process.exit(1);
}
for (const feature of state.features) {
  if (!allowed.has(feature.status)) {
    console.error(`invalid status for ${feature.id}: ${feature.status}`);
    process.exit(1);
  }
  if (feature.status === 'passing' && (!Array.isArray(feature.evidence) || feature.evidence.length === 0)) {
    console.error(`feature ${feature.id} is passing without evidence`);
    process.exit(1);
  }
}
NODE

for section in "## Current Focus" "## Last Session" "## Verification" "## Decisions" "## Open Risks" "## Next Session"; do
  if ! grep -Fq "$section" .harnesskit/state/progress.md; then
    echo "Missing progress section: $section" >&2
    exit 1
  fi
done

echo "HarnessKit clean-state complete."
