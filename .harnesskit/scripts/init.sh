#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit init =="

for required in AGENTS.md .harnesskit/docs/harness.md .harnesskit/rules/feature-plan.md .harnesskit/rules/skills.md .harnesskit/rules/mcp.md .harnesskit/rules/workflow.md .harnesskit/rules/verification.md .harnesskit/rules/browser.md .harnesskit/state/feature_list.json .harnesskit/state/progress.md .harnesskit/scripts/init.sh .harnesskit/scripts/verify.sh .harnesskit/scripts/verify-fast.sh .harnesskit/scripts/verify-targeted.sh .harnesskit/scripts/verify-full.sh .harnesskit/scripts/clean-state.sh .harnesskit/scripts/create-feature-plan.sh .harnesskit/scripts/create-feature-worktree.sh .harnesskit/scripts/merge-feature-worktree.sh; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required HarnessKit file: $required" >&2
    exit 1
  fi
done

if [[ "${HARNESS_INSTALL_DEPS:-0}" == "1" ]]; then
  if [[ -f package-lock.json ]] && command -v npm >/dev/null 2>&1; then
    npm ci
  elif [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    yarn install --frozen-lockfile
  fi
fi

./.harnesskit/scripts/verify.sh
./.harnesskit/scripts/clean-state.sh

echo "HarnessKit init complete."
