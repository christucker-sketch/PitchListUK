#!/usr/bin/env bash
set -euo pipefail

# Push a narrow agent/hub update without disturbing the caller's working tree.
# Usage:
#   team/tools/hub-sync.sh "Claude checkpoint" team/agents/CLAUDE.md team/TASKS.md docs/example.md
#
# Requirements:
#   - git network access to the repository
#   - existing GitHub authentication (credential helper, gh auth, or GITHUB_TOKEN-backed git config)
#   - paths must already exist in the caller's checkout

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <commit-message> <path> [path ...]" >&2
  exit 64
fi

MESSAGE="$1"
shift

BRANCH="findpitches-v3/greenfield"
ROOT="$(git rev-parse --show-toplevel)"
REMOTE_URL="$(git -C "$ROOT" remote get-url origin)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/findpitches-hub-sync.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

for p in "$@"; do
  if [ ! -e "$ROOT/$p" ]; then
    echo "missing path: $p" >&2
    exit 66
  fi
done

git clone --quiet --single-branch --branch "$BRANCH" "$REMOTE_URL" "$TMP/repo"

for p in "$@"; do
  mkdir -p "$TMP/repo/$(dirname "$p")"
  cp -a "$ROOT/$p" "$TMP/repo/$p"
done

cd "$TMP/repo"
git add -- "$@"

if git diff --cached --quiet; then
  echo "hub-sync: nothing changed"
  exit 0
fi

git commit --quiet -m "$MESSAGE"
git push --quiet origin "$BRANCH"
SHA="$(git rev-parse HEAD)"
echo "hub-sync: pushed $SHA"
