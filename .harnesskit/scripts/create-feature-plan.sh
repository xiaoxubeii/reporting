#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  create-feature-plan.sh <repo-dir> [feature-id...] [--force]

Creates .harnesskit/rules/feature-plan.md for single-feature or multi-feature work.

Feature ids must use letters, numbers, dot, underscore, or dash.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

REPO_DIR="$1"
shift

FORCE=0
FEATURE_IDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      FEATURE_IDS+=("$1")
      shift
      ;;
  esac
done

for feature_id in "${FEATURE_IDS[@]}"; do
  case "$feature_id" in
    *[!a-zA-Z0-9._-]*|"")
      echo "Feature id must use letters, numbers, dot, underscore, or dash: $feature_id" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$REPO_DIR/.harnesskit/rules"
PLAN_FILE="$REPO_DIR/.harnesskit/rules/feature-plan.md"

if [[ -e "$PLAN_FILE" && "$FORCE" != "1" ]]; then
  echo "Feature plan already exists: $PLAN_FILE (use --force to replace)" >&2
  exit 1
fi

{
  cat <<'PLAN'
# Feature Planning Flow

Use this file when Feature Planning Gate is selected before feature-like
implementation. The main agent owns this plan, assigns work, and merges feature
branches back to the base branch one by one.

## Trigger

Run this gate for feature-like, multi-part, risky, or contract-changing work.
Simple localized bug fixes may use Bugfix Lane instead. Single-feature work is
the lightweight planning case. Multi-feature work may become parallel work after
dependency and ownership checks.

## Feature Inventory

| Feature ID | Goal | Lane | OpenSpec | Acceptance | Parallel Class | Dependencies | Owner | Worktree | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
PLAN

  if [[ ${#FEATURE_IDS[@]} -eq 0 ]]; then
    cat <<'PLAN'
| <feature-id> | <goal> | feature-planning | not-required: <reason> | <acceptance> | single-feature | none | main-agent | current checkout | planned |
PLAN
  else
    local_index=0
    for feature_id in "${FEATURE_IDS[@]}"; do
      if [[ "$local_index" -eq 0 ]]; then
        class="single-feature"
      else
        class="parallel-safe"
      fi
      printf '| %s | TBD | feature-planning | openspec/changes/<change> | TBD | %s | TBD | TBD | TBD | planned |\n' "$feature_id" "$class"
      local_index=$((local_index + 1))
    done
  fi

  cat <<'PLAN'

## Feature Requirement Contract

Copy this block for each planned feature. Keep it short; it is the shared
contract for self-check, review, testing, and merge.

### Feature: <feature-id>

#### OpenSpec Decision

- Required: yes
- Reason: HarnessKit requires project-owned OpenSpec for feature-like work.
- Change: openspec/changes/<change>
- Task: tasks.md#<item>

#### Acceptance

- <observable acceptance item>

#### Allowed Change Scope

- <path or module ownership>

#### Shared Contract Changes

- none | <API, CLI, schema, file format, env var, permission, event, or message contract>

#### Verification Plan

- smoke:
- targeted:
- contract:
- full:

#### Review Required

- reviewer: yes | no
- security-reviewer: yes | no, reason
- docs-researcher: yes | no, reason
- browser/QA: yes | no, reason

#### Progress / Evidence

- status: planned | ready | in_progress | in_review | ready_to_merge | merged | verified
- branch:
- worktree:
- commit:
- self-check:
- tests:
- risks:

## Parallelization Decision

Classify every feature before assigning workers:

- `single-feature`: one feature; main agent can implement directly or create one worktree.
- `parallel-safe`: independent files/modules; can run in a feature worktree with one feature-worker.
- `parallel-with-contract`: can run in parallel only after the main agent defines the shared contract first.
- `serial-required`: must run after its dependency or after an earlier merge.
- `main-agent-only`: architecture, security, shared configuration, release, merge, or high-risk boundary work.

## Architecture and Contract Gate

- Shared interfaces, schemas, routes, CLI contracts, file formats, and permission boundaries are defined before worker assignment.
- Workers may not change shared contracts unless this plan grants ownership.
- OpenSpec is required project-owned context. Use root `openspec/changes/<change>/`, never `.harnesskit/openspec/`.

## Contract and Risk Verification

Default verification is contract-first and risk-based:

- `smoke`: syntax, generated-file presence, or one narrow command.
- `targeted`: tests or checks for the changed contract or user-visible behavior.
- `full`: cross-module, release-bound, browser-visible, security, data, or concurrency changes.
- `tdd`: use full TDD only for complex algorithms, state machines, regressions, or risk routing.

## Execution Plan

| Step | Owner | Action | Evidence |
| --- | --- | --- | --- |
| 1 | main-agent | Finalize feature inventory and classes | Updated table |
| 2 | main-agent | Define shared contracts before parallel work | Contract notes or spec |
| 3 | feature-worker/main-agent | Implement assigned feature scope | Commit SHA and changed files |
| 4 | reviewer/security-reviewer | Review as risk requires | Findings or not-applicable reason |
| 5 | main-agent | Merge completed features one by one | Merge commit and verification |

## Merge Order

List the final merge order. Merge one by one, verify after each merge, and keep
unmerged worktrees intact if a merge or verification fails.

1. TBD

## Final Evidence

- Per-feature changed files:
- Per-feature tests/checks:
- Merge order used:
- Final verification:
- Remaining risks:
PLAN
} > "$PLAN_FILE"

echo "feature plan created: $PLAN_FILE"
