#!/usr/bin/env bash
# NO-MODEL rehearsal of the concurrent session on fpd-prod with FAKE agents. It exercises exactly the host parts the live
# proof depends on and that cannot be tested offline:
#   - workers started by the systemd-scope launcher, as the existing account myc (transient scopes; nothing persistent)
#   - shared tests in the systemd sandbox (DynamicUser, no network, read-only system)
#   - STOP: a second run is stopped mid-session; afterwards no scope and no tagged process may remain
#   - the existing no-model sign-in/billing preflight (myc-agent --preflight) still passes for both CLIs
# No model call, no login, no network use by the session, no install, no service/timer, no Neon, no Git push.
# Root only (it launches as root and drops agents to myc).   sudo bash brix-rehearsal.sh <commit>
set -euo pipefail
umask 022
C=${1:-}
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
[[ $C =~ ^[0-9a-f]{40}$ ]] || { echo "usage: sudo bash brix-rehearsal.sh <40-char commit>"; exit 2; }
NODE=/usr/local/bin/node; [[ -x $NODE ]] || { echo "REFUSED: $NODE missing"; exit 2; }
id myc >/dev/null || { echo "REFUSED: account myc missing (it is not created here)"; exit 2; }
W=$(mktemp -d /var/tmp/myc-rehearsal.XXXXXX); chmod 711 "$W"
echo "== evidence folder $W"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session | tar -x -C "$W" --strip-components=2 --no-same-owner
chmod -R a+rX "$W/session"
sha256sum "$W"/session/*.mjs "$W"/session/adapters/*.mjs | sed "s#$W/##" > "$W/source.sha256"
echo "== 1. existing no-model sign-in/billing preflight (myc-agent --preflight)"
MYC=(runuser -u myc -- env -i HOME=/home/myc USER=myc LOGNAME=myc LANG=C.UTF-8 PATH=/home/myc/.local/bin:/home/myc/bin:/usr/local/bin:/usr/bin:/bin)
for a in claude codex; do "${MYC[@]}" /usr/local/bin/myc-agent --preflight "$a" > "$W/preflight-$a.txt" 2>&1 && echo "   $a: OK" || { echo "   $a: FAILED (see $W/preflight-$a.txt)"; exit 1; }; done
manifest() {  # id extra-limits-json
  cat > "$W/$1.json" <<EOF
{ "id": "$1", "fixture": "links-proof", "agents": "links-proof", "testCmd": "links-proof", "sandbox": "systemd",
  "launcher": { "mode": "systemd-scope", "user": "myc", "path": "/usr/local/bin:/usr/bin:/bin", "memoryMax": "1G", "tasksMax": 128 },
  "limits": { "maxWallMs": 60000, "maxCallsPerAgent": 6, "graceMs": 2000 $2 } }
EOF
}
leftovers() {  # session id -> 0 if nothing of it remains
  local n; n=$(systemctl list-units --all --plain --no-legend "myc-session-$1-*" 2>/dev/null | wc -l)
  local p; p=$(grep -lsa "MYC_SESSION=$1-" /proc/[0-9]*/environ 2>/dev/null | wc -l)
  echo "   scopes left: $n, tagged processes left: $p"; [[ $n == 0 && $p == 0 ]]
}
echo "== 2. fake-agent proof: systemd-scope workers as myc, systemd sandbox tests"
manifest rehearsal-a ''
if "$NODE" "$W/session/run.mjs" "$W/rehearsal-a.json" "$W/a" > "$W/a.log" 2>&1; then echo "   run: MECHANICAL PASS"; else echo "   run: FAIL (see $W/a.log)"; tail -25 "$W/a.log"; exit 1; fi
grep -E "tested |worker exited" "$W/a.log" | sed 's/^/   /'
grep -q 'shared tests on integration .*: PASS' "$W/a.log" || { echo "   the systemd sandbox did not run the tests"; exit 1; }
leftovers rehearsal-a || { echo "   LEFTOVERS after a normal end"; exit 1; }
echo "== 3. STOP mid-session: everything of the session must be gone afterwards"
manifest rehearsal-b ''
( sleep 2; touch "$W/b/session/STOP" ) &
"$NODE" "$W/session/run.mjs" "$W/rehearsal-b.json" "$W/b" > "$W/b.log" 2>&1 || true
grep -q 'session stopping: STOP file' "$W/b.log" && echo "   stopped by the STOP file" || { echo "   STOP not observed (see $W/b.log)"; exit 1; }
sleep 1; leftovers rehearsal-b || { echo "   LEFTOVERS after STOP"; exit 1; }
echo
echo "REHEARSAL OK at $C: systemd-scope launcher (myc), systemd sandbox, STOP cleanup, sign-in preflight. No model was called."
echo "Evidence: $W (a.log, b.log, a/report.json, source.sha256)"
