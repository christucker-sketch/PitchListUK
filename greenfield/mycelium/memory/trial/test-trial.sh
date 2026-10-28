#!/usr/bin/env bash
# Offline tests for mycelium-explorer-trial.sh: a local git repo, a fake npm and a fake live step; users/groups are files;
# no network, no Neon, no root.   bash trial/test-trial.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); S=$D/mycelium-explorer-trial.sh; PKGSRC=$(cd "$D/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
git init -q -b main "$T/repo"; mkdir -p "$T/repo/greenfield/mycelium/memory"
tar -C "$PKGSRC" --exclude=./node_modules --exclude=./.env.local --exclude=./.smoke -cf - . | tar -C "$T/repo/greenfield/mycelium/memory" -xf -
git -C "$T/repo" add -A; git -C "$T/repo" -c user.name=t -c user.email=t@x commit -qm pkg; C=$(git -C "$T/repo" rev-parse HEAD)
mkdir -p "$T/bin"
cat > "$T/bin/npm" <<'EOF'
#!/usr/bin/env bash
[[ $1 == --version ]] && { echo 10.9.0; exit 0; }
[[ $1 == ci ]] && { [[ -f $CTL/npm_fail ]] && exit 1; mkdir -p node_modules/@neondatabase/serverless; echo '{}' > node_modules/@neondatabase/serverless/package.json; exit 0; }
exit 1
EOF
cat > "$T/bin/live" <<'EOF'
#!/usr/bin/env bash
m=$1; echo "$m" >> "$CTL/calls"
[[ -f $CTL/stubborn_$m ]] && { trap '' TERM; sleep 30; }     # ignores TERM: only the KILL ends it
[[ -f $CTL/fail_$m ]] && { echo "refused" >&2; exit 1; }
case $m in
  footprint) if [[ ! -f $CTL/fp ]]; then touch "$CTL/fp"; echo '{"mode":"footprint","nodes_total":3,"edges_total":1,"assessments_total":0,"trial_nodes":0,"trial_edges":0,"trial_assessments":0}'
             else a=${EXTRA_A:-0}; echo "{\"mode\":\"footprint\",\"nodes_total\":9,\"edges_total\":7,\"assessments_total\":$((2 + a)),\"trial_nodes\":6,\"trial_edges\":6,\"trial_assessments\":$((2 + a))}"; fi ;;
  *) echo "{\"mode\":\"$m\",\"ok\":true}" ;;
esac
EOF
chmod +x "$T/bin/"*
R=$T/root
fresh() {
  rm -rf "$R" "$T/ctl"; mkdir -p "$R/home/ct_admin" "$R/opt" "$R/etc" "$R/var/lib" "$R/root" "$R/users" "$R/groups" "$T/ctl"
  export TRIAL_TEST=1 T_ROOT=$R T_REPO=$T/repo T_BRANCH=main T_LIVE=$T/bin/live CTL=$T/ctl PATH="$T/bin:$PATH"
  unset T_DEADLINE T_STEP T_GRACE EXTRA_A
}
run() { bash "$S" "$@" > "$T/out" 2>&1; }
calls() { [[ -f $T/ctl/calls ]] && tr '\n' ' ' < "$T/ctl/calls"; }
# Directory allocation size can change when the intentional archive is added; compare directory modes/paths,
# regular-file byte sizes/content and symlink targets, not filesystem-dependent directory st_size.
snap() { (cd "$R" && { find . -type d -printf '%p d %m - %l\n'; find . ! -type d -printf '%p %y %m %s %l\n'; } | sort; find . -type f -exec sha256sum {} + | sort) 2>/dev/null; }
E=$R/etc/mycelium/explorer.env V=$R/home/ct_admin/mycelium-explorer.scram RC=$R/var/lib/mycelium-explorer-trial

echo "1. pre-existing paths are refused by precheck AND setup, and the always-run close/teardown then change NOTHING (R3a/R3b)"
for what in env etcdir verifier verifier_symlink dangling_symlink etc_symlink pkg receiptdir user group; do
  fresh
  case $what in
    env)              mkdir -m 0711 "$R/etc/mycelium"; echo unrelated > "$R/etc/mycelium/explorer.env" ;;
    etcdir)           mkdir -m 0711 "$R/etc/mycelium"; echo other > "$R/etc/mycelium/other.conf" ;;
    verifier)         echo unrelated > "$V" ;;
    verifier_symlink) echo target > "$R/home/ct_admin/real"; ln -s real "$V" ;;
    dangling_symlink) ln -s /nonexistent/x "$V" ;;
    etc_symlink)      mkdir "$R/elsewhere"; ln -s ../elsewhere "$R/etc/mycelium" ;;
    pkg)              mkdir -p "$R/opt/mycelium-memory"; echo mine > "$R/opt/mycelium-memory/file" ;;
    receiptdir)       mkdir -p "$RC"; printf 'not ours\nfile %s\n' "$E" > "$RC/created" ;;
    user)             touch "$R/users/mycmem" ;;
    group)            touch "$R/groups/mycmem" ;;
  esac
  before=$(snap); run precheck; r1=$?; run setup "$C"; r2=$?
  run close; r3=$?; run teardown; r4=$?
  after=$(snap)
  if [[ $r1 != 0 && $r2 != 0 && $r3 == 0 && $r4 == 0 && $before == "$after" ]]; then ok "existing $what: refused; close+teardown exit 0 and every path, mode and byte is unchanged"
  else bad "existing $what (precheck=$r1 setup=$r2 close=$r3 teardown=$r4)"; diff <(echo "$before") <(echo "$after") | head; cat "$T/out"; fi
done

echo "2. setup: exclusive creation with receipts; pinned commit; credential/verifier shape; password never printed"
fresh; run setup deadbeef; grep -q '40-character' "$T/out" && ok "short commit refused" || bad "short commit"
before=$(snap); run setup 0000000000000000000000000000000000000000; [[ $(snap) == "$before" ]] && grep -q 'not in the HubSync clone' "$T/out" && ok "unknown commit refused before any change" || { bad "unknown commit"; cat "$T/out"; }
run setup "$C"; r=$?
pw=$(sed -n 's#^MYCELIUM_DATABASE_URL=postgresql://mycelium_explorer_fpd:\([0-9a-f]*\)@.*#\1#p' "$E" 2>/dev/null)
[[ $r == 0 && ${#pw} == 48 && $(stat -c %a "$E") == 640 && $(stat -c %a "$R/etc/mycelium") == 750 ]] && grep -q 'sslmode=require' "$E" \
  && ok "credential: 48-hex password, pinned host, TLS, 0640 in a newly created 0750 directory" || { bad "credential"; cat "$T/out"; }
[[ $(grep -v -e '^commit ' -e '^mycelium-explorer-trial receipt v1$' "$RC/created" | tr '\n' ';') == "user mycmem;dir $R/opt/mycelium-memory;dir $R/etc/mycelium;file $E;file $V;" && $(stat -c %a "$RC") == 700 ]] \
  && ok "receipt (root-only 0700) records exactly the five artifacts created, in order" || { bad receipt; cat "$RC/created"; }
grep -qE '^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$' "$V" && [[ $(stat -c %a "$V") == 600 ]] && ok "verifier: valid SCRAM format, 0600" || bad verifier
(cd "$R/opt/mycelium-memory" && node --input-type=module -e "
  import { deriveKeys } from './scripts/scram-verifier.mjs';
  const [, it, rest] = process.argv[1].match(/^SCRAM-SHA-256\\\$(\d+):(.*)\$/); const [salt, keys] = rest.split('\$'); const [sk, svk] = keys.split(':');
  const k = deriveKeys(process.argv[2], Buffer.from(salt, 'base64'), Number(it));
  process.exit(k.storedKey.toString('base64') === sk && k.serverKey.toString('base64') === svk ? 0 : 1);" "$(cat "$V")" "$pw") \
  && ok "the verifier matches the stored password" || bad "verifier/password mismatch"
pws=("$RC"/pw.*); ! grep -rq "$pw" "$T/out" "$RC/log" && [[ ! -e ${pws[0]} ]] && ok "password never printed or logged; temporary password file shredded" || bad "password leak"
before=$(snap | grep -v 'mycelium-explorer-trial/log'); run setup "$C"; [[ $? != 0 && $(snap | grep -v 'mycelium-explorer-trial/log') == "$before" ]] && ok "second setup refuses and changes nothing (beyond its own log line)" || bad "setup rerun"

echo "3. run: order, exact footprint, verifier removed; failures, deadline and a TERM-ignoring child stop within the cap"
run run; r=$?
[[ $r == 0 && $(calls) == "whoami footprint A B check footprint " ]] && grep -q 'footprint delta nodes=6 edges=6 assessments=2' "$T/out" && [[ ! -e $V ]] \
  && grep -qx "closed $V" "$RC/created" && ok "six steps in order; delta exactly 6/6/2; verifier shredded and recorded closed" || { bad run; cat "$T/out"; }
rm -f "$T/ctl/calls" "$T/ctl/fp"; EXTRA_A=1 run run; [[ $? != 0 ]] && grep -q 'not exactly 6/6/2' "$T/out" && ok "wrong footprint: STOP" || bad "footprint"
unset EXTRA_A; rm -f "$T/ctl/calls" "$T/ctl/fp"; touch "$T/ctl/fail_B"; run run
[[ $? != 0 && $(calls) == "whoami footprint A B " ]] && ok "B fails: STOP immediately, nothing after it, nothing retried" || { bad "fail stop"; cat "$T/out"; }
rm -f "$T/ctl/fail_B" "$T/ctl/calls" "$T/ctl/fp"; touch "$T/ctl/stubborn_A"
t0=$(date +%s); T_STEP=6 T_GRACE=2 run run; r=$?; el=$(( $(date +%s) - t0 ))
[[ $r != 0 && $el -le 8 ]] && grep -q "'A' failed or timed out" "$T/out" && ok "TERM-ignoring step killed within its 6 s cap (whole run ${el}s, grace inside the cap)" || { bad "stubborn step ${el}s"; cat "$T/out"; }
rm -f "$T/ctl/calls" "$T/ctl/fp"; t0=$(date +%s); T_DEADLINE=7 T_STEP=90 T_GRACE=2 run run; r=$?; el=$(( $(date +%s) - t0 ))
[[ $r != 0 && $el -le 9 ]] && ok "TERM-ignoring step under a 7 s overall cap: stopped in ${el}s" || { bad "deadline ${el}s"; cat "$T/out"; }
rm -f "$T/ctl/stubborn_A"

echo "4. close and teardown remove only what the receipt records; unrelated additions survive"
echo keep > "$R/opt/unrelated"; echo later > "$R/etc/mycelium/added-later.conf"
run close; [[ $? == 0 && ! -e $E ]] && grep -q 'CLOSE OK' "$T/out" && ok "close shreds the recorded credential" || { bad close; cat "$T/out"; }
run close; [[ $? == 0 ]] && ok "close is safe to repeat" || bad "close repeat"
run run; grep -q 'no credential recorded' "$T/out" && ok "run refuses after close" || bad "run after close"
run teardown; r=$?
[[ $r == 0 && ! -e $R/opt/mycelium-memory && ! -e $R/users/mycmem && ! -e $RC && -f $R/opt/unrelated && -f $R/etc/mycelium/added-later.conf ]] \
  && compgen -G "$R/root/mycelium-explorer-trial-receipt-*" >/dev/null && ok "teardown: package, user and receipt dir removed; config dir kept (holds a file the trial did not create); receipt archived" || { bad teardown; cat "$T/out"; }

echo "4b. a forged or tampered receipt is never acted on"
fresh; run setup "$C" >/dev/null; chmod 0755 "$RC"; before=$(snap); run close; run teardown
[[ $(snap) == "$before" ]] && grep -q 'no recognised receipt' "$T/out" && ok "receipt directory with the wrong mode: close/teardown change nothing" || { bad "tampered mode"; cat "$T/out"; }
chmod 0700 "$RC"; sed -i '1s/.*/forged header/' "$RC/created"; before=$(snap); run close; run teardown
[[ $(snap) == "$before" ]] && ok "receipt without the exact header: close/teardown change nothing" || bad "tampered header"

echo "5. a setup that fails part-way: close + teardown undo exactly what it recorded"
fresh; echo keep > "$R/opt/unrelated"; touch "$T/ctl/npm_fail"; before=$(snap); run setup "$C"; r=$?
grep -qx "dir $R/opt/mycelium-memory" "$RC/created" && ! grep -q '^file ' "$RC/created" && [[ $r != 0 ]] && ok "npm failure: STOP after recording only user and package" || { bad "partial setup"; cat "$T/out"; }
run close; run teardown
[[ $(snap | grep -v '\./root/') == "$(echo "$before" | grep -v '\./root/')" ]] && ok "after close + teardown the tree equals the pre-setup tree (only the archived receipt in root/ is new)" \
  || { bad "partial undo"; diff <(echo "$before") <(snap) | head; }

echo; echo "explorer trial tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
