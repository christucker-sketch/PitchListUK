#!/usr/bin/env bash
# Mycelium L1 explorer trial on fpd-prod (PROPOSAL; run only after Chris approves the exact plan in
# greenfield/docs/mycelium/SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md section 5). Database only: no model or CLI call.
#   sudo bash mycelium-explorer-trial.sh precheck            read-only; changes nothing
#   sudo bash mycelium-explorer-trial.sh setup <commit>      user mycmem, package at /opt, credential, SCRAM verifier
#   sudo bash mycelium-explorer-trial.sh run                 whoami, footprint, A, B, check, footprint (<= 300 s total)
#   sudo bash mycelium-explorer-trial.sh close               ALWAYS after the trial: shred credential and verifier
#   sudo bash mycelium-explorer-trial.sh teardown            optional: remove only the user/package this script created
# Never prints the password or the verifier. Never retries. Every refusal leaves existing files untouched.
set -euo pipefail
umask 077
HOST=ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech DBNAME=neondb ROLE=mycelium_explorer_fpd
U=mycmem UHOME=/var/lib/mycmem PKG=/opt/mycelium-memory ETC=/etc/mycelium ENV=/etc/mycelium/explorer.env
VER=/home/ct_admin/mycelium-explorer.scram REPO=/var/lib/hubsync/repo BRANCH=origin/findpitches-v3/greenfield
SUB=greenfield/mycelium/memory MARK=.created-by-mycelium-explorer-trial DEADLINE_S=300 STEP_S=90 NODE_MIN=22.19.0
LOG=/root/mycelium-explorer-trial.log
LIVE=(node --env-file="$ENV" "$PKG/scripts/explorer-live.mjs")
OWN=(root:root)
AS_U=(runuser -u "$U" -- env -i HOME="$UHOME" PATH=/usr/local/bin:/usr/bin:/bin)
AS_HS=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${TRIAL_TEST:-0} == 1 ]]; then   # offline test harness only: everything under $T_ROOT, no users, no network
  UHOME=$T_ROOT/var/lib/mycmem PKG=$T_ROOT/opt/mycelium-memory ETC=$T_ROOT/etc/mycelium ENV=$T_ROOT/etc/mycelium/explorer.env
  VER=$T_ROOT/home/ct_admin/mycelium-explorer.scram REPO=$T_REPO BRANCH=$T_BRANCH LOG=$T_ROOT/trial.log
  DEADLINE_S=${T_DEADLINE:-300} STEP_S=${T_STEP:-90} OWN=() AS_U=(env) AS_HS=(env) LIVE=("$T_LIVE")
fi
say()  { echo "explorer-trial: $*" | tee -a "$LOG"; }
stop() { say "STOP: $*"; exit 1; }
have_user() { if [[ ${TRIAL_TEST:-0} == 1 ]]; then [[ -f $T_ROOT/user-exists ]]; else getent passwd "$U" >/dev/null; fi; }
own() { [[ ${#OWN[@]} -eq 0 ]] || chown "$1" "$2"; }
MODE=${1:-}
[[ $MODE =~ ^(precheck|setup|run|close|teardown)$ ]] || { echo "usage: sudo bash mycelium-explorer-trial.sh precheck|setup <commit>|run|close|teardown"; exit 2; }
if [[ ${TRIAL_TEST:-0} != 1 ]]; then [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"; fi
touch "$LOG"; chmod 600 "$LOG"; say "$MODE started $(date -u +%FT%TZ)"

node_ok() { command -v node >/dev/null && node -e "const [a,b,c]=process.versions.node.split('.').map(Number),[x,y,z]='$NODE_MIN'.split('.').map(Number);process.exit(a>x||(a==x&&(b>y||(b==y&&c>=z)))?0:1)"; }

case $MODE in
precheck)
  node_ok && say "node $(node --version) (>= $NODE_MIN)" || stop "node >= $NODE_MIN is not installed; installing it is a separate approval"
  command -v npm >/dev/null && say "npm $(npm --version)" || stop "npm missing"
  have_user && stop "user $U already exists; inspect before any trial" || say "user $U absent"
  for p in "$PKG" "$ENV" "$VER"; do [[ -e $p ]] && stop "$p already exists; inspect before any trial"; done; say "no trial files present"
  [[ ${TRIAL_TEST:-0} == 1 ]] || { c=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/" || true); say "HTTPS to $HOST: ${c:-unreachable}"; [[ $c =~ ^[0-9]{3}$ && $c != 000 ]] || stop "Neon endpoint unreachable over HTTPS"; }
  say "PRECHECK OK: nothing changed" ;;

setup)
  C=${2:-}; [[ $C =~ ^[0-9a-f]{40}$ ]] || stop "give the full 40-character approved commit"
  node_ok || stop "node >= $NODE_MIN missing"
  have_user && stop "user $U already exists; refusing to reuse it"
  for p in "$PKG" "$ENV" "$VER"; do [[ -e $p ]] && stop "$p already exists; refusing to overwrite"; done
  "${AS_HS[@]}" git -C "$REPO" cat-file -e "$C^{commit}" 2>/dev/null || stop "commit $C not in the HubSync clone (wait for HubSync, then retry setup)"
  "${AS_HS[@]}" git -C "$REPO" merge-base --is-ancestor "$C" "$BRANCH" || stop "commit $C is not on $BRANCH"
  say "approved commit $C present on $BRANCH"
  if [[ ${TRIAL_TEST:-0} == 1 ]]; then mkdir -p "$UHOME"; touch "$T_ROOT/user-exists"; else
    useradd --system --home-dir "$UHOME" --create-home --shell /usr/sbin/nologin "$U"; fi
  touch "$UHOME/$MARK"; say "created system user $U (marker $UHOME/$MARK)"
  install -d -m 0755 "$PKG"; own root:root "$PKG"; touch "$PKG/$MARK"
  "${AS_HS[@]}" git -C "$REPO" archive "$C" "$SUB" | tar -x -C "$PKG" --strip-components=3 --no-same-owner
  [[ -f $PKG/scripts/explorer-live.mjs && -f $PKG/package-lock.json ]] || stop "package extraction incomplete (run close, then teardown)"
  (cd "$PKG" && npm ci --ignore-scripts --omit=dev --no-audit --no-fund --cache "$PKG/.npm-cache" >/dev/null) || stop "npm ci failed (run teardown)"
  rm -rf "$PKG/.npm-cache"; [[ ${#OWN[@]} -eq 0 ]] || chown -R root:root "$PKG"; chmod -R go-w,o+rX "$PKG"
  say "package $SUB@${C:0:12} installed read-only at $PKG (root-owned)"
  install -d -m 0750 "$ETC"; own "root:$U" "$ETC"
  pwf=$(mktemp "${TMPDIR:-/root}/mycelium-pw.XXXXXX"); trap 'shred -u "$pwf" 2>/dev/null || rm -f "$pwf"' EXIT
  openssl rand -hex 24 | tr -d '\n' > "$pwf"
  { printf 'MYCELIUM_DATABASE_URL=postgresql://%s:' "$ROLE"; cat "$pwf"; printf '@%s/%s?sslmode=require\n' "$HOST" "$DBNAME"
    printf 'MYCELIUM_DATABASE_HOST=%s\nMYCELIUM_DATABASE_NAME=%s\n' "$HOST" "$DBNAME"; } > "$ENV.tmp"
  chmod 0640 "$ENV.tmp"; own "root:$U" "$ENV.tmp"; mv "$ENV.tmp" "$ENV"
  [[ -d $(dirname "$VER") ]] || stop "$(dirname "$VER") missing"
  node "$PKG/scripts/scram-verifier.mjs" < "$pwf" > "$VER.tmp" || stop "verifier generation failed (run close)"
  grep -qE '^SCRAM-SHA-256\$4096:' "$VER.tmp" || stop "verifier malformed (run close)"
  chmod 0600 "$VER.tmp"; [[ ${#OWN[@]} -eq 0 ]] || chown ct_admin:ct_admin "$VER.tmp"; mv "$VER.tmp" "$VER"
  shred -u "$pwf"; trap - EXIT
  say "credential written to $ENV (root:$U 0640; password not shown); SCRAM verifier at $VER (ct_admin 0600)"
  say "SETUP OK. Next: copy the verifier to the PC with scp, run the PC 'create' step, then 'run' here" ;;

run)
  [[ -f $ENV ]] || stop "no credential at $ENV (setup not done, or already closed)"
  [[ -f $PKG/$MARK ]] || stop "package not installed by setup"
  [[ -e $VER ]] && { shred -u "$VER"; say "removed the verifier copy on fpd-prod (no longer needed)"; }
  start=$(date +%s); out=$UHOME/trial-out
  step() {  # mode -> runs one fresh node process as mycmem within the overall deadline; prints its single JSON line
    local left=$(( start + DEADLINE_S - $(date +%s) )) t; t=$(( left < STEP_S ? left : STEP_S ))
    [[ $t -gt 0 ]] || stop "overall ${DEADLINE_S}s trial deadline reached before '$1'; nothing retried. Run close."
    if "${AS_U[@]}" timeout -k 5 "$t" "${LIVE[@]}" "$1" > "$out" 2>&1; then
      say "$1: $(head -c 4000 "$out")"
    else stop "'$1' failed or timed out: $(head -c 400 "$out"). Nothing retried. Run close (here) and the PC close step."; fi
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
  for f in "$ENV" "$ENV.tmp" "$VER" "$VER.tmp"; do [[ -e $f ]] && { shred -u "$f"; say "shredded $f"; }; done
  rm -f "$UHOME/trial-out" 2>/dev/null || true
  [[ ! -e $ENV && ! -e $VER ]] && say "CLOSE OK on fpd-prod: no credential or verifier remains. The PC close step disables the login" || stop "a credential file remains" ;;

teardown)
  [[ -e $ENV ]] && stop "credential still present; run close first"
  if [[ -f $PKG/$MARK ]]; then rm -rf --one-file-system "$PKG"; say "removed $PKG (created by this trial)"; else say "$PKG not created by this trial; left alone"; fi
  if have_user && [[ -f $UHOME/$MARK ]]; then
    if [[ ${TRIAL_TEST:-0} == 1 ]]; then rm -rf "$UHOME" "$T_ROOT/user-exists"; else userdel -r "$U"; fi; say "removed user $U (created by this trial)"
  else say "user $U not created by this trial (or absent); left alone"; fi
  [[ -d $ETC && -z $(ls -A "$ETC") ]] && rmdir "$ETC" && say "removed empty $ETC"
  say "TEARDOWN OK" ;;
esac
