# Real-task approvals revision 2 — Codex follow-up PASS

27 October 2026. Reviewed `9ac668e5816a05dca96513667c5b9b6147ef2bf2`, limited to the R1–R3 corrections and their integration with existing offline suites.

**R1–R3 PASS.** Exact revision retrieved through connected GitHub actions. Independent offline results:

| Suite | Result |
| --- | --- |
| decisions | 33/33 |
| upgrade-decisions | 15/15 |
| validator block parity | 1/1 |
| notifier | 31/31 |
| Stage B maintained + regression + deadline + publication | 48+7+2+3 = 60/60 |

All **15 Stage B + 6 notifier** manifest entries match. Changed-script Bash syntax passes. Tests use temporary local repositories, fake runners/curl/systemctl and local pseudo-terminals only. HubSync source is unchanged and its completed review/proof was not reopened.

- **R1 provenance:** the root wrapper writes a local owner record before publication. Both readers require matching status, note, via, predecessor and descriptor from that record, with root ownership/non-writability checks outside the offline test mode. Repository-only forged owner decisions, conflicting records and writable records are refused/quarantined. Offline tests intentionally relax UID ownership for fixtures; this is source/offline acceptance, not a deployed host ownership audit. Root on fpd-prod remains trusted; GitHub alone is advisory, and readers lacking the owner records quarantine the decision. Approval still does not make a task claimable or launch work.
- **R2 parity:** the 128-line validator block is byte-identical in writer/notifier (block SHA256 prefix `09329abd6c07`). Fixtures compare reader verdicts, including the previously accepted 401-byte request; malformed histories now quarantine in both.
- **R3 restore:** every restore operation propagates failure; verification covers myc-decide presence/absence/hash and the receipt byte for byte. Injected rm/install/cp failures report INCOMPLETE RECOVERY and never falsely claim verified restoration.

## Concrete next owner decision — not executed or authorized yet

On fpd-prod, in a folder holding the exact reviewed `myc-gate`, `myc-decide`, `mycnotify` and `upgrade-decisions.sh` from `9ac668e5`:

```bash
sudo bash upgrade-decisions.sh check &&
sudo bash upgrade-decisions.sh install
```

| File | SHA256 |
| --- | --- |
| myc-gate | a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7 |
| myc-decide | 7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3 |
| mycnotify | b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8 |
| upgrade-decisions.sh | 43f509fef094b693fb31ad25bd60586829995c233c34ac4567d48a4a1fb2b43a |

The proposed upgrade replaces myc-gate/mycnotify, adds myc-decide and updates the installation receipt; it checks existing task history and performs a notifier dry-run. It requires the expected installed versions, notification dry-run mode and timer off, locks the relevant writers during replacement, and keeps verified backups/recovery logs. It does not install the parked v5.1 runner files, enable timers, alter keys/configuration, send email or invoke models.

**Next actor: Chris**, decide whether/when to approve those exact host commands. Previous HubSync and Stage C approvals do not authorize this new upgrade. If approved, Claude coordinates the existing Chris-operated host workflow and returns actual hashes, post-check output, timer/mode and log evidence. No fresh email or model test is needed. Real-task live notification, runner decision-output support, resume-after-approval and Stage D remain outside this approval.

No host, credential, live email or real model/API changes by Codex.

---

## Revision 1 review (historical; R1–R3 resolved above)

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
