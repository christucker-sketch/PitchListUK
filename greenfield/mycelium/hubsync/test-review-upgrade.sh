#!/usr/bin/env bash
# Codex regression: upgrade a real old capped state, using temporary LOCAL Git only.
# No GitHub/network, host command, credentials or inference. Known failure on93941d00.
# Review-only: requires local history for the pinned old source, not a transferred runtime bundle.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
SOURCE_REPO=$(git -C "$D" rev-parse --show-toplevel)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
B=findpitches-v3/greenfield
export HUBSYNC_HOME=$T/hs HUBSYNC_REMOTE=$T/remote.git HUBSYNC_BRANCH=$B
export HUBSYNC_RETRY_SLEEP="0 0" HUBSYNC_TEST=1 HUBSYNC_MAX_TASKS=1
export GIT_AUTHOR_NAME=human GIT_AUTHOR_EMAIL=h@x GIT_COMMITTER_NAME=human GIT_COMMITTER_EMAIL=h@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(
  cd "$T/human"; git checkout -q -b "$B"
  mkdir -p team/sync-test/tasks
  for id in T-UPGRADE1 T-UPGRADE2 T-UPGRADE3; do
    jq -n --arg id "$id" '{id:$id,to:"hubsync",body:"local upgrade fixture"}' > "team/sync-test/tasks/$id.json"
  done
  git add -A; git commit -qm 'human: local upgrade fixture'; git push -q origin "$B"
)
git -C "$SOURCE_REPO" show e5887c96:greenfield/mycelium/hubsync/hubsync > "$T/hubsync-old"
chmod +x "$T/hubsync-old"
results() { git --git-dir="$T/remote.git" ls-tree -r --name-only "$B" -- team/sync-test/results | wc -l; }
"$T/hubsync-old" poll > "$T/old.log" 2>&1
[[ $(results) == 1 ]] || { echo 'ERROR: old capped-state fixture failed'; exit 2; }
[[ $(jq 'has("backlog")' "$HUBSYNC_HOME/state.json") == false ]] \
  || { echo 'ERROR: fixture unexpectedly contains the new backlog field'; exit 2; }

# No new remote commit or state deletion: only the script changes, exactly as at upgrade.
"$D/hubsync" poll > "$T/new.log" 2>&1
if [[ $(results) == 2 ]]; then
  echo 'PASS: first upgraded poll resumes existing capped backlog'
else
  printf 'FAIL: first upgraded poll leaves %s/3 results and reports:\n' "$(results)"
  jq '{last_result,message}' "$HUBSYNC_HOME/status.json"
  exit 1
fi
"$D/hubsync" poll > "$T/drain.log" 2>&1
[[ $(results) == 3 ]] || { echo 'FAIL: later poll did not drain migrated backlog'; exit 1; }
"$D/hubsync" poll > "$T/unchanged.log" 2>&1
jq -e '.message | startswith("no change")' "$HUBSYNC_HOME/status.json" >/dev/null
echo 'PASS: migrated backlog drains, then normal no-change optimization resumes'
