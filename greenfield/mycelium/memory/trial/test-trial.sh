#!/usr/bin/env bash
# Offline tests for mycelium-explorer-trial.sh: a local git repo, a fake npm and a fake live step; no users, no network,
# no Neon, no root.   bash trial/test-trial.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); S=$D/mycelium-explorer-trial.sh; PKGSRC=$(cd "$D/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
# a repo whose committed tree holds the memory package at greenfield/mycelium/memory
git init -q -b main "$T/repo"; mkdir -p "$T/repo/greenfield/mycelium"
mkdir -p "$T/repo/greenfield/mycelium/memory"
tar -C "$PKGSRC" --exclude=./node_modules --exclude=./.env.local --exclude=./.smoke -cf - . | tar -C "$T/repo/greenfield/mycelium/memory" -xf -
git -C "$T/repo" add -A; git -C "$T/repo" -c user.name=t -c user.email=t@x commit -qm pkg; C=$(git -C "$T/repo" rev-parse HEAD)
mkdir -p "$T/bin"
cat > "$T/bin/npm" <<'EOF'
#!/usr/bin/env bash
[[ $1 == --version ]] && { echo 10.9.0; exit 0; }
[[ $1 == ci ]] && { mkdir -p node_modules/@neondatabase/serverless; echo '{}' > node_modules/@neondatabase/serverless/package.json; exit 0; }
exit 1
EOF
cat > "$T/bin/live" <<'EOF'
#!/usr/bin/env bash
m=$1; echo "$m" >> "$CTL/calls"
[[ -f $CTL/slow_$m ]] && sleep 5
[[ -f $CTL/fail_$m ]] && { echo "refused" >&2; exit 1; }
case $m in
  footprint) if [[ ! -f $CTL/fp ]]; then touch "$CTL/fp"; echo '{"mode":"footprint","nodes_total":3,"edges_total":1,"assessments_total":0,"trial_nodes":0,"trial_edges":0,"trial_assessments":0}'
             else a=${EXTRA_A:-0}; echo "{\"mode\":\"footprint\",\"nodes_total\":9,\"edges_total\":7,\"assessments_total\":$((2 + a)),\"trial_nodes\":6,\"trial_edges\":6,\"trial_assessments\":$((2 + a))}"; fi ;;
  *) echo "{\"mode\":\"$m\",\"ok\":true}" ;;
esac
EOF
chmod +x "$T/bin/"*
fresh() {  # a new empty fake root
  rm -rf "$T/root" "$T/ctl"; mkdir -p "$T/root/home/ct_admin" "$T/root/tmp" "$T/ctl"
  export TRIAL_TEST=1 T_ROOT=$T/root T_REPO=$T/repo T_BRANCH=main T_LIVE=$T/bin/live CTL=$T/ctl TMPDIR=$T/root/tmp PATH="$T/bin:$PATH"
  unset T_DEADLINE T_STEP EXTRA_A
}
run() { bash "$S" "$@" > "$T/out" 2>&1; }
calls() { [[ -f $T/ctl/calls ]] && tr '\n' ' ' < "$T/ctl/calls"; }

echo "1. precheck is read-only and refuses when anything already exists"
fresh; run precheck && grep -q 'PRECHECK OK' "$T/out" && [[ -z $(ls -A "$T/root/home/ct_admin") ]] && ok "clean host: PRECHECK OK, nothing created" || { bad precheck; cat "$T/out"; }
for what in user pkg env ver; do
  fresh
  case $what in user) touch "$T/root/user-exists" ;; pkg) mkdir -p "$T/root/opt/mycelium-memory" ;;
    env) mkdir -p "$T/root/etc/mycelium"; echo x > "$T/root/etc/mycelium/explorer.env" ;; ver) echo x > "$T/root/home/ct_admin/mycelium-explorer.scram" ;; esac
  run precheck; r=$?; run setup "$C"; r2=$?
  [[ $r != 0 && $r2 != 0 ]] && grep -q 'STOP' "$T/out" && ok "existing $what: precheck and setup both refuse" || { bad "existing $what"; cat "$T/out"; }
done
[[ $(cat "$T/root/home/ct_admin/mycelium-explorer.scram") == x ]] && ok "the pre-existing file was left untouched" || bad "pre-existing file modified"

echo "2. setup: pinned commit only; package, credential and verifier with the right shape; password never printed"
fresh; run setup deadbeef; grep -q '40-character' "$T/out" && ok "short commit refused" || bad "short commit"
run setup 0000000000000000000000000000000000000000; grep -q 'not in the HubSync clone' "$T/out" && [[ ! -e $T/root/user-exists ]] && ok "unknown commit refused before any change" || { bad "unknown commit"; cat "$T/out"; }
run setup "$C"; r=$?
E=$T/root/etc/mycelium/explorer.env V=$T/root/home/ct_admin/mycelium-explorer.scram
pw=$(sed -n 's#^MYCELIUM_DATABASE_URL=postgresql://mycelium_explorer_fpd:\([0-9a-f]*\)@.*#\1#p' "$E" 2>/dev/null)
[[ $r == 0 && ${#pw} == 48 ]] && grep -qx 'MYCELIUM_DATABASE_HOST=ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech' "$E" \
  && grep -q 'sslmode=require' "$E" && [[ $(stat -c %a "$E") == 640 ]] && ok "credential: 48-hex password in the URL, pinned host, TLS, mode 0640" || { bad "credential"; cat "$T/out"; }
grep -qE '^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$' "$V" && [[ $(stat -c %a "$V") == 600 ]] && ok "verifier: valid SCRAM format, mode 0600" || bad "verifier"
(cd "$T/root/opt/mycelium-memory" && node --input-type=module -e "
  import { deriveKeys } from './scripts/scram-verifier.mjs';
  const [, it, rest] = process.argv[1].match(/^SCRAM-SHA-256\\\$(\d+):(.*)\$/); const [salt, keys] = rest.split('\$'); const [sk, svk] = keys.split(':');
  const k = deriveKeys(process.argv[2], Buffer.from(salt, 'base64'), Number(it));
  process.exit(k.storedKey.toString('base64') === sk && k.serverKey.toString('base64') === svk ? 0 : 1);" "$(cat "$V")" "$pw") \
  && ok "the verifier matches the stored password (the database will accept that login)" || bad "verifier does not match password"
! grep -rq "$pw" "$T/out" "$T/root/trial.log" && [[ -z $(ls -A "$T/root/tmp") ]] && ok "password never printed or logged; temporary password file shredded" || bad "password leak"
[[ -f $T/root/opt/mycelium-memory/.created-by-mycelium-explorer-trial && -f $T/root/opt/mycelium-memory/scripts/explorer-live.mjs && -d $T/root/opt/mycelium-memory/node_modules/@neondatabase ]] \
  && [[ ! -e $T/root/opt/mycelium-memory/.npm-cache ]] && ok "package extracted at the pinned commit with markers; dependencies installed; cache removed" || bad "package"
run setup "$C"; grep -q 'already exists' "$T/out" && ok "second setup refuses (no overwrite)" || bad "setup rerun"

echo "3. run: fixed order, fresh step per mode, exact footprint, verifier removed; deadline and failures stop with no retry"
run run; r=$?
[[ $r == 0 && $(calls) == "whoami footprint A B check footprint " ]] && grep -q 'footprint delta nodes=6 edges=6 assessments=2' "$T/out" && grep -q 'RUN OK' "$T/out" \
  && [[ ! -e $V ]] && ok "all six steps in order; delta exactly 6/6/2; fpd-prod verifier copy shredded" || { bad "run"; cat "$T/out"; }
rm -f "$T/ctl/calls" "$T/ctl/fp"; EXTRA_A=1 run run; [[ $? != 0 ]] && grep -q 'not exactly 6/6/2' "$T/out" && ok "a wrong footprint is a STOP" || { bad "footprint check"; cat "$T/out"; }
unset EXTRA_A; rm -f "$T/ctl/calls" "$T/ctl/fp"; touch "$T/ctl/fail_B"; run run
[[ $? != 0 && $(calls) == "whoami footprint A B " ]] && grep -q "'B' failed" "$T/out" && ok "B fails: STOP immediately, check never runs, nothing retried" || { bad "fail stop"; cat "$T/out"; }
rm -f "$T/ctl/fail_B" "$T/ctl/calls" "$T/ctl/fp"; touch "$T/ctl/slow_A"; T_DEADLINE=3 T_STEP=90 run run
[[ $? != 0 && $(calls) == "whoami footprint A " ]] && grep -qE "'A' failed or timed out|deadline" "$T/out" && ok "overall deadline: the slow step is killed and the trial stops" || { bad "deadline"; cat "$T/out"; }
rm -f "$T/ctl/slow_A"

echo "4. close and teardown remove only what this trial created"
run close; [[ $? == 0 && ! -e $E ]] && grep -q 'CLOSE OK' "$T/out" && ok "close shreds the credential" || { bad close; cat "$T/out"; }
run close; [[ $? == 0 ]] && ok "close is safe to repeat" || bad "close repeat"
run run; grep -q 'no credential' "$T/out" && ok "run refuses after close" || bad "run after close"
mkdir -p "$T/root/opt"; echo keep > "$T/root/opt/unrelated"; run teardown
[[ $? == 0 && ! -e $T/root/opt/mycelium-memory && ! -e $T/root/user-exists && -f $T/root/opt/unrelated ]] && ok "teardown removes the trial's package and user only" || { bad teardown; cat "$T/out"; }
fresh; mkdir -p "$T/root/opt/mycelium-memory"; echo mine > "$T/root/opt/mycelium-memory/file"; touch "$T/root/user-exists"; mkdir -p "$T/root/var/lib/mycmem"
run teardown; [[ -f $T/root/opt/mycelium-memory/file && -f $T/root/user-exists ]] && ok "unmarked user and directory are never removed" || bad "unmarked removed"
fresh; mkdir -p "$T/root/etc/mycelium"; echo x > "$T/root/etc/mycelium/explorer.env"; run teardown; grep -q 'run close first' "$T/out" && ok "teardown refuses while a credential exists" || bad "teardown with credential"

echo; echo "explorer trial tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
