#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  create-feature-worktree.sh <repo-dir> <feature-id> [--base <branch>] [--agent <agent-name>] [--worktree-root <dir>]

Creates an isolated git worktree for one feature and prints the agent handoff.

Defaults:
  base branch: main
  agent: feature-worker
  worktree root: ../<repo-name>.worktrees
USAGE
}

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

REPO_DIR="$1"
FEATURE_ID="$2"
shift 2

BASE_BRANCH="main"
AGENT_NAME="feature-worker"
WORKTREE_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      [[ $# -ge 2 ]] || { echo "--base requires a value" >&2; exit 2; }
      BASE_BRANCH="$2"
      shift 2
      ;;
    --agent)
      [[ $# -ge 2 ]] || { echo "--agent requires a value" >&2; exit 2; }
      AGENT_NAME="$2"
      shift 2
      ;;
    --worktree-root)
      [[ $# -ge 2 ]] || { echo "--worktree-root requires a value" >&2; exit 2; }
      WORKTREE_ROOT="$2"
      shift 2
      ;;
    -h|--help)
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

case "$FEATURE_ID" in
  *[!a-zA-Z0-9._-]*|"")
    echo "Feature id must use letters, numbers, dot, underscore, or dash: $FEATURE_ID" >&2
    exit 2
    ;;
esac

if ! git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Repo dir is not a git work tree: $REPO_DIR" >&2
  exit 2
fi

REPO_ROOT="$(git -C "$REPO_DIR" rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
REPO_PARENT="$(dirname "$REPO_ROOT")"

if [[ -z "$WORKTREE_ROOT" ]]; then
  WORKTREE_ROOT="$REPO_PARENT/${REPO_NAME}.worktrees"
fi

BRANCH_NAME="feature/$FEATURE_ID"
WORKTREE_PATH="$WORKTREE_ROOT/$FEATURE_ID"

if [[ -e "$WORKTREE_PATH" ]]; then
  echo "Worktree path already exists: $WORKTREE_PATH" >&2
  exit 1
fi

if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "Feature branch already exists: $BRANCH_NAME" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
  echo "Base worktree has uncommitted changes: $REPO_ROOT" >&2
  exit 1
fi

mkdir -p "$WORKTREE_ROOT"
git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_BRANCH" >/dev/null

cat <<EOF
created feature worktree
feature: $FEATURE_ID
branch: $BRANCH_NAME
base: $BASE_BRANCH
path: $WORKTREE_PATH
agent: $AGENT_NAME

agent handoff:
- Work only in: $WORKTREE_PATH
- Keep ownership scoped to this feature.
- Commit feature changes on: $BRANCH_NAME
- Report changed files, tests run, risks, merge readiness, and commit SHA.
- Do not merge back to $BASE_BRANCH; the main agent owns integration.
EOF
