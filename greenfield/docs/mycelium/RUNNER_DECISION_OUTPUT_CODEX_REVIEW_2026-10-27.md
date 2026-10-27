# Runner v6 revision 2 — Codex follow-up PASS

27 October 2026. Reviewed `31ea8313158e24b88c96e9d0311defd05f307308`, limited to the NUL correction and repinning.

**R1 resolved / PASS.** The decoded answer file is checked for NUL before shell capture; decision extraction now writes directly from awk to decision.tmp and renames it. A NUL cannot disappear from a Bash variable before validation because the question no longer passes through one.

Independent exact-revision offline checks:
- runner chain **29/29 PASS**, including Codex raw NUL and Claude JSON-escaped NUL: runner_failed, no awaiting_approval and no output file; ordinary-result NUL still result_rejected;
- upgrade-runner **13/13 PASS**, including guard/lock/rollback/recovery behavior;
- all **18 Stage B checksum entries match**;
- changed-script Bash syntax passes.

All execution used temporary local Git, fake provider CLIs/curl and owner-record fixtures. The preceding review independently passed the 60-check Stage B baseline; that baseline was not unnecessarily rerun for this narrow correction. Source change is confined to answer conversion and updated candidate pins/tests. Existing installed gate/owner-decision/notifier infrastructure is untouched.

## Ready for owner decision — not installed

Proposed host deployment on fpd-prod from a folder containing the exact three files from `31ea8313`:
```bash
sudo bash upgrade-runner.sh check &&
sudo bash upgrade-runner.sh install
```

| File | SHA256 |
| --- | --- |
| myc-agent (v6) | d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6 |
| myc-stageb (reviewed v5.1) | c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a |
| upgrade-runner.sh | 6d5e33a7f36ecf4b14050b0a5f9fac703d0df6def4ce3b06a5aa168d33c43ed6 |

This deliberately upgrades the installed v5 runner to v6 and the installed v5 orchestrator to the previously reviewed v5.1 stdin-detachment version. It checks installed hashes/real receipt format, holds the Stage B lock for replacement, verifies backups/files/receipt and post-checks without real provider CLI/model invocation. Rollback/recovery keeps evidence and reports incomplete recovery truthfully.

**Next actor: Chris**, approve or defer those concrete host commands. Previous approvals for the decision infrastructure do not authorize this new runner deployment. If approved, Claude coordinates the existing Chris-operated host workflow and records actual hashes, receipt/post-checks, unchanged supporting commands and log path.

No real task creation/model proof, live notification, timer enablement, key change, grant reset, resume-after-approval or Stage D is authorized by this review or proposed installation. A later real proof, if wanted, remains separately scoped. Notification stays dry-run with timer off.

No host, credential, mail or real model/API changes by Codex.

---

## Revision 1 review (historical; R1 resolved above)

# Runner decision output v6 — Codex review, one correction required

27 October 2026. Reviewed `ffd0230bf694e7b7da0896c9e7e50f4d39c23536`. **CHANGES REQUIRED** on the new answer-to-decision conversion; no host approval requested on this candidate.

## Independent results

Exact files fetched through GitHub connector. Temporary local Git, fake Codex/Claude CLI executables and curl, owner-record fixtures and local pseudo-terminal only. No real provider CLI/model, SMTP2GO request, credential or host operation.

| Offline suite | Result |
| --- | --- |
| full runner decision chain | 26/26 |
| upgrade-runner | 13/13 |
| Stage B maintained | 48/48 |
| regressions / deadlines / publication | 7/7 + 2/2 + 3/3 |

**99 maintained checks PASS.** All **18 Stage B checksum entries** match; changed-script Bash syntax passes. No repeated runs were needed; the reported earlier 47/48 flake did not reproduce in this run.

The explicit two-line envelope, provider-transport separation, legacy result path, no execution from approval and deliberate v5-to-v6/v5.1 dependency are within the requested source scope. Keep the pinned host upgrade proposal and existing installed gate/notifier untouched while correcting the conversion.

## R1 — Bash silently removes NUL before the writer can validate

In `myc-agent` lines 89–93, the decision question is captured with `t=$(awk ...)`. Bash variables cannot contain NUL bytes: command substitution warns and drops them. Thus malformed answer bytes can turn into a clean, different question, bypassing the writer's control-byte rejection.

**Isolated reproduction using the exact emit function:**
```bash
printf 'MYCELIUM-DECISION-REQUEST v1\nApprove\0 this?\n' > "$answer"
emit "$answer"
```
Observed warning: `command substitution: ignored null byte in input`; emit returns 0; decision.md contains only `Approve this?\n`.

**Full-chain confirmation:** used the setup/helpers of test-runner-decisions.sh with a new temporary fixture MYC-20261027-099, assigned to fake Claude. Wrote the bytes above directly into the fake answer file with printf (not through a shell variable), then ran real myc-stageb → gate → runner → complete. The fake Claude transport encodes the byte as JSON `\u0000`; jq recreates it before emit. Observed:
```
MYC-20261027-099 awaiting_approval seq=3
summary: Approve this?
{"status":"awaiting_approval","reason":"Approve this?"}
```
This should fail closed, not publish an approval request. The maintained bell-control-byte test passes because Bash preserves that byte; it misses NUL specifically.

**Required narrow fix:** preserve raw question bytes through file-based extraction until clean-text validation, or explicitly reject NUL before any Bash command substitution can erase it. Keep the gate as the final publication validator; do not silently normalize prohibited bytes. Add both provider-path regressions (Codex raw answer and Claude JSON escaped NUL) that assert no awaiting_approval event is published; a fixed failure code is sufficient. Preserve legacy output and one-file semantics. Repin runner/installer and rerun affected suites.

No new framework or plan round is needed. Codex will check this one delta. Source/offline correction needs no new project approval. Host deployment remains a later concrete candidate approval; no real task, model proof, mail, grant reset, automatic resume or Stage D is authorized.
