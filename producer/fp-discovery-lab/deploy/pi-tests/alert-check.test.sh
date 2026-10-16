#!/usr/bin/env bash
# Tests for deploy/pi/bin/fpd-alert-check with stubbed systemctl/journalctl/vcgencmd/curl (no network, no root).
#   bash deploy/pi-tests/alert-check.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; CHECK="$HERE/../pi/bin/fpd-alert-check"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
STUB=$T/stub; mkdir -p "$STUB" "$T/srv/delivery/state" "$T/srv/backups" "$T/state" "$T/ctl"
KEY="api-TESTKEY0123456789abcdef"
cat > "$T/alert.env" <<EOF
SMTP2GO_API_KEY='$KEY'
ALERT_FROM='FindPitches Pi <alerts@example.test>'
ALERT_TO='ops@example.test'
ALERT_DAILY_HOUR='8'
ALERT_QUIET='off'
EOF
# --- stubs: behaviour comes from files in $T/ctl
cat > "$STUB/systemctl" <<'EOF'
#!/usr/bin/env bash
C=$CTL
case "$1" in
  show) u=$2; shift 2; v=""; for a in "$@"; do [[ $a == -p ]] && continue; [[ $a == --value ]] && continue; p=$a; done
        case "$u:$p" in
          fpd-acquire:ActiveState) cat $C/acquire_state 2>/dev/null || echo inactive ;;
          fpd-acquire:Result) [[ $(cat $C/acquire_state 2>/dev/null) == failed ]] && echo exit-code || echo success ;;
          *Timestamp) echo "Sun 2026-10-11 15:21:31 BST" ;;
          *) echo "" ;;
        esac ;;
  is-active) cat $C/delivery_active 2>/dev/null || echo active ;;
  list-units) cat $C/failed_units 2>/dev/null ;;
esac
EOF
cat > "$STUB/journalctl" <<'EOF'
#!/usr/bin/env bash
echo '[fpd-cycle] 2026-10-11T14:47:24Z EXPORT FAILED (previous export left intact)'
echo '{"export_failed": "validation failed: discovery_source not in enum"}'
echo 'Authorization: Bearer SHOULD-NEVER-APPEAR'
EOF
cat > "$STUB/vcgencmd" <<'EOF'
#!/usr/bin/env bash
case "$1" in get_throttled) echo "throttled=$(cat $CTL/throttled 2>/dev/null || echo 0x0)";; measure_temp) echo "temp=47.8'C";; esac
EOF
cat > "$STUB/curl" <<'EOF'
#!/usr/bin/env bash
# fake SMTP2GO: record argv and stdin config; write the response the test asked for
printf '%s\n' "$@" >> $CTL/curl_argv
cat >> $CTL/curl_stdin
out=""; prev=""; body=""
for a in "$@"; do [[ $prev == -o ]] && out=$a; [[ $prev == --data-binary ]] && body=${a#@}; prev=$a; done
cp "$body" $CTL/last_body.json
if [[ -f $CTL/fail ]]; then echo '{"data":{"error_code":"E_ApiResponseCodes.API_KEY_INVALID","error":"bad key"}}' > "$out"; printf 401
else echo '{"data":{"succeeded":1,"failed":0,"failures":[]}}' > "$out"; printf 200; fi
EOF
chmod +x "$STUB"/*
export PATH="$STUB:$PATH" CTL=$T/ctl FPD_ALERT_CONF=$T/alert.env FPD_ALERT_STATE=$T/state FPD_SRV=$T/srv FPD_BOOT_ID_FILE=$T/ctl/boot_id
echo boot-1 > $T/ctl/boot_id
touch "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"
status() { # checked_at_iso rejected consecutive_failures source_age_s
  printf '{"status":"delivered","checked_at":"%s","accepted":2101,"records":2101,"rejected":%s,"consecutive_failures":%s,"error":null,"pending_rechecks":977,"source_age_seconds":%s}\n' "$1" "$2" "$3" "$4" > "$T/srv/delivery/state/status.json"; }
offsite() { printf '{"ok":%s,"at":"%s","db_backup":"x","error":%s}\n' "$1" "$2" "$3" > "$T/srv/backups/offsite-status.json"; }
iso() { date -u -d "@$1" +%FT%TZ; }
at() { date -d "2026-10-11 $1" +%s; }   # local time today
run() { FPD_ALERT_NOW=$1 bash "$CHECK" >"$T/out" 2>&1; }
sends() { [[ -f $T/ctl/curl_argv ]] && grep -c '^https://api.smtp2go.com/v3/email/send$' $T/ctl/curl_argv || echo 0; }
subj() { jq -r .subject $T/ctl/last_body.json; }
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; echo "  out: $(head -c 400 "$T/out")"; fi; }

# 1. healthy at 07:00: nothing sent; first run records boot without a reboot notice
N=$(at 07:00); touch -d "@$N" "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"; status "$(iso $((N-300)))" 0 0 3600; offsite true "$(iso $((N-3600)))" null
run "$N"; ok "healthy sends nothing" '[[ $(sends) == 0 ]]'
# 2. daily summary at 08:07, once
N=$(at 08:07); status "$(iso $((N-300)))" 0 0 3600; run "$N"
ok "daily summary sent" '[[ $(sends) == 1 && "$(subj)" == *"daily: all OK"* ]]'
N=$(at 08:22); run "$N"; ok "daily only once" '[[ $(sends) == 1 ]]'
# 3. discovery cycle fails: one PROBLEM email containing the export error, no secrets
echo failed > $T/ctl/acquire_state; N=$(at 15:52); status "$(iso $((N-300)))" 0 0 15000; run "$N"
ok "problem email" '[[ $(sends) == 2 && "$(subj)" == *"PROBLEM: Discovery cycle FAILED"* ]]'
ok "problem body has export error" 'jq -r .text_body $T/ctl/last_body.json | grep -q "EXPORT FAILED"'
ok "journal secret filtered" '! grep -q "SHOULD-NEVER-APPEAR" $T/ctl/last_body.json'
# 4. same problem 15 min later: no email
N=$(at 16:07); run "$N"; ok "no repeat within 6h" '[[ $(sends) == 2 ]]'
# 5. 6 hours later: reminder (now source is also stale -> that is NEW, so PROBLEM with both)
N=$(at 21:55); status "$(iso $((N-300)))" 0 0 26000; run "$N"
ok "new stale problem reported" '[[ $(sends) == 3 && "$(subj)" == *"Producer source data"* ]]'
ok "reminder for old one included" 'jq -r .text_body $T/ctl/last_body.json | grep -q "Still wrong"'
# 6. cleared: RESOLVED
rm $T/ctl/acquire_state; N=$(at 22:40); status "$(iso $((N-300)))" 0 0 1200; run "$N"
ok "resolved email" '[[ $(sends) == 4 && "$(subj)" == *"] RESOLVED:"* ]]'
ok "state empty after resolve" '[[ $(jq ".active|length" $T/state/state.json) == 0 ]]'
# 7. under-voltage now + delivery rejected + stalled
echo 0x50005 > $T/ctl/throttled; N=$(at 23:00); status "$(iso $((N-4000)))" 5 0 1200; run "$N"
ok "power+delivery problems" 'b=$(jq -r .text_body $T/ctl/last_body.json); [[ $(sends) == 5 && $b == *UNDER-VOLTAGE* && $b == *"rejected 5"* && $b == *"No V3 delivery"* ]]'
echo 0x50000 > $T/ctl/throttled
# 8. send failure: state not advanced, retried next run
echo 0x50005 > $T/ctl/throttled; rm -f $T/state/state.json; touch $T/ctl/fail; N=$(at 23:20); run "$N"
ok "failure logged" 'grep -q "SEND FAILED http=401" $T/out'
ok "no active state saved on failure" '[[ $(jq ".active|length" $T/state/state.json) == 0 ]]'
rm $T/ctl/fail; N=$(at 23:35); run "$N"; ok "retried after failure" '[[ $(jq ".active|length" $T/state/state.json) -ge 1 ]]'
echo 0x50000 > $T/ctl/throttled
# 9. reboot detection
echo boot-2 > $T/ctl/boot_id; N=$(at 23:50); status "$(iso $((N-300)))" 0 0 1200; run "$N"
ok "reboot notice" 'jq -r .text_body $T/ctl/last_body.json | grep -q "The Pi restarted"'
# 10. off-site backup failure and other failed unit
echo "fpd-offsite-backup.service loaded failed failed x" > $T/ctl/failed_units; offsite false "$(iso $((N-200000)))" '"rclone: 403"'
N=$(( $(at 23:50) + 900 )); run "$N"
ok "offsite problems" 'b=$(jq -r .text_body $T/ctl/last_body.json); [[ $b == *"Off-site backup failed"* && $b == *"fpd-offsite-backup.service FAILED"* && $b == *"Last off-site backup was"* ]]'
# 11. the API key is never on curl's command line, only on stdin
ok "key not in argv" '! grep -q "$KEY" $T/ctl/curl_argv'
ok "key sent as header on stdin" 'grep -q "X-Smtp2go-Api-Key: $KEY" $T/ctl/curl_stdin'
ok "key not in any email body" '! grep -rq "$KEY" $T/ctl/last_body.json'
# 12. rate limit: 8 sends in the last hour blocks the next
jq --argjson n "$N" '.sent=[range(8)|$n-60] | .active={}' $T/state/state.json > $T/s && mv $T/s $T/state/state.json
before=$(sends); run $((N+60)); ok "rate limited" '[[ $(sends) == $before ]] && grep -q "rate limit" $T/out'
# 13. --show and --test
FPD_ALERT_NOW=$N bash "$CHECK" --show > $T/out 2>&1; ok "--show lists problems" 'grep -q "offsite_failed" $T/out'
before=$(sends); FPD_ALERT_NOW=$N bash "$CHECK" --test > $T/out 2>&1; ok "--test sends" '[[ $(sends) == $((before+1)) && "$(subj)" == *"test alert"* ]]'
# 14. under-voltage that comes and goes stays ONE open problem (no flapping), clears after 24h quiet
rm -f $T/state/state.json $T/state/power_seen $T/ctl/failed_units; offsite true "$(iso $N)" null; echo boot-2 > $T/ctl/boot_id
touch -d "@$N" "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"
P0=$(( N + 7200 )); status "$(iso $P0)" 0 0 600; echo 0x50005 > $T/ctl/throttled; b0=$(sends); run $P0
ok "power problem raised" '[[ $(sends) == $((b0+1)) && "$(subj)" == *UNDER-VOLTAGE* ]]'
echo 0x50000 > $T/ctl/throttled; status "$(iso $((P0+900)))" 0 0 600; run $((P0+900))
ok "dip gone: no resolved yet" '[[ $(sends) == $((b0+1)) ]]'
echo 0x50005 > $T/ctl/throttled; status "$(iso $((P0+1800)))" 0 0 600; run $((P0+1800))
ok "dip back: no new email" '[[ $(sends) == $((b0+1)) ]]'
echo 0x50000 > $T/ctl/throttled; T2=$((P0+1800+86400+60)); touch -d "@$T2" "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"; offsite true "$(iso $T2)" null; status "$(iso $T2)" 0 0 600; run $T2
ok "resolved after 24h quiet" '[[ "$(subj)" == *"] RESOLVED:"*UNDER-VOLTAGE* ]]'
# 15. quiet hours 22-7: nothing sent overnight; one email at 07:00 covering what happened
sed -i "s/^ALERT_QUIET=.*/ALERT_QUIET='22-7'/" $T/alert.env
rm -f $T/state/state.json $T/state/power_seen; echo 0x0 > $T/ctl/throttled; rm -f $T/ctl/acquire_state
D=$(date -d "2026-10-12 21:30" +%s); touch -d "@$D" "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"; offsite true "$(iso $D)" null
status "$(iso $D)" 0 0 600; run $D; b1=$(sends)
Q=$(date -d "2026-10-12 23:30" +%s); echo failed > $T/ctl/acquire_state; status "$(iso $Q)" 0 0 600; run $Q
ok "quiet: no email at 23:30" '[[ $(sends) == $b1 ]] && grep -q "quiet hours" $T/out'
Q2=$(date -d "2026-10-13 02:00" +%s); rm $T/ctl/acquire_state; status "$(iso $Q2)" 3 0 600; run $Q2
ok "quiet: no email at 02:00" '[[ $(sends) == $b1 ]]'
M=$(date -d "2026-10-13 07:07" +%s); touch -d "@$M" "$T/srv/backups/fpd-20261011T0320Z.sqlite.zst"; offsite true "$(iso $M)" null; status "$(iso $M)" 3 0 600; run $M
ok "07:07 one email" '[[ $(sends) == $((b1+1)) ]]'
ok "still-present problem reported as new" 'jq -r .text_body $T/ctl/last_body.json | grep -q "rejected 3"'
ok "cleared overnight problem listed" 'jq -r .text_body $T/ctl/last_body.json | grep -q "During quiet hours" && jq -r .text_body $T/ctl/last_body.json | grep -q "Discovery cycle FAILED"'
ok "overnight cleared after send" '[[ $(jq ".overnight|length" $T/state/state.json) == 0 ]]'
Q3=$(date -d "2026-10-13 22:15" +%s); status "$(iso $Q3)" 0 0 600; run $Q3
ok "resolution at 22:15 held" '[[ $(sends) == $((b1+1)) ]]'
ok "html part present" 'jq -e .html_body $T/ctl/last_body.json >/dev/null'
ok "html has sections and status table" 'jq -r .html_body $T/ctl/last_body.json | grep -q "During quiet hours" && jq -r .html_body $T/ctl/last_body.json | grep -q "Pi status"'
ok "html is escaped" '! jq -r .html_body $T/ctl/last_body.json | grep -q "(previous export left intact)<"'
ok "key not in html" '! jq -r .html_body $T/ctl/last_body.json | grep -q "$KEY"'
echo "alert-check tests: $pass passed, $fail failed"; [[ $fail == 0 ]]
