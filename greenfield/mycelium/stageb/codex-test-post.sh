#!/usr/bin/env bash
# Red regressions for the trusted/sandbox filesystem boundary. Temporary canaries
# ONLY; MYC_TEST=1; no root, credentials, network, models, systemd or real host state.
# Run from anywhere: bash greenfield/mycelium/stageb/codex-test-post.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); SRC=$D/../brain/workbench
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=$((fails+1)); }

# apply.mjs's lexical namespace must not let an in-namespace link reach outside.
mkdir -p "$T/apply/tree/mechanisms" "$T/apply/outside"
printf 'CANARY_UNCHANGED\n' > "$T/apply/outside/source.js"
ln -s "$T/apply/outside/source.js" "$T/apply/tree/mechanisms/codex-canary.js"
printf '```mycelium-file path=mechanisms/codex-canary.js\nreplacement\n```\n' > "$T/apply/answer.md"
node "$SRC/post/apply.mjs" apply "$T/apply/answer.md" codex "$T/apply/tree" > "$T/apply/log" 2>&1 || true
grep -qx CANARY_UNCHANGED "$T/apply/outside/source.js" && ok 'C-07 artifact apply refuses destination symlinks' || bad 'C-07 artifact apply followed a destination symlink'

cat > "$T/sandbox-stub" <<'SH'
#!/usr/bin/env bash
# This substitutes the untrusted side's OUTPUTS; it is not a security sandbox test.
set -eu
if [[ ${2:-} == */evaluate.mjs ]]; then
  W=$(dirname "$2")
  printf '{"cases":{},"failures":[],"truncated":false}\n' > "$W/.board.json"
  if [[ $CODEX_PROBE == board ]]; then ln -sf "$CODEX_CANARY" "$W/.board.md"
  else printf 'empty board\n' > "$W/.board.md"; ln -sf "$CODEX_CANARY" "$W/.cache.json"; fi
  exit 0
elif [[ ${2:-} == --test ]]; then printf 'TAP version 13\n1..0\n'; exit 0
else exec "$@"; fi
SH
chmod +x "$T/sandbox-stub"
for probe in board cache; do
  R=$T/$probe; WB=$R/wb/probe-run; RUN=MYC-20261031-901-r1793400000-0a1b2c3d
  mkdir -p "$WB/tree/post" "$WB/turns" "$R/spool/$RUN/out"
  cp "$SRC/post/apply.mjs" "$WB/tree/post/apply.mjs"; cp "$SRC/world.mjs" "$WB/tree/world.mjs"
  printf '// stub evaluator path\n' > "$WB/tree/evaluate.mjs"
  printf '{"agent":"codex","task_id":"MYC-20261031-901"}\n' > "$R/spool/$RUN/job.json"
  printf 'A harmless answer.\n' > "$R/spool/$RUN/out/result.md"
  if [[ $probe == board ]]; then printf 'CANARY_OUTSIDE_SANDBOX\n' > "$R/canary"
  else printf '{"CANARY_FORGED_CACHE":{"verified":99999}}\n' > "$R/canary"; fi
  MYC_TEST=1 MYC_SPOOL="$R/spool" MYC_WB_ROOT="$R/wb" MYC_POST_BATCH=probe-run \
    T_SANDBOX="$T/sandbox-stub" CODEX_PROBE="$probe" CODEX_CANARY="$R/canary" \
    bash "$D/myc-post" "$RUN" > "$R/log" 2>&1 || true
  if [[ $probe == board ]]; then
    if grep -q CANARY_OUTSIDE_SANDBOX "$R/spool/$RUN/out/result.md"; then bad 'C-08 myc-post followed sandbox board.md symlink into a parent-readable canary'; else ok 'C-08 sandbox board symlink refused'; fi
  else
    if [[ -f $WB/cache.json ]] && grep -q CANARY_FORGED_CACHE "$WB/cache.json"; then bad 'C-09 myc-post adopted a sandbox cache symlink'; else ok 'C-09 sandbox cache symlink refused'; fi
  fi
done
echo "Codex post boundary regressions: $fails failure(s)"
[[ $fails == 0 ]]
