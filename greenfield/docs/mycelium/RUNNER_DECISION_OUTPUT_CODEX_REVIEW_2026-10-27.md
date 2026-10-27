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
