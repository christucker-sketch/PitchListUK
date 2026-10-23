#!/usr/bin/env bash
# Offline tests for hubsync against a LOCAL bare repository (no GitHub, no network, no AI). Run anywhere:
#   bash test-hubsync.sh
# Covers: cold start, task processing, idempotence, changed task, foreign/invalid tasks, no loop on own commits,
# concurrent writer (push rejected -> re-fetch -> success, other writer's commit kept), persistent conflict (stops,
# never forces), pause, lost local state (no duplicates), daily cap.
set -uo pipefail
HS=$(cd "$(dirname "$0")" && pwd)/hubsync
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield
export HUBSYNC_HOME=$T/hs HUBSYNC_REMOTE=$T/remote.git HUBSYNC_BRANCH=$B HUBSYNC_RETRY_SLEEP="0 0" HUBSYNC_TEST=1
export GIT_AUTHOR_NAME=human GIT_AUTHOR_EMAIL=h@x GIT_COMMITTER_NAME=human GIT_COMMITTER_EMAIL=h@x

git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
cd "$T/human"; git checkout -q -b "$B"; mkdir -p team; echo hub > team/README.md; git add -A; git commit -qm init; git push -q origin "$B"
hpush() { (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$(dirname "$1")" && printf '%s\n' "$2" > "$1" && git add -A && git commit -qm "human: $1" && git push -q origin "$B"); }
task() { hpush "team/sync-test/tasks/$1.json" "{\"id\":\"$1\",\"to\":\"${2:-hubsync}\",\"body\":\"${3:-hello}\"}"; }
rcount() { git --git-dir="$T/remote.git" ls-tree -r --name-only "$B" -- team/sync-test/results | wc -l; }
ncommits() { git --git-dir="$T/remote.git" rev-list --count "$B"; }
run() { "$HS" poll > "$T/out" 2>&1; echo $?; }

echo "1. cold start, no tasks"
[[ $(run) == 0 ]] && grep -q 'cold start' "$T/out" && ok "cold start polls cleanly" || { bad "cold start"; cat "$T/out"; }
[[ $(run) == 0 ]] && grep -q 'no change' "$HUBSYNC_HOME/status.json" && ok "unchanged hub: no fetch, status 'no change'" || bad "no-change path"

echo "2. one synthetic task"
task T-0001
c0=$(ncommits); r=$(run)
[[ $r == 0 && $(rcount) == 1 && $(ncommits) == $((c0 + 1)) ]] && ok "result committed and pushed" || { bad "task processing"; cat "$T/out"; }
git --git-dir="$T/remote.git" show "$B:team/sync-test/results/T-0001.json" | jq -e '.task=="T-0001" and (.result|startswith("synthetic ack"))' >/dev/null \
  && ok "result content valid" || bad "result content"
grep -q 'human: team/sync-test/tasks/T-0001.json' "$T/out" && ok "hub change summarised in log" || bad "summary"

echo "2b. hub moves by many commits (log output is capped, no broken pipe)"
for i in $(seq 1 30); do hpush team/notes.md "note $i" >/dev/null; done
[[ $(run) == 0 ]] && grep -q '30 commit(s)' "$T/out" && ok "30-commit jump summarised without error" || { bad "big jump"; cat "$T/out"; }

echo "3. idempotence and no self-loop"
c1=$(ncommits); run >/dev/null; run >/dev/null
[[ $(ncommits) == "$c1" ]] && ok "repeat polls add nothing (own commit not re-processed)" || bad "duplicate commits"

echo "4. changed task is re-answered; foreign/invalid tasks ignored"
task T-0001 hubsync "changed body"; task T-0002 codex; hpush team/sync-test/tasks/T-0003.json '{"id":"T-9999","to":"hubsync"}'; hpush team/sync-test/tasks/T-0004.json 'not json'
c2=$(ncommits); run >/dev/null
[[ $(rcount) == 1 && $(ncommits) == $((c2 + 1)) ]] && ok "changed task answered again; codex/mismatched/invalid skipped" || { bad "changed/foreign tasks ($(rcount) results)"; cat "$T/out"; }

echo "5. concurrent writer: rejected push -> re-fetch -> success, other commit kept"
task T-0005
export HUBSYNC_TEST_BEFORE_PUSH="[ -e $T/once ] && exit 0; touch $T/once; cd $T/human && git pull -q --rebase origin $B && echo x >> team/README.md && git commit -qam 'human: concurrent edit' && git push -q origin $B"
r=$(run); unset HUBSYNC_TEST_BEFORE_PUSH
[[ $r == 0 ]] && grep -q 'push rejected' "$T/out" && git --git-dir="$T/remote.git" log --format=%s "$B" | grep 'concurrent edit' >/dev/null && [[ $(rcount) == 2 ]] \
  && ok "retried after rejection; concurrent human commit preserved; result pushed" || { bad "concurrent writer"; cat "$T/out"; }

echo "6. persistent conflict: stops after N attempts, never forces"
task T-0006
export HUBSYNC_TEST_BEFORE_PUSH="cd $T/human && git pull -q --rebase origin $B && date +%N >> team/README.md && git commit -qam 'human: busy' && git push -q origin $B"
before=$(git --git-dir="$T/remote.git" rev-parse "$B"); r=$(run); unset HUBSYNC_TEST_BEFORE_PUSH
after=$(git --git-dir="$T/remote.git" rev-parse "$B")
[[ $r != 0 ]] && grep -q 'still rejected' "$T/out" && git --git-dir="$T/remote.git" merge-base --is-ancestor "$before" "$after" \
  && jq -e '.last_result=="error"' "$HUBSYNC_HOME/status.json" >/dev/null && ok "stopped with error; remote history only moved forward" || { bad "persistent conflict"; cat "$T/out"; }
[[ $(run) == 0 && $(rcount) == 3 ]] && ok "next poll recovers and answers T-0006" || bad "recovery"

echo "7. pause / resume"
"$HS" pause >/dev/null; task T-0007; r=$(run)
[[ $r == 0 && $(rcount) == 3 ]] && grep -q paused "$T/out" && ok "paused: nothing processed" || bad "pause"
"$HS" resume >/dev/null; run >/dev/null; [[ $(rcount) == 4 ]] && ok "resumed: task answered" || bad "resume"

echo "8. lost local state (wiped home) -> no duplicate work"
rm -rf "$HUBSYNC_HOME"; c3=$(ncommits); run >/dev/null
[[ $(ncommits) == "$c3" && $(rcount) == 4 ]] && ok "cold restart re-derives done tasks from the repo" || { bad "state loss"; cat "$T/out"; }

echo "9. daily cap"
task T-0008; c4=$(ncommits)
r=$(HUBSYNC_MAX_COMMITS_DAY=0 "$HS" poll 2>&1); [[ $(ncommits) == "$c4" ]] && grep -q 'daily push cap' <<<"$r" && ok "cap blocks the push" || bad "daily cap"
run >/dev/null

echo "10. overlapping polls on one host"
task T-0009; ( flock 9; sleep 3 ) 9>"$HUBSYNC_HOME/lock" & sleep 0.5
r=$(run); wait; [[ $r == 0 ]] && grep -q 'still running' "$T/out" && [[ $(rcount) == 5 ]] && ok "second poll skips while the first holds the lock" || { bad "lock"; cat "$T/out"; }
run >/dev/null; [[ $(rcount) == 6 ]] && ok "task picked up by the next poll" || bad "after lock"

echo "11. test hook refused against github.com"
grep -q 'HUBSYNC_REMOTE != \*github.com\*' "$HS" && ok "test hook is ignored for a github.com remote" || bad "hook guard"

echo; echo "hubsync tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
