#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  merge-feature-worktree.sh <repo-dir> <feature-id> [--base <branch>] [--worktree <dir>] [--skip-verify] [--remove-worktree]

Verifies one feature worktree, merges feature/<feature-id> into the base branch, and optionally removes the worktree.
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
WORKTREE_PATH=""
SKIP_VERIFY=0
REMOVE_WORKTREE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      [[ $# -ge 2 ]] || { echo "--base requires a value" >&2; exit 2; }
      BASE_BRANCH="$2"
      shift 2
      ;;
    --worktree)
      [[ $# -ge 2 ]] || { echo "--worktree requires a value" >&2; exit 2; }
      WORKTREE_PATH="$2"
      shift 2
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    --remove-worktree)
      REMOVE_WORKTREE=1
      shift
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
BRANCH_NAME="feature/$FEATURE_ID"

if [[ -z "$WORKTREE_PATH" ]]; then
  WORKTREE_PATH="$REPO_PARENT/${REPO_NAME}.worktrees/$FEATURE_ID"
fi

if [[ ! -d "$WORKTREE_PATH" ]]; then
  echo "Worktree path does not exist: $WORKTREE_PATH" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "Feature branch does not exist: $BRANCH_NAME" >&2
  exit 1
fi

COMMITS_AHEAD="$(git -C "$REPO_ROOT" rev-list --count "$BASE_BRANCH..$BRANCH_NAME")"
if [[ "$COMMITS_AHEAD" -eq 0 ]]; then
  echo "Feature branch has no commits beyond $BASE_BRANCH: $BRANCH_NAME" >&2
  exit 1
fi

if ! git -C "$WORKTREE_PATH" diff --quiet || ! git -C "$WORKTREE_PATH" diff --cached --quiet; then
  echo "Feature worktree has uncommitted changes: $WORKTREE_PATH" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
  echo "Base worktree has uncommitted changes: $REPO_ROOT" >&2
  exit 1
fi

VERIFY_STATUS="skipped"
if [[ "$SKIP_VERIFY" != "1" ]]; then
  if [[ ! -x "$WORKTREE_PATH/.harnesskit/scripts/verify.sh" ]]; then
    echo "Missing executable verification script: $WORKTREE_PATH/.harnesskit/scripts/verify.sh" >&2
    exit 1
  fi
  (cd "$WORKTREE_PATH" && ./.harnesskit/scripts/verify.sh)
  VERIFY_STATUS="passed"
fi

git -C "$REPO_ROOT" checkout "$BASE_BRANCH" >/dev/null
git -C "$REPO_ROOT" merge --no-ff "$BRANCH_NAME" -m "Merge $BRANCH_NAME" >/dev/null

if [[ "$REMOVE_WORKTREE" == "1" ]]; then
  git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH" >/dev/null
fi

cat <<EOF
feature done gate:
worktree_clean: yes
branch_has_commits: yes ($COMMITS_AHEAD)
feature_verification: $VERIFY_STATUS
self_check_required: see feature plan or worker handoff

merge gate:
base_worktree_clean: yes
main_agent_diff_review: required before merge
post_merge_verification: required before next merge

merged $BRANCH_NAME into $BASE_BRANCH
repo: $REPO_ROOT
worktree: $WORKTREE_PATH
removed_worktree: $REMOVE_WORKTREE
EOF
