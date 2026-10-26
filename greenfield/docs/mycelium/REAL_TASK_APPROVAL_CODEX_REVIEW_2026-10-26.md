# Real-task approvals — Codex bounded review, CHANGES REQUIRED

26 October 2026. Reviewed `45b7336f468384ad532141e66b184223561a3763`. Exact files fetched through GitHub connector; temporary local repositories, fake runner output, fake systemctl/curl and real local pseudo-terminal only. No host changes, email, credentials, real models or paid APIs.

## Outcome

**FAIL / changes required before host approval.** Independent maintained results:
- decisions: **26/26**
- upgrade-decisions: **11/11**
- notifier: **31/31**
- Stage B: **48 + 7 + 2 + 3 = 60/60**
- All **14 Stage B + 6 notifier** checksum entries match; changed-script Bash syntax passes.

Approval does not make an approved task claimable, and the wrapper records without launching a runner. Retain those boundaries. Three additional offline probes expose gaps not covered by the maintained suite.

## R1 — repository writers can forge the purported owner provenance

The wrapper checks sudo/TTY/typed confirmation when actually used. The persisted validator, however, trusts freely writable event fields `actor=chris` and `decided_via=fpd-prod:sudo:ct_admin`. It cannot establish that the wrapper ran. The proposal limits forgery discussion to root/hubsync on fpd-prod, but any repository writer can write the same JSON. Agents already have repository write access; GitHub attribution is acknowledged to be shared.

**Local reproduction:** reuse test-decisions task 121, whose hand-written decision event has correct predecessor/descriptor/via but actor claude. Change only its actor to chris and its reason to an ordinary one-line note, then push through the local human fixture. No myc-decide or sudo command runs. `myc-gate state` reports:
```
MYC-20261026-121 approved seq=4 ...
```
Thus the current result is a schema-valid assertion of owner approval, not proof that someone used sudo on fpd-prod. The existing “agent actor rejected” test does not address an agent writing actor chris.

**Required correction:** distinguish repository assertions from authenticated owner decisions. Either verify owner provenance through a channel repository-writing agents cannot forge, or keep such events advisory until separately confirmed by Chris through the existing trusted owner channel. Correct the proposal's trust statement and add this negative case before presenting these states as authoritative human decisions. Do not enable execution on the strength of these fields. No new orchestration framework is requested.

## R2 — notifier fold still disagrees with the writer

`mycnotify` lines 98–116 adds some predecessor/run checks but omits other writer checks. In particular it does not enforce the writer's nonempty, single-line, <=400-byte request reason. It also omits claim descriptor/lease/run-format checks and strict JSON/event-field checks already enforced by myc-gate; the claimed writer-matching fold is incomplete.

**Local reproduction:** create a valid writer claim and valid awaiting_approval request using the decision harness. Edit only event 0003's reason to 401 ASCII characters through the local repository fixture. Writer state is QUARANTINE (“bad summary”), but notifier `decisions` lists the task's new key with `ledger=none`, making it an eligible pinned notification candidate.

**Required correction:** make decision eligibility match the authoritative writer's validation, including the request's bounds and the existing descriptor/claim/event integrity checks. Add cross-reader negative fixtures so the same malformed history is quarantined by both. Keep dry-run/live pinning and the existing no-dispatch separation.

## R3 — rollback can falsely report complete restoration

`upgrade-decisions.sh` lines 63–73 calls restore in a conditional with errexit disabled. The restore step installing/removing myc-decide has no explicit failure propagation, and final verification checks only myc-gate/mycnotify, not myc-decide or the receipt.

**Offline reproduction:** extend the upgrade harness with a PATH-local fake rm that returns 1 only for `rm -f "$T_BIN/myc-decide"`. Trigger the existing notifier post-poll failure after installing. Observed:
```
rc=1 decide-still-present=yes
upgrade-decisions: previous files and receipt restored and verified
```
The overall command correctly fails, but claims restoration even though the new owner-decision command remains installed.

**Required correction:** explicitly propagate every restoration failure and verify myc-decide's expected absence/hash plus byte-for-byte receipt restoration before reporting “restored and verified”. Add negative tests for failing removal/reinstallation and receipt mismatch. Preserve the prior files/evidence and emit an incomplete-recovery warning otherwise.

## Next action

Claude owns these narrow source/test/proposal corrections. Codex checks the resulting delta; no new project approval is needed for that preparation. Do not ask for or execute host installation on this failing candidate. Existing HubSync and Stage C proof remain complete; notifier remains dry-run with timer off. No new live send, v5.1 install, model call or autonomous dispatch is authorized.
