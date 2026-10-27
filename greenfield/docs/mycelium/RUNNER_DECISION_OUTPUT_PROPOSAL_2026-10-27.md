# Runner decision output (v6): patch, offline evidence, checked host step (Claude, 27 Oct 2026, revision 2)

**Revision 2** fixes the one [Codex finding](RUNNER_DECISION_OUTPUT_CODEX_REVIEW_2026-10-27.md): 99 checks passed, R1 found NUL lost before validation.

- **The bug:** the question was captured with `t=$(awk …)`, and Bash silently drops NUL. A malformed answer therefore became a clean, different question and was published.
- **The fix:**
  - any NUL in an envelope answer now fails closed (`runner_failed`, no output file), counted with `tr -dc '\000' | wc -c`, so no bytes are captured in a shell variable;
  - the question is extracted **file to file** (awk → `decision.tmp` → rename), so the gate validates exactly the model's bytes;
  - prohibited bytes are never normalised.
- **New regressions (section 6b):**
  - Codex raw NUL → `runner_failed`, no `awaiting_approval`;
  - Claude JSON-escaped `\u0000` → the same;
  - NUL in an ordinary result → the gate's `result_rejected` (legacy path unchanged).
  - Against `ffd0230b`, both provider cases fail exactly as Codex observed (`awaiting_approval`, reason "Approve this?").
- **Results:** runner chain **29/29**, installer 13/13, Stage B 48 + 7 + 2 + 3.
- **Hashes:** `myc-agent` is now `d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6`, and `upgrade-runner.sh` is repinned to `6d5e33a7f36ecf4b14050b0a5f9fac703d0df6def4ce3b06a5aa168d33c43ed6`. `myc-stageb` is unchanged (`c636582c…`).

Delivers the [runner plan](RUNNER_DECISION_OUTPUT_NEXT_STEPS_2026-10-27.md). Source and offline only: **nothing installed**, no CLI/model call, no email, no credentials. It reuses the installed `myc-gate`, `myc-decide` and `mycnotify` unchanged.

## Output contract (one, explicit; not a keyword heuristic)

The provider transport is parsed first: Claude's `out.json` `.result`, or Codex's `-o` answer file. The **answer text** is then exactly one of:

- **a decision request,** only if the whole answer (ignoring surrounding blank lines and CRs) is exactly two lines:
  ```
  MYCELIUM-DECISION-REQUEST v1
  <one-line question for Chris>
  ```
  This becomes `out/decision.md`, containing the second line.
- **an ordinary result,** if the marker string does not appear anywhere. This becomes `out/result.md`, unchanged from today.

**Any other use of the marker** (empty question, extra lines, another version, the marker inside a result, the marker twice) **fails closed**: no output file, and the gate records `runner_failed`.

**Exactly one file, never both.** Files are written via a temp file and rename.

**`myc-gate` stays the final validator** of `decision.md` (≤1024 bytes; one line of ≤400 bytes after flattening; clean UTF-8; no credential pattern), and its existing codes apply. Nothing in the runner can record a decision or start work.

**The prompt** gains two lines describing the envelope ("if, and only if, the task cannot be finished without a decision from Chris…").

**No opt-in flag:** a decision request only *pauses* the task for Chris, holding the grant until he decides. That is strictly safer than a result, so legacy tasks need no new authority and the five-field descriptor and admission path are unchanged.

## v5 / v5.1 accounting

| File | Installed on fpd-prod | This candidate |
|---|---|---|
| `myc-agent` | v5 `3eac7dbb…` | **v6** `d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6` = reviewed v5.1 (stdin from `/dev/null` for every CLI) + decision output |
| `myc-stageb` | v5 `ee1b9bea…` | **v5.1** `c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a`, the reviewed file, **byte-unchanged** |
| `myc-gate`, `myc-decide`, `mycnotify` | `a74add4e…`, `7e361a4d…`, `b6518029…` | unchanged (asserted, never touched) |

v5.1 is deployed **deliberately**, not silently:

- its terminal fix is the confirmed root cause of task 002's failure and of 003's first stop;
- the decision path only matters for a later real run, which would hit the same hang under v5;
- `myc-agent` has to change anyway, and it is v5.1-based.

`myc-stageb` gets only its reviewed v5.1 `</dev/null` lines.

## Offline acceptance (local bare Git, fake codex/claude CLIs, fake curl, a real pseudo-terminal for `myc-decide`; no network/model/mail)

The new `stageb/test-runner-decisions.sh` passes **29/29** (revision 2: 26 + three NUL cases). It drives **real `myc-stageb` → `myc-gate` → `myc-agent` → `mycnotify` → `myc-decide`** end to end:

| Plan case | Covered by |
|---|---|
| Ordinary answer, both providers | `result.md` only → `completed`, content unchanged |
| Explicit decision, both providers | `decision.md` only → `awaiting_approval` bound to the claim's run; one call each |
| Notification selection | notifier lists exactly the gate's keys; dry run records, no send; pinned fake send exactly once, naming `sudo myc-decide <key>`; rerun sends nothing |
| Owner approve / reject | via `myc-decide` (pseudo-terminal): owner record written, matching decision published and validated; reject terminal |
| Resting state | approved/rejected → `myc-stageb` refuses to claim; **no second model call**; nothing outstanding |
| Absent / forged records | decide without a record refused; approval pushed through the repo quarantined by writer and notifier |
| Invalid / ambiguous | empty question, extra line, other version, marker in result, marker twice → `runner_failed`, no output file; over-long, control-byte or credential question → `decision_rejected` by the gate; transport error (both providers) → `runner_failed`, nothing written |
| Replays | runner rerun → "already started once", no call; `complete` rerun → nothing published; notifier rerun → no mail |

**The same suite against the previous `myc-agent` fails the decision cases**: it publishes the envelope as a result.

**Regression:**

| Suite | Result |
|---|---|
| Stage B (`test-stageb`, uses the repo runner) | 48/48 |
| Regressions / deadlines / publication | 7 + 2 + 3 |
| Decisions | 33/33 |
| Validator parity | 1/1 |
| Notifier | 31/31 |
| `shellcheck -S warning` | clean |

**Stated plainly:** one `test-stageb` run gave 47/48; the next six runs were 48/48. The flake is in an existing check (I did not capture which), and nothing in this change touches timing. HubSync suites were not rerun (no change there). This is local-fixture evidence, not a host or provider audit.

## Checked host step (only after Codex review and Chris's explicit go-ahead)

`stageb/upgrade-runner.sh` `check|install|rollback`: sha256 `6d5e33a7f36ecf4b14050b0a5f9fac703d0df6def4ce3b06a5aa168d33c43ed6`. Its offline test, `test-upgrade-runner.sh`, passes **13/13**.

**Refuses unless all of these hold:**

- the bundle files are exactly the hashes above;
- the installed files are the v5 `myc-agent` and `myc-stageb`;
- `myc-gate`, `myc-decide`, `mycnotify` and HubSync are exactly as installed;
- the receipt (real two-space format, as printed on fpd-prod 27 Oct) records v5 `myc-agent` / `myc-stageb` and the installed `myc-gate` / `myc-decide`.

**What it does:**

1. Holds the Stage B lock.
2. Verifies its backups.
3. Swaps the files, updates the receipt lines (keeping `myc-gate` and `myc-decide`), and verifies.
4. **Post-checks with no CLI or model call:** syntax; `myc-agent` (as myc) rejects a bad run id; `myc-stageb` rejects a bad task id; `myc-gate state MYC-20261025-003` still `completed`; the other commands unchanged.

**On failure:** it restores and verifies everything, or prints `INCOMPLETE RECOVERY: <items>`.

**Commands,** on fpd-prod from a folder holding exactly `myc-agent`, `myc-stageb` and `upgrade-runner.sh`:

```
sudo bash upgrade-runner.sh check && sudo bash upgrade-runner.sh install
# if ever needed:  sudo bash upgrade-runner.sh rollback
```

## Not in this change

- no real model proof;
- no new task;
- no Stage B grant change;
- no notifier timer or live mode;
- no resume after approval;
- no Stage D.

A single real end-to-end proof, if wanted later, is a separate pinned proposal.

## Checklist for Codex (one review)

- [ ] The contract is explicit and fail-closed; exactly one output file; the gate remains the final validator.
- [ ] Both providers; transport parsed before the envelope; legacy results unchanged.
- [ ] Full fake chain through `awaiting_approval` → owner approve/reject → no resume or second call.
- [ ] v5 → v6 / v5.1 deployment is explicit and minimal.
- [ ] The host step is checked, uses real installed hashes and receipt format, makes no model call and recovers truthfully.
