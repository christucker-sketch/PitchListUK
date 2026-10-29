#!/usr/bin/env bash
# Offline tests for myc-gate v3 local memory references (`memref: sha256:<digest>`), with the REAL myc-stageb, myc-gate and
# (unchanged) myc-agent, a LOCAL bare repo and FAKE CLIs. No network, no GitHub, no model calls, no root.   bash test-memref.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk sha256sum; do command -v $c >/dev/null || { echo "memref tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool" "$T/myc/bin" "$T/stub" "$T/ctl" "$T/mem/snapshots"; chmod 755 "$T/mem" "$T/mem/snapshots"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/myc/bin/myc-run"
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
echo call >> "$CTL/calls"; cat > "$CTL/prompt"
jq -n '{type:"result",is_error:false,result:"# answer\nok",usage:{input_tokens:5,output_tokens:20,cache_read_input_tokens:0},modelUsage:{"claude-sonnet-5-5":{}},total_cost_usd:0.01}'
EOF
chmod +x "$T/myc/bin/myc-run" "$T/stub/"*
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$D/myc-gate MYC_AGENT=$D/myc-agent \
  MYC_GUARD=$T/myc/bin/myc-run MYC_BILLING_CONFIRMED=yes MYC_ALLOW=$T/allowed MYC_MEMSNAP=$T/mem/snapshots MYC_MAX_CALLS=20
GATE=$D/myc-gate; STAGEB=$D/myc-stageb
mk_task() {  # id instructions
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg i "$2" --arg rl "$TD/$1/result.md" '{task_id:$t, assigned_agent:"claude", instructions:$i, status:"pending", result_location:$rl}' > "$TD/$1/task.json" \
   && jq -n '{seq:1, status:"pending", at:"2026-10-29T10:00:00Z", actor:"chris", reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B") 2>/dev/null
  echo "$1 claude $(git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json")" >> "$T/allowed"
}
snap() {  # content -> digest; installs <digest>.md 0644 into the store
  local f; f=$(mktemp "$T/s.XXXX"); printf '%s' "$1" > "$f"; local h; h=$(sha256sum "$f" | cut -c1-64)
  install -m 644 "$f" "$T/mem/snapshots/$h.md"; rm -f "$f"; echo "$h"; }
calls() { [[ -f $T/ctl/calls ]] && wc -l < "$T/ctl/calls" | tr -d " " || echo 0; }
st() { "$GATE" state "$1" 2>/dev/null | head -1; }
nev() { git --git-dir="$T/remote.git" ls-tree --name-only "$B" "$TD/$1/events/" 2>/dev/null | wc -l; }
run1() { : > "$T/allowed.tmp"; "$STAGEB" "$1" > "$T/out" 2>&1; }
refused_before_claim() {  # id what
  [[ $(calls) == "$c0" && $(nev "$1") == 1 ]] && grep -q "claim refused" "$T/out" && ok "$2: claim refused, no event, no call" || { bad "$2"; cat "$T/out"; }
}
TEXT=$'<<<MYCELIUM MEMORY: untrusted data\n[node 11111111-1111-4111-8111-111111111111] question: FindPitches verification\nend\n'
echo "1. a valid local snapshot is attached with its exact bytes; nothing of it enters Git"
H=$(snap "$TEXT")
mk_task MYC-20261029-101 $'Use the memory.\nmemref: sha256:'"$H"
c0=$(calls); run1 MYC-20261029-101
[[ $(st MYC-20261029-101) == *completed* && $(calls) == $((c0 + 1)) ]] && ok "claim -> admit -> one call -> completed" || { bad "valid memref run"; cat "$T/out"; }
R=$(ls "$T/spool" | grep '^MYC-20261029-101-'); J=$T/spool/$R/job.json
[[ $(jq -r '.refs[0].blob' "$J") == "sha256:$H" && $(jq -j '.refs[0].content' "$J" | sha256sum | cut -c1-64) == "$H" ]] && ok "job packet carries the snapshot byte-for-byte under its digest" || bad "job content"
grep -q 'FindPitches verification' "$T/ctl/prompt" && grep -q "mycelium-memory-snapshot" "$T/ctl/prompt" && ok "the unchanged myc-agent renders it as an untrusted reference" || bad "prompt"
! git --git-dir="$T/remote.git" log --all -p | grep -q 'FindPitches verification' && ok "the snapshot text is nowhere in Git history" || bad "snapshot leaked to git"
echo "2. refusals before any claim (fail closed)"
mk_task MYC-20261029-102 $'x\nmemref: sha256:'"$(printf '%064d' 0 | tr 0 a)"; c0=$(calls); run1 MYC-20261029-102; refused_before_claim MYC-20261029-102 "missing snapshot"
H2=$(snap "other text"); printf 'tampered' >> "$T/mem/snapshots/$H2.md"
mk_task MYC-20261029-103 $'x\nmemref: sha256:'"$H2"; c0=$(calls); run1 MYC-20261029-103; refused_before_claim MYC-20261029-103 "bytes differ from the pinned digest"
H3=$(snap "group writable"); chmod 664 "$T/mem/snapshots/$H3.md"
mk_task MYC-20261029-104 $'x\nmemref: sha256:'"$H3"; c0=$(calls); run1 MYC-20261029-104; refused_before_claim MYC-20261029-104 "group-writable snapshot"
H4=$(snap "via symlink"); mv "$T/mem/snapshots/$H4.md" "$T/real.md"; ln -s "$T/real.md" "$T/mem/snapshots/$H4.md"
mk_task MYC-20261029-105 $'x\nmemref: sha256:'"$H4"; c0=$(calls); run1 MYC-20261029-105; refused_before_claim MYC-20261029-105 "symlinked snapshot"
H5=$(snap "$(head -c 33000 /dev/zero | tr '\0' a)")
mk_task MYC-20261029-106 $'x\nmemref: sha256:'"$H5"; c0=$(calls); run1 MYC-20261029-106; refused_before_claim MYC-20261029-106 "snapshot over 32 KB"
H6=$(snap $'bell \a here')
mk_task MYC-20261029-107 $'x\nmemref: sha256:'"$H6"; c0=$(calls); run1 MYC-20261029-107; refused_before_claim MYC-20261029-107 "control bytes"
H7=$(snap "store folder writable"); chmod 777 "$T/mem/snapshots"
mk_task MYC-20261029-108 $'x\nmemref: sha256:'"$H7"; c0=$(calls); run1 MYC-20261029-108; refused_before_claim MYC-20261029-108 "world-writable store folder"; chmod 755 "$T/mem/snapshots"
(cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p greenfield/mycelium/x && echo a > greenfield/mycelium/x/a && echo b > greenfield/mycelium/x/b && git add -A && git commit -qm refs && git push -q origin "$B") 2>/dev/null
mk_task MYC-20261029-109 $'x\nmemref: sha256:'"$H"$'\nref: greenfield/mycelium/x/a\nref: greenfield/mycelium/x/b'
c0=$(calls); run1 MYC-20261029-109; [[ $(calls) == "$c0" && $(nev MYC-20261029-109) == 1 ]] && grep -q "more than 2 refs" "$T/out" && ok "memref counts towards the 2-reference limit" || { bad "ref limit"; cat "$T/out"; }
echo "3. the snapshot changes between claim and admit: not admitted, no call"
H8=$(snap "admit check")
mk_task MYC-20261029-110 $'x\nmemref: sha256:'"$H8"
c0=$(calls); RUN=$("$GATE" claim MYC-20261029-110 2>/dev/null); printf 'swap' >> "$T/mem/snapshots/$H8.md"
"$GATE" admit "$RUN" > "$T/out" 2>&1; rc=$?
[[ $rc != 0 && ! -e $T/spool/$RUN/job.json && ! -e $T/spool/$RUN/admitted ]] && grep -q "no longer present and intact" "$T/out" && [[ $(calls) == "$c0" ]] \
  && ok "admit re-verifies the digest and refuses the swapped file" || { bad "admit swap"; cat "$T/out"; }
"$GATE" complete "$RUN" >/dev/null 2>&1; [[ $(st MYC-20261029-110) == *failed* ]] && ok "the claim is recorded as failed (not admitted, no call)" || bad "record: $(st MYC-20261029-110)"
echo "4. a ref-only task is unchanged"
mk_task MYC-20261029-111 $'x\nref: greenfield/mycelium/x/a'
: > "$T/allowed.keep"; grep -v -e 103 -e 104 -e 105 -e 106 -e 107 -e 108 -e 110 "$T/allowed" > "$T/allowed.keep"; cp "$T/allowed.keep" "$T/allowed"
c0=$(calls); run1 MYC-20261029-111; [[ $(st MYC-20261029-111) == *completed* && $(calls) == $((c0 + 1)) ]] && ok "git-blob refs work exactly as before" || { bad "ref-only"; cat "$T/out"; }
echo; echo "memref tests: $pass passed, $failn failed (no model calls)"; [[ $failn == 0 ]]
