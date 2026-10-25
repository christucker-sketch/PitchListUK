#!/usr/bin/env bash
# Codex independent Stage B regression review. LOCAL temporary bare Git + FAKE CLIs only.
# Known failures on bundle 8d56af1e: this exits nonzero until the reviewed safeguards are fixed.
# No real GitHub, real credentials, native inference, root, host install or production paths.
# No network, no GitHub, no model calls, no root.   bash test-stageb.sh
set -uo pipefail
for c in git jq flock iconv dd; do command -v $c >/dev/null || { echo "stage B tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B")
mkdir -p "$T/hs" "$T/spool" "$T/myc/bin" "$T/stub" "$T/ctl"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
# fake guard + fake CLIs (behaviour from $T/ctl)
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/myc/bin/myc-run"
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
[[ -f $CTL/codex_fail ]] && { echo "boom" >&2; exit 1; }
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
p=$(cat); printf '# Codex review\n1. risk one\n2. risk two\nsaw-instructions: %s\n' "$(grep -c 'Task' <<<"$p")" > "$out"
[[ -f $CTL/codex_secret ]] && echo "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123" >> "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":14000,"cached_input_tokens":12000,"output_tokens":90}}'
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
printf '%s\n' "$@" > $CTL/claude_argv
p=$(cat); ref=$(grep -A2 '^## Reference: ' <<<"$p" | sed -n 3p)
jq -n --arg r "# Claude review
agree with: $ref" '{type:"result",is_error:false,result:$r,usage:{input_tokens:5,output_tokens:200,cache_read_input_tokens:0},modelUsage:{"claude-sonnet-5-5":{}},total_cost_usd:0.01}'
EOF
chmod +x "$T/myc/bin/myc-run" "$T/stub/"*
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$D/myc-gate MYC_AGENT=$D/myc-agent \
  MYC_GUARD=$T/myc/bin/myc-run MYC_BILLING_CONFIRMED=yes MYC_ALLOW=$T/allowed
: > "$T/allowed"
GATE=$D/myc-gate; STAGEB=$D/myc-stageb

mk_task() {  # id agent instructions [jq-filter applied to task.json] [actor of event 1]
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg a "$2" --arg i "$3" --arg rl "$TD/$1/result.md" \
        '{task_id:$t, assigned_agent:$a, instructions:$i, status:"pending", result_location:$rl}' | jq "${4:-.}" > "$TD/$1/task.json" \
   && jq -n --arg who "${5:-chris}" '{seq:1, status:"pending", at:"2026-10-25T10:00:00Z", actor:$who, reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B")
}
allow() { echo "$1 $2 $(git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json")" >> "$T/allowed"; }
remote_has() { git --git-dir="$T/remote.git" cat-file -e "$B:$1" 2>/dev/null; }
remote_cat() { git --git-dir="$T/remote.git" show "$B:$1"; }
st() { "$GATE" state "$1" 2>/dev/null; }
reset_caps() { rm -f "$MYC_STATE"; }


# All remote writes below target the mktemp bare repo and all inference uses the original fake CLIs.
echo 'REVIEW A: duplicate key with different value shapes'
mk_task MYC-20261025-101 codex x
(cd "$T/human" && git pull -q --rebase origin "$B" && printf '{"task_id":"MYC-20261025-101","assigned_agent":"codex","instructions":{"ignored":1},"instructions":"x","status":"pending","result_location":"%s/MYC-20261025-101/result.md"}\n' "$TD" > "$TD/MYC-20261025-101/task.json" && git commit -qam duplicate-shape && git push -q origin "$B")
s=$(st MYC-20261025-101)
[[ $s == *QUARANTINE* ]] && ok 'duplicate container/scalar keys quarantined' || bad 'duplicate container/scalar key accepted'

echo 'REVIEW B: missing local state forgets elapsed stage window'
mk_task MYC-20261025-102 codex x
mk_task MYC-20261025-103 claude $'Read result\nref: greenfield/mycelium/tasks/MYC-20261025-102/result.md'
allow MYC-20261025-102 codex; allow MYC-20261025-103 claude
reset_caps
"$STAGEB" MYC-20261025-102 > "$T/b1" 2>&1
sleep 1
MYC_WINDOW_S=0 "$STAGEB" MYC-20261025-103 > "$T/b2" 2>&1
[[ $? != 0 ]] && grep -q 'window has passed' "$T/b2" && ok 'elapsed short window held with local state' || bad 'elapsed short window did not hold'
reset_caps
MYC_WINDOW_S=0 "$STAGEB" MYC-20261025-103 > "$T/b3" 2>&1
[[ $(st MYC-20261025-103) != *' completed '* ]] && ok 'elapsed grant remains held after local state loss' || bad 'local state loss replenished elapsed grant'

echo 'REVIEW C: failure metadata can publish a credential-shaped marker'
mk_task MYC-20261025-104 codex x; allow MYC-20261025-104 codex
run=$("$GATE" claim MYC-20261025-104 2>/dev/null)
# Entirely synthetic marker; never a real credential.
jq -n '{ok:false,agent:"codex",error:("ghp_"+("A"*30))}' > "$T/spool/$run/out/meta.json"
"$GATE" complete "$run" > "$T/c" 2>&1
if remote_cat "$TD/MYC-20261025-104/events/0003.json" | jq -e '.reason | contains("ghp_")' >/dev/null; then bad 'synthetic credential-shaped error published'; else ok 'unsafe error kept out of public receipt'; fi

echo 'REVIEW D: duplicate native agent processes for one committed claim'
mk_task MYC-20261025-105 codex x
# [adapted by Claude for the v2 interface, 25 Oct: a fresh grant per scenario (the budget is now durable across scenarios
#  by design) and the new claim -> admit step before any runner; the concurrency intent is unchanged]
: > "$T/allowed"; allow MYC-20261025-105 codex
run=$("$GATE" claim MYC-20261025-105 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1
cp "$T/stub/codex" "$T/stub/codex-original"
python3 - "$T/stub/codex" <<'PY2'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text().replace('[[ $1 == login ]] && {','[[ $1 == login ]] && { sleep 1;')
s=s.replace('out=""; prev="";', 'echo call >> "$CTL/review-calls"\nout=""; prev="";')
p.write_text(s)
PY2
: > "$T/ctl/review-calls"
HOME=$T/myc "$D/myc-agent" "$run" > "$T/d1" 2>&1 & p1=$!
HOME=$T/myc "$D/myc-agent" "$run" > "$T/d2" 2>&1 & p2=$!
wait "$p1"; wait "$p2"
n=$(wc -l < "$T/ctl/review-calls"); [[ $n -le 1 ]] && ok "one invocation per claim" || bad "two concurrent runners made $n fake invocations for one claim"
mv "$T/stub/codex-original" "$T/stub/codex"

echo 'REVIEW E: accepted claim followed by cancellation before remote reread'
mk_task MYC-20261025-106 codex x; : > "$T/allowed"; allow MYC-20261025-106 codex   # [adapted by Claude: fresh grant]
export REVIEW_T=$T REVIEW_TD=$TD REVIEW_BRANCH=$B
cat > "$T/stub/git" <<'GITWRAP'
#!/usr/bin/env bash
/usr/bin/git "$@"; rc=$?
if [[ $rc == 0 && ${1:-} == -C && ${2:-} == "$MYC_HOME/repo" && ${3:-} == push && ! -f $REVIEW_T/cancel-once ]]; then
  touch "$REVIEW_T/cancel-once"
  /usr/bin/git -C "$REVIEW_T/human" pull -q --ff-only origin "$REVIEW_BRANCH" > "$REVIEW_T/cancel.log" 2>&1
  printf '{"seq":3,"status":"cancelled","at":"2026-10-25T00:00:00Z","actor":"chris"}\n' > "$REVIEW_T/human/$REVIEW_TD/MYC-20261025-106/events/0003.json"
  /usr/bin/git -C "$REVIEW_T/human" add -A
  /usr/bin/git -C "$REVIEW_T/human" commit -qm cancel-after-claim
  /usr/bin/git -C "$REVIEW_T/human" push -q origin "$REVIEW_BRANCH" >> "$REVIEW_T/cancel.log" 2>&1
fi
exit "$rc"
GITWRAP
chmod +x "$T/stub/git"
reset_caps
"$STAGEB" MYC-20261025-106 > "$T/e" 2>&1
if [[ $(jq '.calls' "$MYC_STATE") == 1 && -n $(find "$T/spool" -path '*106*/out/result.md' -print -quit) ]]; then bad 'fake invocation started after remote cancellation'; else ok 'remote cancellation prevents invocation'; fi
echo "task_after_cancel=$(st MYC-20261025-106 | cut -c1-80)"

echo 'REVIEW F: a child ignoring TERM cannot outlive the per-call cap'
mk_task MYC-20261025-107 codex x
: > "$T/allowed"; allow MYC-20261025-107 codex   # [adapted by Claude for v2: fresh grant + admit; intent unchanged]
run=$("$GATE" claim MYC-20261025-107 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1
python3 - "$T/stub/codex" <<'PY3'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text().replace('out=""; prev="";', 'trap "" TERM\nsleep 3\nout=""; prev="";');p.write_text(s)
PY3
MYC_CALL_TIMEOUT=1 HOME=$T/myc timeout -s KILL 6 "$D/myc-agent" "$run" > "$T/f" 2>&1
secs=$(jq -r '.seconds // 999' "$T/spool/$run/out/meta.json" 2>/dev/null || echo 999)
[[ $secs -le 2 ]] && ok 'TERM-resistant fake child bounded' || bad "TERM-resistant fake child outlived scaled one-second cap (${secs}s)"
echo "review regressions: $pass passed, $failn failed (all inference was fake)"
[[ $failn == 0 ]]
