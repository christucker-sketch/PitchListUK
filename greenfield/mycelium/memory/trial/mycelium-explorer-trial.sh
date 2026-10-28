#!/usr/bin/env bash
# Mycelium L1 explorer trial on fpd-prod (PROPOSAL; run only after Chris approves the exact plan in
# greenfield/docs/mycelium/SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md section 5). Database only: no model or CLI call.
#   sudo bash mycelium-explorer-trial.sh precheck            read-only; changes nothing
#   sudo bash mycelium-explorer-trial.sh setup <commit>      user mycmem, package at /opt, credential, one-time PC copy
#   sudo bash mycelium-explorer-trial.sh run                 whoami, footprint, A, B, check, footprint (hard cap 300 s)
#   sudo bash mycelium-explorer-trial.sh close               ALWAYS after the trial: shred the credential and PC copy
#   sudo bash mycelium-explorer-trial.sh teardown            optional: remove the user/package/config dir it created
# Ownership: setup first creates the root-only receipt directory EXCLUSIVELY (mkdir, never -p), then records each artifact
# only AFTER creating it exclusively (useradd, mkdir, O_EXCL file creation). close and teardown act ONLY on recorded
# artifacts; with no receipt they change nothing. Any pre-existing path, user, group or symlink is refused, never adopted.
# Neon accepts only plain-text passwords in CREATE ROLE, so setup leaves ONE 0600 copy for the PC owner step (scp, then
# wiped there); run/close shred the fpd-prod copy. Never prints the password. Never retries.
set -euo pipefail
umask 077
HOST=ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech DBNAME=neondb ROLE=mycelium_explorer_fpd U=mycmem
RC=/var/lib/mycelium-explorer-trial PKG=/opt/mycelium-memory ETC=/etc/mycelium VER=/home/ct_admin/mycelium-explorer.pw
ARCH=/root REPO=/var/lib/hubsync/repo BRANCH=origin/findpitches-v3/greenfield SUB=greenfield/mycelium/memory
DEADLINE_S=300 STEP_S=90 GRACE_S=5 NODE_MIN=22.19.0 TEST=0
AS_HS=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync PATH=/usr/local/bin:/usr/bin:/bin)
AS_U=(runuser -u "$U" -- env -i HOME=/nonexistent PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${TRIAL_TEST:-0} == 1 ]]; then   # offline test harness only: everything under $T_ROOT; users/groups are files
  TEST=1 RC=$T_ROOT/var/lib/mycelium-explorer-trial PKG=$T_ROOT/opt/mycelium-memory ETC=$T_ROOT/etc/mycelium
  VER=$T_ROOT/home/ct_admin/mycelium-explorer.pw ARCH=$T_ROOT/root REPO=$T_REPO BRANCH=$T_BRANCH
  DEADLINE_S=${T_DEADLINE:-300} STEP_S=${T_STEP:-90} GRACE_S=${T_GRACE:-5} AS_HS=(env) AS_U=(env)
fi
ENV=$ETC/explorer.env RECEIPT=$RC/created LOG=$RC/log
LIVE=(node --env-file="$ENV" "$PKG/scripts/explorer-live.mjs"); [[ $TEST == 1 ]] && LIVE=("$T_LIVE")
HEADER="mycelium-explorer-trial receipt v1" OURS=0   # OURS=1 only for a receipt this script created or recognises
say()  { echo "explorer-trial: $*"; [[ $OURS == 1 ]] && echo "explorer-trial: $*" >> "$LOG" || true; }
stop() { say "STOP: $*"; exit 1; }
exists() { [[ -e $1 || -L $1 ]]; }                      # dangling symlinks count as existing
user_exists()  { if [[ $TEST == 1 ]]; then [[ -e $T_ROOT/users/$U ]]; else getent passwd "$U" >/dev/null; fi; }
group_exists() { if [[ $TEST == 1 ]]; then [[ -e $T_ROOT/groups/$U ]]; else getent group "$U" >/dev/null; fi; }
record() { printf '%s %s\n' "$1" "$2" >> "$RECEIPT"; }  # only ever called right AFTER an exclusive creation succeeded
recorded() { [[ -f $RECEIPT ]] && grep -qxF "$1 $2" "$RECEIPT"; }
excl() { ( set -C; : > "$1" ) 2>/dev/null; }           # O_EXCL create; fails on any existing path or (dangling) symlink
# A receipt is recognised only if it is a real root-owned 0700 directory (not a symlink) holding a regular, non-symlink,
# root-owned receipt that starts with the exact header. Anything else is someone else's and is never acted on.
recognise() {
  local me=0; [[ $TEST == 1 ]] && me=$(id -u)
  [[ -d $RC && ! -L $RC && $(stat -c '%u %a' "$RC") == "$me 700" && -f $RECEIPT && ! -L $RECEIPT \
     && $(stat -c %u "$RECEIPT") == "$me" && $(head -1 "$RECEIPT") == "$HEADER" ]] && OURS=1
}
node_ok() { command -v node >/dev/null && node -e "const [a,b,c]=process.versions.node.split('.').map(Number),[x,y,z]='$NODE_MIN'.split('.').map(Number);process.exit(a>x||(a==x&&(b>y||(b==y&&c>=z)))?0:1)"; }
refuse_existing() {
  user_exists && stop "user $U already exists; the trial will not use or change it"
  group_exists && stop "group $U already exists; the trial will not use or change it"
  local p; for p in "$RC" "$PKG" "$ETC" "$VER"; do exists "$p" && stop "$p already exists; refusing to adopt or change it"; done
  return 0
}
MODE=${1:-}
[[ $MODE =~ ^(precheck|setup|run|close|teardown)$ ]] || { echo "usage: sudo bash mycelium-explorer-trial.sh precheck|setup <commit>|run|close|teardown"; exit 2; }
if [[ $TEST != 1 ]]; then [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"; fi
say "$MODE started $(date -u +%FT%TZ)"

case $MODE in
precheck)
  node_ok && say "node $(node --version) (>= $NODE_MIN)" || stop "node >= $NODE_MIN is not installed; installing it is a separate approval"
  command -v npm >/dev/null && say "npm $(npm --version)" || stop "npm missing"
  refuse_existing; say "user/group $U, $RC, $PKG, $ETC and $VER are all absent"
  if [[ $TEST != 1 ]]; then c=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/" || true); say "HTTPS to $HOST: ${c:-unreachable}"
    [[ $c =~ ^[0-9]{3}$ && $c != 000 ]] || stop "Neon endpoint unreachable over HTTPS"; fi
  say "PRECHECK OK: nothing changed" ;;

setup)
  C=${2:-}; [[ $C =~ ^[0-9a-f]{40}$ ]] || stop "give the full 40-character approved commit"
  node_ok || stop "node >= $NODE_MIN missing"
  refuse_existing
  "${AS_HS[@]}" git -C "$REPO" cat-file -e "$C^{commit}" 2>/dev/null || stop "commit $C not in the HubSync clone (wait for HubSync, then retry setup)"
  "${AS_HS[@]}" git -C "$REPO" merge-base --is-ancestor "$C" "$BRANCH" || stop "commit $C is not on $BRANCH"
  mkdir -m 0700 "$RC" || stop "could not create $RC exclusively"           # the receipt root: root-only, never adopted
  excl "$RECEIPT" || stop "receipt creation failed"; printf '%s\ncommit %s\n' "$HEADER" "$C" >> "$RECEIPT"; OURS=1
  say "approved commit $C present on $BRANCH; receipt at $RECEIPT"
  if [[ $TEST == 1 ]]; then excl "$T_ROOT/users/$U" && excl "$T_ROOT/groups/$U" || stop "useradd failed"
  else useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --user-group "$U" || stop "useradd failed (nothing else created; run teardown)"; fi
  record user "$U"; say "created system user and group $U (no home directory)"
  mkdir -m 0755 "$PKG" || stop "could not create $PKG exclusively (run close, then teardown)"; record dir "$PKG"
  "${AS_HS[@]}" git -C "$REPO" archive "$C" "$SUB" | tar -x -C "$PKG" --strip-components=3 --no-same-owner
  [[ -f $PKG/scripts/explorer-live.mjs && -f $PKG/package-lock.json ]] || stop "package extraction incomplete (run close, then teardown)"
  (cd "$PKG" && npm ci --ignore-scripts --omit=dev --no-audit --no-fund --cache "$RC/npm-cache" >/dev/null) || stop "npm ci failed (run close, then teardown)"
  rm -rf "$RC/npm-cache"; [[ $TEST == 1 ]] || chown -R root:root "$PKG"; chmod -R go-w,o+rX "$PKG"
  say "package $SUB@${C:0:12} installed read-only at $PKG (root-owned)"
  mkdir -m 0750 "$ETC" || stop "could not create $ETC exclusively (run close, then teardown)"; record dir "$ETC"
  [[ $TEST == 1 ]] || chown "root:$U" "$ETC"
  pwf=$(mktemp "$RC/pw.XXXXXX"); trap 'shred -u "$pwf" 2>/dev/null || rm -f "$pwf"' EXIT
  # URL-safe base64, 40 characters (240 random bits), upper+lower+digit, no character three times running (Neon >= 60 bits)
  node -e 'const c=require("crypto");for(;;){const p=c.randomBytes(30).toString("base64url");if(/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&!/(.)\1\1/.test(p)){process.stdout.write(p);break}}' > "$pwf"
  excl "$ENV" || stop "could not create $ENV exclusively (run close, then teardown)"; record file "$ENV"
  chmod 0640 "$ENV"; [[ $TEST == 1 ]] || chown "root:$U" "$ENV"
  { printf 'MYCELIUM_DATABASE_URL=postgresql://%s:' "$ROLE"; cat "$pwf"; printf '@%s/%s?sslmode=require\n' "$HOST" "$DBNAME"
    printf 'MYCELIUM_DATABASE_HOST=%s\nMYCELIUM_DATABASE_NAME=%s\n' "$HOST" "$DBNAME"; } >| "$ENV"
  [[ -d $(dirname "$VER") && ! -L $(dirname "$VER") ]] || stop "$(dirname "$VER") missing (run close, then teardown)"
  excl "$VER" || stop "could not create $VER exclusively (run close, then teardown)"; record file "$VER"
  chmod 0600 "$VER"; [[ $TEST == 1 ]] || chown ct_admin:ct_admin "$VER"
  cat "$pwf" >| "$VER"; grep -qE '^[A-Za-z0-9_-]{40}$' "$VER" || stop "password copy malformed (run close, then teardown)"
  shred -u "$pwf"; trap - EXIT
  say "credential at $ENV (root:$U 0640; password not shown); one-time PC copy at $VER (ct_admin 0600)"
  say "SETUP OK. Next: scp $VER to the PC, run the PC 'create' step (it wipes its copy), then 'run' here (it shreds this copy)" ;;

run)
  recognise || stop "no recognised receipt: setup was not run by this script (nothing changed)"
  recorded file "$ENV" && [[ -f $ENV && ! -L $ENV ]] || stop "no credential recorded by setup (not done, or already closed)"
  recorded dir "$PKG" || stop "package not installed by setup"
  if recorded file "$VER" && [[ -f $VER && ! -L $VER ]]; then shred -u "$VER"; record closed "$VER"; say "shredded the one-time PC copy of the password on fpd-prod"; fi
  start=$(date +%s); out=$RC/out
  step() {  # one fresh node process as $U; its TERM deadline plus kill grace stays inside min(STEP_S, time left)
    local left=$(( start + DEADLINE_S - $(date +%s) )) cap t
    cap=$(( left < STEP_S ? left : STEP_S )); t=$(( cap - GRACE_S ))
    [[ $t -ge 1 ]] || stop "overall ${DEADLINE_S}s trial cap reached before '$1'; nothing retried. Run close here and on the PC."
    if "${AS_U[@]}" timeout -k "$GRACE_S" "$t" "${LIVE[@]}" "$1" > "$out" 2>&1; then say "$1: $(head -c 4000 "$out")"
    else stop "'$1' failed or timed out: $(head -c 400 "$out"). Nothing retried. Run close here and on the PC."; fi
  }
  step whoami; step footprint; before=$(cat "$out"); step A; step B; step check; step footprint; after=$(cat "$out")
  node -e '
    const [b, a] = process.argv.slice(1).map(s => JSON.parse(s));
    const d = k => a[k + "_total"] - b[k + "_total"];
    const ok = d("nodes") === 6 && d("edges") === 6 && d("assessments") === 2 && a.trial_nodes === 6 && a.trial_edges === 6 && a.trial_assessments === 2;
    console.log(`footprint delta nodes=${d("nodes")} edges=${d("edges")} assessments=${d("assessments")}; trial rows ${a.trial_nodes}/${a.trial_edges}/${a.trial_assessments}`);
    process.exit(ok ? 0 : 1)' "$before" "$after" | tee -a "$LOG" || stop "footprint is not exactly 6/6/2 on top of the existing rows; run close and inspect"
  rm -f "$out"; say "RUN OK in $(( $(date +%s) - start ))s: A recorded, B (fresh process) recalled and extended, existing rows preserved. Now run close here and on the PC" ;;

close)
  recognise || { echo "explorer-trial: CLOSE: no recognised receipt, so nothing here was created by this trial; nothing changed"; exit 0; }
  bad=""
  for f in "$ENV" "$VER"; do
    recorded file "$f" || continue
    if [[ -L $f ]]; then bad+=" $f(symlink: left alone)"
    elif [[ -f $f ]]; then shred -u "$f"; record closed "$f"; say "shredded $f (created by this trial)"
    fi
  done
  for f in "$RC"/pw.* "$RC/out"; do [[ -f $f && ! -L $f ]] && shred -u "$f"; done
  [[ -z $bad ]] || stop "unexpected state:$bad"
  { recorded file "$ENV" && exists "$ENV"; } && stop "the credential still exists"
  say "CLOSE OK on fpd-prod: no credential or password copy created by this trial remains. The PC close step disables the login" ;;

teardown)
  recognise || { echo "explorer-trial: TEARDOWN: no recognised receipt, so nothing here was created by this trial; nothing changed"; exit 0; }
  for f in "$ENV" "$VER"; do recorded file "$f" && exists "$f" && stop "$f still exists; run close first"; done
  if recorded dir "$PKG" && [[ -d $PKG && ! -L $PKG ]]; then rm -rf --one-file-system "$PKG"; say "removed $PKG (created by this trial)"; fi
  if recorded dir "$ETC" && [[ -d $ETC && ! -L $ETC ]]; then
    if [[ -z $(ls -A "$ETC") ]]; then rmdir "$ETC"; say "removed empty $ETC (created by this trial)"; else say "$ETC holds files this trial did not create; left in place"; fi
  fi
  if recorded user "$U" && user_exists; then
    if [[ $TEST == 1 ]]; then rm -f "$T_ROOT/users/$U" "$T_ROOT/groups/$U"; else userdel "$U"; fi; say "removed user and group $U (created by this trial)"
  fi
  a=$ARCH/mycelium-explorer-trial-receipt-$(date -u +%Y%m%dT%H%M%SZ).txt
  cat "$RECEIPT" "$LOG" > "$a" 2>/dev/null || true; chmod 600 "$a"
  rm -rf --one-file-system "$RC"
  echo "explorer-trial: TEARDOWN OK; receipt and log archived at $a" ;;
esac
