# Approved single real decision-chain proof — 27 October 2026

Chris replied **“approved”** directly to Codex's statement that the now-installed decision chain could have one separately approved real end-to-end proof. This is that specific new grant, not a replay or replenishment of Stage B. No repeated project approval required within these bounds.

## Pins and limits

- Task **MYC-20261027-001**, agent **Claude** (installed runner selects Sonnet).
- Creation commit `2c1a426ad9446c7450a38ea00d3e3be096cdf1f3`: descriptor and pending event created together.
- Descriptor blob **6bad6a1b708173ceb1e11237bae69d45929379ff**. No reference files; no external data or tools.
- Exactly **one native subscription model invocation**, installed guard, maximum **180 seconds** and a **30-minute grant from the first claim**. No retry/replacement task/paid API fallback/extra credits; £0 incremental. If quota/auth/billing is not ready, stop without calling.
- Model can only request acceptance of this read-only proof; it cannot execute changes.
- At most **one pinned email**, same dedicated FindPitches key/sender/recipient already used and verified for Stage C; confirm included quota headroom. No new key/recipient or timer.
- Chris personally records approve or reject with installed sudo myc-decide; the state then rests. No resume or second call.

## Existing host workflow — Claude coordinates, Chris executes

Codex has no host route. Claude supplies and records the exact commands/output through the existing workflow. Use installed reviewed programs: agent d173813b, stageb c636582c, gate a74add4e, decide 7e361a4d, notify b6518029. No upgrade or code/configuration changes outside this scoped test.

1. Confirm hashes, task descriptor/initial state, no run in flight, notification timer inactive and MODE=dry-run/PIN empty. Verify native subscription login, paid fallbacks/extra credits off and quota readiness without a model call. No need to repeat settled billing-history questions; this is a current preflight.
2. Create a **separate root-owned proof-specific allowlist** at `/etc/myc-stageb/proof-20261027-001.allowed`, root:hubsync 0640, containing exactly:
   ```text
   MYC-20261027-001 claude 6bad6a1b708173ceb1e11237bae69d45929379ff
   ```
   Keep the installed global allowed file and original consumed tasks/grant/history unchanged. Use the supported command-scoped selectors below; do not delete/reset local state or broaden an existing grant.
3. Baseline notifier while dry-run **before** running the task. This suppresses only existing outstanding notices; the new task must still be pending. Existing notification ledger is retained, not reset/deleted.
4. Run manually **once**, with the installed guard and the one-call bound propagated to every gate invocation:
   ```bash
   sudo MYC_BILLING_CONFIRMED=yes \
     MYC_ALLOW=/etc/myc-stageb/proof-20261027-001.allowed \
     MYC_AS_HUBSYNC='runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin MYC_ALLOW=/etc/myc-stageb/proof-20261027-001.allowed MYC_MAX_CALLS=1' \
     MYC_WINDOW_S=1800 myc-stageb MYC-20261027-001
   ```
   MYC_MAX_CALLS=1 must be inside the clean gate environment as shown; a top-level variable alone would be lost by env -i. The current root-owned proof allowlist and existing Git-history grant checks remain enforced; this is a narrowly scoped new grant.
5. Require awaiting_approval with the installed writer's predecessor/run binding. Expected summary: “Do you accept this read-only end-to-end proof, with no permission to execute further work?” Ordinary completion, malformed output, failed/uncertain publication or other state: **stop**, preserve evidence, no automatic retry/replacement call.
6. Obtain the exact current decision key using installed mycnotify decisions/myc-gate state. Set **PIN to that one key only**, MODE=live, with timer still inactive, using the existing root credential config. Run `sudo systemctl start mycnotify.service` **once**. No other decision is in scope.
7. Require one accepted notice and Chris's receipt confirmation. If rejected, retryable, uncertain or lost response: stop live attempts; no resend. **Immediately return MODE=dry-run and PIN empty regardless of mail outcome**, timer remains off. No live duplicate-check sends are needed; existing offline/proof coverage is retained.
8. Chris uses `sudo myc-decide <exact-key> approve` or `reject` after viewing the request and typing the task ID. This records acceptance/rejection of the proof only, not approval for work. Preserve root owner record and published event. If recording fails, reconcile the same record/key without another model/mail call; do not overwrite it.
9. Verify approved/rejected resting state, one call, no resume, one mail at most, notifier dry-run/PIN empty/timer inactive, HubSync unchanged. Archive the proof-specific allowlist with the host evidence and remove it from active use; preserve original allowlist and all task/event/receipt/ledger history. Do not delete owner records.

## Evidence and stop

Claude publishes sanitized command results, task/claim/awaiting/decision commits and event blobs, installed hashes, CLI/model/version/time/available usage, one-call grant evidence, mail accepted/received or precise failure, attempt count, matching root-record confirmation and final safe-idle state. No credentials, recipient address or private auth logs in GitHub.

Codex checks durable Git evidence and the recorded host report once; it cannot independently inspect root records remotely. No new model “review” call is needed. After this proof, stop for the next owner decision. Stage D, autonomous dispatch, task resume, production/Pi/J1900 changes and ongoing notifications remain closed.

**Current state: proof PASSED and grant consumed.** Actual Git event bindings checked by Codex; host/provider/owner-record observations below are Chris/Claude's recorded evidence. No further call or email authorized.

## Execution evidence: PASSED (27 Oct 2026, fpd-prod, run by Chris; recorded by Claude)

**Phase 1, preflight (no model call).**
- Installed hashes = the pins: `myc-agent` d173813b, `myc-stageb` c636582c, `myc-gate` a74add4e, `myc-decide` 7e361a4d, `mycnotify` b6518029.
- Stage B lock free; `mycnotify.timer` inactive, `hubsync.timer` active; `MODE=dry-run`, `PIN=` empty.
- Task `MYC-20261027-001 pending seq=1`.
- Proof allowlist `/etc/myc-stageb/proof-20261027-001.allowed` created, root:hubsync 0640, containing exactly the pinned line. The original `allowed` was untouched.
- Proof grant read-only: `{"claims":0,"max":1,…,"held":""}`.
- Claude sign-in preflight OK (2.1.308, no model call).
- Notifier baseline: 0 outstanding; `decisions` empty.
- Chris confirmed extra usage / credits off before the run (`MYC_BILLING_CONFIRMED=yes`).

**Phase 2, the one call.** The exact approved command was run once.
- Grant 0/1, preflight OK.
- **Claim** `ca63db51` (run `MYC-20261027-001-r1793115711-3093d975`, event 2 blob `e501b20b…`); admitted, deadline 16:11:21Z.
- **One Claude call, 3 s:** `decision written` (the exact two-line envelope).
- **awaiting_approval** `cbeab3d5`, event 3 blob `594f473c9fde…`, bound to the run and the claim event. Summary: "Do you accept this read-only end-to-end proof, with no permission to execute further work?"
- Usage as recorded: `claude-sonnet-5-5`, 2 input / 0 cached / 50 output tokens, API-equivalent $0.011344 **not billed**.
- Grant afterwards: `claims 1 / max 1`, held for Chris's decision.

**Phase 3, the one pinned email.** Run only after `decisions` showed exactly `MYC-20261027-001-0003-594f473c9fde  ledger=none` with the timer inactive.
- Then `MODE=live`, `PIN=<that key>`, one `systemctl start mycnotify.service` (rc 0): `sent 1`, ledger accepted, no hold.
- **Chris received exactly one email.**
- Immediately reset to `MODE=dry-run`, `PIN=` empty; `decisions` shows `ledger=accepted`. Attempt logs: 26 Oct 1 (the Stage C test), 27 Oct **1**. Timer inactive.

**Phase 4, Chris's decision.**
- `sudo myc-decide MYC-20261027-001-0003-594f473c9fde approve "proof accepted"`; the state and summary were shown and the task id typed to confirm.
- Owner record `/var/lib/myc-decisions/MYC-20261027-001-0003-594f473c9fde.json` (root:root 0644) written first; then **approved** in `90f0d225`, event 4 blob `c08d8ec3…`.
- `actor chris`, `decided_via fpd-prod:sudo:ct_admin`, `prev_event 594f473c…`, `descriptor_blob 6bad6a1b…`: equal to the owner record field for field.

**Resting state and cleanup.**
- `MYC-20261027-001 approved seq=4`; no `result.md`.
- Grant `claims 1 / max 1`, no longer held. A `claim` attempt was refused ("only a pending task can be claimed (no replay)"): **no resume, no second call.**
- Notifier: nothing outstanding, `MODE=dry-run`, `PIN=` empty, timer inactive; HubSync active.
- Proof allowlist archived to `/root/proof-20261027-001/`; `/etc/myc-stageb/` holds only the original `allowed`. Owner record kept.

**Totals:** 1 model call, 1 email, 1 send attempt, 0 retries, £0 incremental (subscription, extra usage off), no resume. Not done: no other task, no ongoing notifications or timer, no key change, Stage D closed.



## Codex independent evidence check — PASS (27 October 2026)

Reviewed `8b2b0c5f` and the three actual writer commits. The pinned descriptor remains **6bad6a1b708173ceb1e11237bae69d45929379ff** and event 1 remains unchanged. Verified contiguous states pending → in_progress → awaiting_approval → approved, claim binding to descriptor/creation event, request binding to claim/run, and owner decision binding to descriptor/request. The three commits each add only their intended event 0002/0003/0004 in this task.

- Claim blob: `e501b20bd7389148b9af711161f59225c2b3f36f`.
- Request blob: `594f473c9fdef7c44ad498f3ab4064c86095fcab`; matches the exact email pin `MYC-20261027-001-0003-594f473c9fde` and intended question.
- Decision blob: `c08d8ec3d176621c0208962cfcf13fa4acfc4c0b`; approved/proof accepted, actor chris, via fpd-prod:sudo:ct_admin, matching predecessor and descriptor.
- Recorded usage receipt: one Claude Sonnet call, 3 seconds. Git receipt alone is not an independent provider billing audit.
- Host report records one accepted/received pinned email, one attempt, matching root record, refusal of another claim, dry-run/PIN empty/timer off, archived proof allowlist and preserved original grant/history.

**Scope of verification:** Git structure, hashes and commit file scope independently checked through the connector. Codex cannot directly inspect fpd-prod's root owner record, mailbox or provider usage; their confirmation is the sanitized Chris/Claude host report. No extra model/email/host test was made.

**Outcome:** the approved bounded integration proof is accepted. Grant is consumed, task rests approved, no resume or ongoing notifications authorized. Stop here for Chris's next direction; do not repeat this proof.
