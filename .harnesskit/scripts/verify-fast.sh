#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit verify-fast =="

for required in AGENTS.md .codex/config.toml .harnesskit/manifest.json .harnesskit/docs/harness.md .harnesskit/rules/feature-plan.md .harnesskit/rules/skills.md .harnesskit/rules/mcp.md .harnesskit/rules/workflow.md .harnesskit/rules/verification.md .harnesskit/rules/browser.md .harnesskit/state/feature_list.json .harnesskit/state/progress.md .harnesskit/scripts/init.sh .harnesskit/scripts/verify.sh .harnesskit/scripts/verify-fast.sh .harnesskit/scripts/verify-targeted.sh .harnesskit/scripts/verify-full.sh .harnesskit/scripts/clean-state.sh .harnesskit/scripts/create-feature-plan.sh .harnesskit/scripts/create-feature-worktree.sh .harnesskit/scripts/merge-feature-worktree.sh .harnesskit/codex/agents/explorer.toml .harnesskit/codex/agents/reviewer.toml .harnesskit/codex/agents/docs-researcher.toml .harnesskit/codex/agents/security-reviewer.toml .harnesskit/codex/agents/worker.toml .harnesskit/codex/agents/feature-worker.toml; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required HarnessKit file: $required" >&2
    exit 1
  fi
done

for marker in "<!-- BEGIN HARNESSKIT -->" "<!-- END HARNESSKIT -->"; do
  count="$(grep -F "$marker" AGENTS.md | wc -l | tr -d ' ')"
  if [[ "$count" != "1" ]]; then
    echo "Expected AGENTS.md to contain exactly one $marker marker, got $count" >&2
    exit 1
  fi
done

for marker in "# BEGIN HARNESSKIT" "# END HARNESSKIT"; do
  count="$(grep -F "$marker" .codex/config.toml | wc -l | tr -d ' ')"
  if [[ "$count" != "1" ]]; then
    echo "Expected .codex/config.toml to contain exactly one $marker marker, got $count" >&2
    exit 1
  fi
done

./.harnesskit/scripts/clean-state.sh

if [[ -f package.json ]] && command -v node >/dev/null 2>&1; then
  node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))"
fi

find .harnesskit/scripts -type f -name '*.sh' -print0 2>/dev/null | while IFS= read -r -d '' file; do
  bash -n "$file"
done

echo "HarnessKit verify-fast complete."
