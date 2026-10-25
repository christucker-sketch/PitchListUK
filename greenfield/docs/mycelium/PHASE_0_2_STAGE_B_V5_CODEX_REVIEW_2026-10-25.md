# Stage B v5 independent review and approved continuation plan

Codex, **25 October 2026, 09:49 GMT**. Reviewed runtime `31c3680c` and approved-task commit `3fec9bf8`.

**Technical review PASS; HOST-COMMAND GO-AHEAD GIVEN.** Chris replied **“approved”** in this Codex chat after reviewing2e66e328, recorded25October09:54GMT ([decision](../../../team/DECISIONS.md#myc-stage-b-v5-host-2026-10-25--v5-upgrade-and-single-claude003-run-chris)). This satisfies plan§9's remaining gate for the exact upgrade and single Claude003 run below. **No further approval is needed for these commands.** Execution/evidence are pending from the existing home-LAN workflow; no new host attempt or model call by Codex. Native billing/allowance prerequisites and every other stage boundary remain.

## Original host run: independently checked evidence

- **v4 installation is host-reported complete**, replacing the old waiting-for-install status. Plan§7 records archive/nine-file checks, all56 offline checks on the host, root-owned0755 commands, install receipt and unchanged active HubSync. Codex has reviewed this evidence, not accessed the home-LAN host.
- **001 completed:** claim`cb8a52c9`, completion`489561e0`, one reported Codex CLI0.164.0 call of19s;17,119 input tokens including12,288 cached,402 output tokens. Its result hashes to **`0cc1a7fd3db9270b463152feaffd9fbbc989bff00235c92c934ad14fe8382ffa`**, matching the committed completion event.
- **002 failed:** claim`0a3055db`, failure`216e9024` with`runner_failed`. Host diagnostics reported by Claude say failure at `claude auth status` before a model call. The public v4 failure receipt itself has no explicit called:false marker or token usage; **zero Claude model calls is host-reported, not independently established from that receipt alone**. No Claude review result exists.
- A disposable local clone of the real Git history passes the gate's strict state validation:001`completed`,002`failed`,003`pending`. Both terminal task folders are **unchanged** since216e9024. This read-only test used no model, real GitHub write or host access.
- **Full exchange remains PARTIAL.** The Codex half proves real claim/admit/native-call/single-writer publication; the intended Claude response has not happened. Three substantive HubSync risks in001 are retained for later separately reviewed fixes: unchanged-tip backlog starvation, Bash errexit suppression and symlink output paths. No HubSync patch/deployment is performed here.
- **Billing evidence remains incomplete:** before/after allowance readings are still absent from the hub. Do not claim independently verified£0 consumption or billing acceptance. Collect and sanitize those readings before/after the continuation; stop if paid fallback/extra credits/auth are uncertain.

Budget timing comes from committed claim events, not manually typed handover headings: first claim09:27:14Z means original window end09:57:14Z; the002 failure holds the original grant regardless. Some peer headings and003's typed creation timestamp are ahead of the current UTC read. Preserve original history and use actual new claim time for003's window; do not silently rewrite events or report a future observation as measured.

## v5 review and tests

| Check | Independent result |
|---|---:|
| Maintained suite, including new preflight cases |47/47 pass|
| Original independent regressions |7/7 pass|
| Absolute admission deadlines |2/2 pass|
| Shared publication deadlines |3/3 pass|
| Manifest source hashes |10/10 match|
| Shell syntax |All10 scripts pass|

**59/59 offline checks pass.** These use local temporary Git and fake CLIs/clock fixtures, not live provider calls. The changed crash/symlink fixtures correctly permit the new no-model preflight before testing the actual failure path; the symlink test now checks `result_rejected` explicitly.

Source review confirms:

- Sign-in/version preflight occurs before claim. Failed preflight makes no claim/model call. Checks get a60s cap (TERM50s/KILL58s); a measured3s fake sign-in now passes. Rechecking after admission still fails closed; a before-call failure is explicitly recorded`called:false`/`failed_before_call`. A model-call failure records`called:true`. Claims still consume their slot and hold on failure; metadata does not replenish a grant.
- `upgrade-stageb.sh` verifies the ten-file manifest, expected host, install receipt, unchanged installed command hashes and idle run lock before replacing the three commands. It backs up the receipt and atomically updates its command hashes. It starts nothing and preserves spool/state/allowlist/sign-ins/HubSync. This is source review plus Claude's reported disposable simulation, **not a live upgrade by Codex**. If installation/receipt state is unexpected or replacement fails partially, stop for inspection; do not bypass hash checks or improvise cleanup.
- The003 descriptor blob is exactly **`b0b321cf5437372bb2cdc8c37c1fa12d8ecfef58`**, its instructions match002 and it references the unchanged completed001 result.
- The new allowlist contains **only003**. That single immutable descriptor, no re-claim/replay and atomic start enforce at most **one additional Claude invocation**, with a new30-minute window/180s call cap/no retries. The generic grant JSON still displays default`max:2`; that does not authorize another task.001/002 remain terminal and outside the new allowlist. The original Codex same-request transport exception does not extend to Claude003.

## Approved concrete host continuation

Pinned Claude archive **`stageb-0.6.tgz`**, declared SHA256 **`c761d989c33e58429dae1f7c5dd151c75eea7ca858c486f8e3153f52f2a3e9b0`**. The archive is absent from this Codex workspace; individual source hashes are verified, archive identity must be checked on transfer. Execute onfpd-prod via the existing manual PC/home-LAN workflow under the recorded go-ahead; no cloud SSH retry is proposed because that route is known unavailable.

PC transfer:

```powershell
scp C:\Users\ChrisT\stageb-0.6.tgz ct_admin@fpd-prod.Home:~/
```

Reviewed upgrade chain uses a **new extraction directory**, preserving the previous`~/stageb` kit. This replaces §9's unnecessary`rm -rf ~/stageb` with routine reversible preparation; it does not change the pinned bundle or installed paths.

```bash
set -euo pipefail
cd ~
printf '%s\n' 'c761d989c33e58429dae1f7c5dd151c75eea7ca858c486f8e3153f52f2a3e9b0  stageb-0.6.tgz' | sha256sum -c -
stageb_v5_dir=$(mktemp -d "$HOME/mycelium-stageb-v5.XXXXXX")
tar -xzf stageb-0.6.tgz -C "$stageb_v5_dir"
cd "$stageb_v5_dir/stageb"
sha256sum -c SHA256SUMS
bash test-stageb.sh
bash test-review-regressions.sh
bash test-review-deadlines.sh
bash test-review-publication.sh
sudo bash upgrade-stageb.sh
```

After a successful upgrade, confirm the existing native Claude subscription/billing guard, paid fallback/extra-usage credits OFF and capture baseline allowance readings. **Only when those checks pass**, pin exactly this one-task grant and manually run it once:

```bash
set -euo pipefail
printf '%s\n' 'MYC-20261025-003 claude b0b321cf5437372bb2cdc8c37c1fa12d8ecfef58' | sudo tee /etc/myc-stageb/allowed
sudo MYC_BILLING_CONFIRMED=yes myc-stageb MYC-20261025-003
```

On failure/uncertainty, stop and report; no automatic rerun or model reconciliation. Retain the old task events and private logs. Afterward capture allowance readings and sanitize the exact003 claim/completion/failure commit, result SHA256, call duration/usage, no extra invocation and unchanged HubSync/production evidence. Do not report the full handoff passed until003 produces and publishes its real review.

Reviewed rollback is receipt-based **removal of the manual runner**, not automatic restoration of v4:

```bash
sudo bash ~/stageb/uninstall-stageb.sh
```

The v4 uninstall script is unchanged and reads the updated receipt. It refuses an active run, keeps modified commands and retains evidence. No rollback is executed or newly authorized by this review; preserve the before-upgrade receipt and both archives for inspection.

## Approval given; execution evidence still pending

The new grant/task were approved in commits31c3680c/3fec9bf8. Codex completed the review in2e66e328 and Chris then replied **“approved”** to the exact host-command request. The [plan§9](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md#9-v5-finish-the-claude-half-chris-chose-option-b-25-oct-ready-for-codex-review) gate is satisfied. Claude/Chris should execute the reviewed upgrade and single003run from the home LAN, capture real evidence and stop on uncertainty. **Do not reopen v4 installation, option B, task creation or these v5 host-command approvals.** No successful upgrade/run, verified spending or peer acknowledgement is implied before evidence arrives.

No new automatic trigger, service/timer, email/Stage C, spending, infrastructure deletion, Pi/J1900/Cloudflare/production/V1/V2 changes. No source/runtime edits or real calls by Codex during this review. No commercial inventory/producer-health remeasurement; existing dated counts remain dated.
