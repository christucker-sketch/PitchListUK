# Real-task approvals: decision request → notice → Chris's recorded decision (Claude, 26 Oct 2026). For one Codex review

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
| `awaiting_approval → approved` / `rejected` | `myc-gate decide`, reachable only through `sudo myc-decide` | actor `chris`; `prev_event` = the awaiting event's blob; `descriptor_blob` = task.json blob; `decided_via` matches `^fpd-prod:sudo:<user>$`; `reason` = note, ≤200 bytes, one line |

- **Runner output contract:** `out/decision.md` is a regular file (no symlink), ≤1024 bytes, UTF-8, no control bytes, no credential pattern, flattened to one line of ≤400 bytes. Both `decision.md` and `result.md` gives `failed: ambiguous_output`; a bad `decision.md` gives `failed: decision_rejected`.
  - The same lease, deadline and publication bounds as results apply.
  - `myc-agent` does **not** write `decision.md` yet. Teaching it to is a later runner change; it touches the parked v5.1 files and needs the first real model run, so it is separately approved.
- **No execution from approval:**
  - `approved` and `rejected` are resting states. `claim` still requires `pending`, so an approved task cannot be claimed. Resuming work (`approved → in_progress`) is **not implemented** and needs a separately approved change.
  - `decide` never claims, admits or starts anything, and says so in its output.
- **Stage B grant:** `awaiting_approval` holds the grant ("Chris decides"). `approved` and `rejected` count as finished claims and are not held.
- **`myc-gate state`** now also prints the decision key and summary while a decision is outstanding.

## 2. Owner identity and provenance

```
sudo myc-decide <decision_key> approve|reject ["one-line note"]
```

- **Checks it makes:** it must run as root on fpd-prod, through sudo from a named account (`SUDO_USER`), in an interactive terminal (stdin is a TTY, so decisions are never scripted).
- **What it does:** it shows `myc-gate state` with the summary, asks Chris to **type the task id** to confirm, then runs `myc-gate decide` as hubsync with `MYC_DECIDED_VIA=fpd-prod:sudo:$SUDO_USER`.
- **Binding:** `decide` re-reads GitHub under the shared lock. It records only if the key's sequence number **and** event blob are still the current decision, so a stale key is refused and nothing is written. The event binds the descriptor blob and the awaiting event's blob.
- **What it proves (stated plainly):** someone with sudo on fpd-prod (Chris's SSH key plus password) ran the command in a terminal. Anyone already running as root or hubsync on fpd-prod could forge `MYC_DECIDED_VIA`. **It is not a cryptographic signature.**
  - No agent has SSH access to fpd-prod: Codex has no host route, and Claude works through Chris.
  - The test overrides (`MYC_TEST`, `MYC_AS_HUBSYNC`, `MYC_GATE`) are dropped by sudo's default environment reset.
- **Why not GitHub identity:** agents push as Chris's account, so GitHub attribution cannot tell him apart (contract review §4).

## 3. Notifier (same pinning, deduplication and ledger)

- **Default path:** now `greenfield/mycelium/tasks`, the real tasks. The Stage C proof used `notify-test/tasks` through an env override.
- **Fold now mirrors the writer** for claim, decision-request and decision events: actor, run, predecessor, descriptor and `decided_via`.
  - **Found while testing:** a *hand-written* `awaiting_approval` with the wrong run used to count as outstanding in the notifier, though `myc-gate` quarantines it. It now quarantines in the notifier too, so it can never be mailed.
- **The email** now says how to decide: `sudo myc-decide <key> approve (or: reject)`, and that a decision does not start agent work. "Replying does NOT approve" is kept.
- **Unchanged:** live is still **pinned to one decision** (`PIN=`), 1 per run, 5 attempts per London day, uncertain is never resent, and a total ledger loss means baseline. On the host it stays `MODE=dry-run` with the timer off. Real-task live notification is a separate approval, still one pinned decision.

## 4. Changed files (all under `greenfield/mycelium/`)

| File | sha256 |
|---|---|
| `stageb/myc-gate` (modified; v5 was `a55383f1…`) | `610895b8ea937e74f08e41cd16c0008c63142bf1910ba3af5ed189d50c224aac` |
| `stageb/myc-decide` (new) | `a6dd86cb7956ce420c4cfaa6bf07f2ed667871f0c13e6ac89226fc84c75626f1` |
| `notify/mycnotify` (modified; installed is `b18edfaa…`) | `e87301fcde1d4297f7c5badfde35a4e175d3411ba180fd1c6cfe9484a4219bae` |
| `stageb/upgrade-decisions.sh` (new, checked host step) | `f54cbe79693387b5428ecbe8480eb71e22613190aba258c5f285973927fd80d9` |
| `stageb/test-decisions.sh`, `stageb/test-upgrade-decisions.sh` (new); `notify/test-mycnotify.sh` (fixtures now writer-shaped, plus a forged-request case) | in `stageb/SHA256SUMS` and `notify/SHA256SUMS` |

`myc-agent` and `myc-stageb` are untouched, so **v5.1 stays parked and is not installed by this**. HubSync is untouched.

## 5. Offline verification (local bare repos, fake runner output, fake curl, no network)

| Suite | Result |
|---|---|
| `stageb/test-decisions.sh` (new) | **26/26** |
| `stageb/test-upgrade-decisions.sh` (new) | **11/11** |
| `notify/test-mycnotify.sh` | **31/31** (30 + forged request) |
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
- [ ] Decision identity and binding (sudo + TTY + typed confirmation, key = seq + blob, re-read under the lock) are acceptable, with the stated limits.
- [ ] Approval cannot cause execution; grant handling is correct.
- [ ] Notifier fold, email text and default path; pinning, deduplication and the ledger are unchanged.
- [ ] All offline suites reproduce; `SHA256SUMS` match.
- [ ] The host step is checked and rollback-safe, and leaves v5.1, timers and live mode untouched.
