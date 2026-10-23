#!/usr/bin/env bash
# Mycelium BRIX CLI preflight, Phase B part 2 (approved by Chris 23 Oct). Runs AS USER myc on fpd-prod, no sudo:
#     sudo -iu myc bash -s < ~/myc-part2.sh
# 1. Installs Codex CLI 0.164.0 for myc only with OpenAI's official standalone installer (user-level ~/.local/bin and
#    ~/.codex; the installer verifies the download's SHA-256). No Node, no sudo.
# 2. Self-tests that the myc-run guard refuses a set OPENAI_API_KEY.
# 3. Writes the acceptance-test harness ~/bin/myc-handoff (not run here).
# Does NOT sign in or call any model.
set -euo pipefail
[[ $(id -un) == myc && $(hostname) == fpd-prod ]] || { echo "STOP: run as myc on fpd-prod:  sudo -iu myc bash -s < ~/myc-part2.sh"; exit 1; }

echo "== Codex CLI 0.164.0 (official installer)"
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_RELEASE=0.164.0 CODEX_NON_INTERACTIVE=1 sh 2>&1 | tail -4
~/.local/bin/codex --version

echo; echo "== guard self-test"
if env OPENAI_API_KEY=test ~/bin/myc-run codex --version >/dev/null 2>&1; then echo "FAIL: guard did not refuse OPENAI_API_KEY"; exit 1; fi
echo "guard refuses a set OPENAI_API_KEY: ok"
~/bin/myc-run codex --version

echo; echo "== acceptance-test harness ~/bin/myc-handoff"
cat > ~/bin/myc-handoff <<'HARNESS'
#!/usr/bin/env bash
# Mycelium BRIX preflight acceptance test (approved 23 Oct): Codex (A) -> Claude (B) -> Codex (C), synthetic and harmless.
# At most 3 model calls, 180 s each, aborts on the first error. Subscription logins only (myc-run guard, cleared env).
# Codex: read-only sandbox, ephemeral, empty work folder. Claude: Sonnet, no tools, no MCP/connectors, no session saved.
# Everything is written to ~/preflight/run-<time>/. Kill switch: Ctrl-C, or from ct_admin:  sudo pkill -u myc
set -euo pipefail
G=~/bin/myc-run
R=~/preflight/run-$(date +%Y%m%d-%H%M%S); W=$R/work; mkdir -p "$W"
log() { printf '%s  %s\n' "$(date +%T)" "$*" | tee -a "$R/run.log"; }
die() { log "ABORT: $*"; exit 1; }
d12() { sha256sum "$1" | cut -c1-12; }
log "run folder $R"

# no-model checks: both CLIs must be on subscription logins, never API keys
$G claude auth status --json > "$R/claude-auth.json" 2>&1 || die "claude auth status failed"
jq -e '.loggedIn == true and .apiProvider == "firstParty" and (((.authMethod // "") | test("api.?key";"i")) | not)' \
  "$R/claude-auth.json" >/dev/null || die "Claude is not on a subscription login (see claude-auth.json)"
$G codex login status > "$R/codex-auth.txt" 2>&1 || die "codex login status failed (not signed in?)"
grep -qi chatgpt "$R/codex-auth.txt" || die "Codex is not signed in with ChatGPT (see codex-auth.txt)"
log "auth ok: Claude=$(jq -r .authMethod "$R/claude-auth.json"); Codex=$(head -1 "$R/codex-auth.txt")"

codex_call() {  # name promptfile
  local n=$1 p=$2 t0=$SECONDS rc=0
  timeout 180 "$G" codex exec --sandbox read-only --skip-git-repo-check --ephemeral --json -C "$W" -o "$R/$n.txt" - \
    < "$p" > "$R/$n.events.jsonl" 2> "$R/$n.err" || rc=$?
  [[ $rc -eq 0 ]] || die "$n (Codex) failed rc=$rc after $((SECONDS-t0))s; see $n.err"
  [[ -s $R/$n.txt ]] || die "$n (Codex) gave no answer"
  log "$n Codex ok in $((SECONDS-t0))s; usage $(grep -o '"usage":{[^}]*}' "$R/$n.events.jsonl" | tail -1 || true)"
}
claude_call() {  # name promptfile
  local n=$1 p=$2 t0=$SECONDS rc=0
  timeout 180 "$G" claude -p --model sonnet --tools "" --strict-mcp-config --no-session-persistence \
    --disable-slash-commands --output-format json < "$p" > "$R/$n.json" 2> "$R/$n.err" || rc=$?
  [[ $rc -eq 0 ]] || die "$n (Claude) failed rc=$rc after $((SECONDS-t0))s; see $n.err"
  jq -e '.is_error == false' "$R/$n.json" >/dev/null || die "$n (Claude) returned an error; see $n.json"
  jq -r .result "$R/$n.json" > "$R/$n.txt"; [[ -s $R/$n.txt ]] || die "$n (Claude) gave no answer"
  log "$n Claude ok in $((SECONDS-t0))s; models $(jq -r '(.modelUsage // {}) | keys | join(",")' "$R/$n.json"); usage $(jq -c '.usage | {input_tokens, output_tokens}' "$R/$n.json"); API-equivalent estimate \$$(jq -r '.total_cost_usd // "n/a"' "$R/$n.json") (not billed on a subscription)"
}

cat > "$R/A.prompt" <<'EOF'
This is a harmless synthetic test of an automated review hand-off between two AI tools. Do not run any commands or read any files.
In at most 120 words, list exactly three numbered risks of running an unattended two-AI review loop on a small home server, one line each.
Finish with a line containing only END-A
EOF
codex_call A "$R/A.prompt"; grep -q 'END-A' "$R/A.txt" || die "A is missing END-A"; DA=$(d12 "$R/A.txt")

{ cat <<EOF
Synthetic hand-off test, step B (review). Below is reviewer A's answer; its SHA-256 begins $DA. Do not use any tools.
In at most 150 words: for each of A's three risks write AGREE or DISAGREE with a one-line reason, then add one risk A missed.
Your first line must be exactly: RE $DA
Finish with a line containing only END-B
<<<A
EOF
cat "$R/A.txt"; echo "A>>>"; } > "$R/B.prompt"
claude_call B "$R/B.prompt"
grep -q "RE $DA" "$R/B.txt" && grep -q 'END-B' "$R/B.txt" || die "B does not cite A's digest or is missing END-B"
DB=$(d12 "$R/B.txt")

{ cat <<EOF
Synthetic hand-off test, step C (reconcile). Below are answer A (SHA-256 begins $DA) and reviewer B's response (SHA-256 begins $DB). Do not run any commands or read any files.
In at most 100 words, say which of B's points you ADOPT and which you REJECT, one line each with a reason.
Your first line must be exactly: RE $DA $DB
Finish with a line containing only END-C
<<<A
EOF
cat "$R/A.txt"; echo "A>>>"; echo "<<<B"; cat "$R/B.txt"; echo "B>>>"; } > "$R/C.prompt"
codex_call C "$R/C.prompt"
grep -q "RE $DA $DB" "$R/C.txt" && grep -q 'END-C' "$R/C.txt" || die "C does not cite both digests or is missing END-C"
DC=$(d12 "$R/C.txt")

[[ -z $(ls -A "$W") ]] && log "work folder still empty (nothing written by either tool)" || log "NOTE: work folder not empty: $(ls -A "$W" | head -5 | tr '\n' ' ')"
log "PASS: 3 calls, A($DA) -> B($DB) -> C($DC), ${SECONDS}s total, no human relay"
echo; for n in A B C; do echo "----- $n"; cat "$R/$n.txt"; done
HARNESS
chmod 755 ~/bin/myc-handoff
bash -n ~/bin/myc-handoff && echo "harness written: ~/bin/myc-handoff (not run)"
echo; echo "DONE on $(hostname) as $(id -un). Nothing signed in to Codex yet. Paste this output to Claude."
