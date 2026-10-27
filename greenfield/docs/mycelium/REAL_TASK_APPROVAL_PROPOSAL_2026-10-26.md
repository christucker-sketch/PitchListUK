# Real-task approvals: decision request → notice → Chris's recorded decision (Claude, 26 Oct 2026, revision 2)

**Revision 2** answers the [Codex review](REAL_TASK_APPROVAL_CODEX_REVIEW_2026-10-26.md): the suites passed, but the review found three gaps.

- **R1, provenance can be forged through the repository → fixed with root owner records.**
  - `sudo myc-decide` now writes `/var/lib/myc-decisions/<key>.json` **as root on fpd-prod, before anything is published**. The directory and file are root-owned, mode 0755/0644, and not group/world writable.
  - `myc-gate decide <key>` publishes exactly that record, and only that.
  - In **both** readers, an `approved`/`rejected` event counts only if it matches such a record field for field. Otherwise it is QUARANTINE, which keeps the grant held for Chris.
  - Repository writers (agents, or anyone pushing with Chris's GitHub access) cannot create root-owned files on fpd-prod. Codex's exact reproduction, a schema-perfect "approved by chris" pushed through the repo, is now quarantined by writer and notifier. A forged event that contradicts a real record is also quarantined.
  - **GitHub alone is advisory:** any reader without fpd-prod's records, such as Codex's cloud check, sees an unconfirmed decision as quarantined, by design.
- **R2, notifier and writer disagree → fixed by sharing one validator.** The notifier no longer has its own fold. The writer's full validator is embedded **byte-identically** in both scripts (`# >>> myc-fold … # <<< myc-fold`), and `test-fold-parity.sh` fails if they ever differ. `test-decisions.sh` §10 compares writer and notifier verdicts on every fixture task (14), including Codex's 401-byte summary edit: same verdict for all.
- **R3, rollback could falsely report restored → fixed.** Every restore step is checked separately. `myc-gate`, `mycnotify` and `myc-decide` (present with the old hash, or absent) are verified, and the receipt is compared byte for byte. Any miss prints **`INCOMPLETE RECOVERY: <items>`** and the previous copies are kept. A failing `rm`, `install` or `cp` during restore is injected in tests; none claims restoration. A successful `rollback` also compares the receipt byte for byte.
- **Also fixed while testing:**
  - `myc-decide` now refuses a credential-like note *before* writing any record.
  - `decide` reports why a record was refused (for example "writable by others").
- **Evidence:**
  - Against `45b7336f`, the new cases fail R1 (both), R2 (task 125 mismatch) and R3 (all four restore cases).
  - On revision 2, all pass: decisions **33/33**, upgrade **15/15**, parity **1/1**, notifier **31/31**, Stage B **60/60**, HubSync **37/37**.

Answers the [live queue item](../../../team/CURRENT_EXECUTION_ORDER.md). Source and offline tests only. **Nothing is installed**: no host change, credential change, timer, live email or model call.

It extends what exists:

- **`myc-gate`**, the one writer and validator: one new transition in, two decisions out, and one new command;
- **`mycnotify`**: default path, stricter fold, email text;
- **one new root wrapper, `myc-decide`.**

There is no new framework.

**Chris chose the approval method** (26 Oct, in his Claude session): a command on fpd-prod.

## 1. Transitions added (everything else unchanged)

| Transition | Written by | Validator requires (else QUARANTINE) |
|---|---|---|
| `in_progress → awaiting_approval` | `myc-gate complete`, when the runner left `out/decision.md` and no `result.md` | actor `hubsync-gate`; `run_id` = the live claim; `prev_event` = claim blob; `reason` = summary, non-empty, ≤400 bytes, one line |
| `awaiting_approval → approved` / `rejected` | `myc-gate decide`, reachable only through `sudo myc-decide` | actor `chris`; `prev_event` = the awaiting event's blob; `descriptor_blob` = task.json blob; `decided_via` matches `^fpd-prod:sudo:<user>$`; `reason` = note, ≤200 bytes, one line; **and the root owner record for that key states exactly these fields** |

- **Runner output contract:** `out/decision.md` is a regular file (no symlink), ≤1024 bytes, UTF-8, no control bytes, no credential pattern, flattened to one line of ≤400 bytes. Both `decision.md` and `result.md` gives `failed: ambiguous_output`; a bad `decision.md` gives `failed: decision_rejected`.
  - The same lease, deadline and publication bounds as results apply.
  - `myc-agent` does **not** write `decision.md` yet. Teaching it to is a later runner change; it touches the parked v5.1 files and needs the first real model run, so it is separately approved.
- **No execution from approval:**
  - `approved` and `rejected` are resting states. `claim` still requires `pending`, so an approved task cannot be claimed. Resuming work (`approved → in_progress`) is **not implemented** and needs a separately approved change.
  - `decide` never claims, admits or starts anything, and says so in its output.
- **Stage B grant:** `awaiting_approval` holds the grant ("Chris decides"). `approved` and `rejected` count as finished claims and are not held.
- **`myc-gate state`** now also prints the decision key and summary while a decision is outstanding.

## 2. Owner identity and provenance (revision 2: root owner records, see top)

```
sudo myc-decide <decision_key> approve|reject ["one-line note"]
```

- **Checks it makes:** it must run as root on fpd-prod, through sudo from a named account (`SUDO_USER`), in an interactive terminal (stdin is a TTY, so decisions are never scripted).
- **What it does:** it shows `myc-gate state` with the summary and the full blobs, and asks Chris to **type the task id** to confirm. It then writes the root owner record (key, status, note, `decided_via=fpd-prod:sudo:$SUDO_USER`, awaiting-event blob, descriptor blob) and runs `myc-gate decide <key>` as hubsync. An existing record is never changed; an identical retry reuses it.
- **Binding:** `decide` re-reads GitHub under the shared lock. It records only if the key's sequence number **and** event blob are still the current decision, so a stale key is refused and nothing is written. The event binds the descriptor blob and the awaiting event's blob.
- **What it proves (stated plainly):** a decision counts only where a root-owned owner record on fpd-prod states it. Such a record means someone with root on fpd-prod wrote it, normally Chris through `sudo myc-decide` (SSH key + password + terminal + typed confirmation).
  - Repository writers, including agents, **cannot** create one.
  - Anyone who already has root on fpd-prod could. **It is not a cryptographic signature**, and the GitHub event alone proves nothing.
  - No agent has SSH access to fpd-prod: Codex has no host route, and Claude works through Chris.
  - The test overrides (`MYC_TEST`, `MYC_AS_HUBSYNC`, `MYC_GATE`) are dropped by sudo's default environment reset.
- **Why not GitHub identity:** agents push as Chris's account, so GitHub attribution cannot tell him apart (contract review §4).

## 3. Notifier (same pinning, deduplication and ledger)

- **Default path:** now `greenfield/mycelium/tasks`, the real tasks. The Stage C proof used `notify-test/tasks` through an env override.
- **The notifier's view of a task is the writer's validator itself** (the shared block), including owner-record confirmation, read from `/var/lib/myc-decisions` (world-readable, root-written). Revision 1's partial fold is gone.
- **The email** now says how to decide: `sudo myc-decide <key> approve (or: reject)`, and that a decision does not start agent work. "Replying does NOT approve" is kept.
- **Unchanged:** live is still **pinned to one decision** (`PIN=`), 1 per run, 5 attempts per London day, uncertain is never resent, and a total ledger loss means baseline. On the host it stays `MODE=dry-run` with the timer off. Real-task live notification is a separate approval, still one pinned decision.

## 4. Changed files (all under `greenfield/mycelium/`)

| File | sha256 |
|---|---|
| `stageb/myc-gate` (modified; v5 was `a55383f1…`) | `a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7` |
| `stageb/myc-decide` (new) | `7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3` |
| `notify/mycnotify` (modified; installed is `b18edfaa…`) | `b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8` |
| `stageb/upgrade-decisions.sh` (new, checked host step) | `18654aa732cc7239e2ecd44e70ff60c4e06dfce3b80da514967555904e5fb3c9` (rev 2.1; `43f509fe…` stopped on the real receipt format, see below) |
| `stageb/test-decisions.sh`, `stageb/test-upgrade-decisions.sh`, `stageb/test-fold-parity.sh` (new); `notify/test-mycnotify.sh` (fixtures fully writer-valid, including owner records) | in `stageb/SHA256SUMS` and `notify/SHA256SUMS` |

`myc-agent` and `myc-stageb` are untouched, so **v5.1 stays parked and is not installed by this**. HubSync is untouched.

## 5. Offline verification (local bare repos, fake runner output, fake curl, no network)

| Suite | Result |
|---|---|
| `stageb/test-decisions.sh` (new) | **33/33** |
| `stageb/test-upgrade-decisions.sh` (new) | **15/15** |
| `stageb/test-fold-parity.sh` (new) | **1/1** |
| `notify/test-mycnotify.sh` | **31/31** |
| Stage B `test-stageb` / regressions / deadlines / publication | 48 + 7 + 2 + 3, unchanged |
| HubSync `test-hubsync` / `test-upgrade-hubsync` | 27 + 10, unchanged |

`test-decisions` covers:

- decision request → awaiting_approval (no `result.md`, flattened summary, key shown); `complete` idempotent;
- the notifier key equals the decision key on the real path;
- an outstanding decision holds the grant;
- `decide` refuses a missing or foreign via, a wrong blob, a wrong seq, a bad action, and multi-line, over-long or credential-like notes, with nothing pushed;
- approve is bound correctly and the approved task cannot be claimed; a second decide is refused; the decision is no longer outstanding and the grant is released;
- reject is terminal;
- bad runner output: both files, empty, too long, control byte, credential, symlink;
- hand-written agent approval, approval without a via, approval without a request, and a request with the wrong run are all quarantined;
- `myc-decide`: no terminal, wrong confirmation, not via sudo, and the success path recording `fpd-prod:sudo:ct_admin` (driven through `script` for a real pseudo-terminal).

`shellcheck -S warning` is clean for the new or changed scripts, apart from one pre-existing warning in `myc-gate` grant parsing.

## 6. Later exact host step (only after Codex review and Chris's explicit go-ahead)

On fpd-prod, from a folder holding exactly `myc-gate`, `myc-decide`, `mycnotify` and `upgrade-decisions.sh` at the hashes above:

```
sudo bash upgrade-decisions.sh check && sudo bash upgrade-decisions.sh install
# if ever needed:  sudo bash upgrade-decisions.sh rollback
```

**Refuses to start unless:**

- every hash is exactly as listed (bundle and installed: `myc-gate` v5, `mycnotify` `b18edfaa…`, HubSync rev 3);
- the Stage B receipt records `myc-gate`;
- `myc-decide` is absent;
- `mycnotify` is in `MODE=dry-run` with its timer off.

**What it does:**

1. Holds the Stage B, shared-writer and notifier locks.
2. Verifies its backups.
3. Swaps the files, updates the receipt (so `uninstall-stageb.sh` also removes `myc-decide`), and verifies.
4. Post-checks: `myc-gate state MYC-20261025-003` is still `completed` (the existing history validates), and one notifier dry-run poll is clean with nothing quarantined.

Any failure after the swap restores and verifies the previous files and receipt. Logs are kept in `/var/lib/myc-stageb/upgrade-decisions/`.

## Not in this change

- runner support for `decision.md`;
- resuming after approval;
- unpinned or ongoing live notices;
- the notifier timer;
- v5.1;
- model calls;
- Stage D.

Each is a separate later decision.

## Acceptance checklist for Codex (one review)

- [ ] Transitions and validator rules match the contract; forged or edited events quarantine.
- [ ] R1: decisions count only with a matching root owner record on fpd-prod; forgeries pushed through the repository are quarantined. Binding: key = seq + blob, re-read under the lock.
- [ ] R2: one shared validator, byte-identical in both readers; same verdicts on all fixtures.
- [ ] R3: restore verifies every item and the receipt; failures print INCOMPLETE RECOVERY.
- [ ] Approval cannot cause execution; grant handling is correct.
- [ ] Notifier fold, email text and default path; pinning, deduplication and the ledger are unchanged.
- [ ] All offline suites reproduce; `SHA256SUMS` match.
- [ ] The host step is checked and rollback-safe, and leaves v5.1, timers and live mode untouched.

## Host attempt 1 (27 Oct 2026, fpd-prod, run by Chris): STOPPED at `check`, nothing changed

- **What ran:** Chris ran the approved commands with the four pinned files (hashes verified on the host).
- **Every guard passed except one:** HubSync rev 3; notifier dry-run with timer off; installed `myc-gate` = v5 `a55383f1…`; installed `mycnotify` = `b18edfaa…`; `myc-decide` absent.
- **The one that failed:** `check` stopped with "receipt does not record the installed myc-gate". `install` never ran. The receipt and timers were printed afterwards: unchanged, notifier `inactive`, HubSync `active`.
- **Cause (Claude's error):** `install-stageb.sh` writes the receipt as `sha256sum` output prefixed with `cmd `, which has **two spaces** before the name. `upgrade-decisions.sh` matched exactly one space, and the test fixture also used one space, so the tests could not catch it.
- **Fix, rev 2.1, installer only:**
  - the match accepts that format (`^cmd ${GATE_OLD}[[:space:]]+myc-gate$`), and new receipt lines are written in the same two-space format;
  - the test fixture is now generated exactly as `install-stageb.sh` does it, and a new case 0 asserts the format byte for byte;
  - the same suite run against `43f509fe…` fails, reproducing the host stop; rev 2.1 passes **16/16**; shellcheck is clean.
- **Unchanged:** `myc-gate`, `myc-decide` and `mycnotify` (`a74add4e…`, `7e361a4d…`, `b6518029…`). `upgrade-decisions.sh` is now `18654aa732cc7239e2ecd44e70ff60c4e06dfce3b80da514967555904e5fb3c9`.
- **Re-approval needed:** Chris's approval named the exact four files, so the changed installer needs Codex's check of this one delta and Chris's go-ahead on the new hash.

## Host attempt 2: INSTALLED (27 Oct 2026 08:45Z, fpd-prod, run by Chris; approved, Codex PASS on `c91b318a`)

- **Files on the host:** `myc-gate` `a74add4e…`, `myc-decide` `7e361a4d…`, `mycnotify` `b6518029…`, `upgrade-decisions.sh` `18654aa7…`. All match the pins.
- **`check`:** "hashes as expected for check; hubsync rev 3; mycnotify dry-run with timer off"; nothing changed.
- **`install`:**
  - Stage B, shared-writer and notifier locks held;
  - backup verified at `/var/lib/myc-stageb/upgrade-decisions/prev-20261027T084544Z`;
  - files replaced and verified;
  - **post-checks:** `myc-gate` reads existing history (`MYC-20261025-003 completed seq=3`), and the notifier dry-run is ok with **quarantined: none** (hub `1db6037d`);
  - DONE: `myc-gate a74add4e121c`, `mycnotify b65180299e8e`, `myc-decide 7e361a4d60b6`.
- **Receipt:** `cmd a74add4e…  myc-gate`, `cmd 7e361a4d…  myc-decide`; `myc-agent` `3eac7dbb…` and `myc-stageb` `ee1b9bea…` kept (still v5, **v5.1 not installed**).
- **Timers:** `mycnotify.timer` **inactive**, `hubsync.timer` **active**.
- **Log:** `/var/lib/myc-stageb/upgrade-decisions/install-20261027T084544Z.log`. Rollback, if ever needed: `sudo bash upgrade-decisions.sh rollback` from the same folder.

**Now live on fpd-prod (dry run):**
- the writer accepts decision requests and owner decisions;
- `sudo myc-decide` exists;
- the notifier reads the real tasks with the shared validator.

**Not done (each needs a separate approval):**
- no decision has been recorded (`/var/lib/myc-decisions` is created on first use);
- the runner does not yet produce `decision.md`;
- notifier timer off, `MODE=dry-run`;
- no live email, model call, resume or Stage D.

