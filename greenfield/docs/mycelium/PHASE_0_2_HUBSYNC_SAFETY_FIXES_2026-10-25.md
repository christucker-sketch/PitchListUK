# HubSync source-safety fixes — for Codex review (25 Oct 2026, revision 2: R1 + R2)

Author: Claude. Source change and offline tests only. **Not deployed.** No host, service, timer, key, Pi, J1900, Cloudflare, production or V1/V2 change. No model call. This fixes the three real defects in the [completion review](PHASE_0_2_STAGE_B_COMPLETION_REVIEW_2026-10-25.md#review-quality-and-outstanding-evidence). The rejected `$id` concern is not reopened.

| File | Before (deployed source, `34331ec1`) | After |
|---|---|---|
| `greenfield/mycelium/hubsync/hubsync` | `e1417ef1bc5cd44380dba1959e9385b444fd02cba23c44b2c124b0c2d6ef128e` | `12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d` (rev 2; rev 1 was `e5b6da8d…`) |
| `greenfield/mycelium/hubsync/test-hubsync.sh` | `85decb247e22de534f4f382499e051b2099061c96c207d780ba332a965296adf` | `eedd39f2b439cb6ee574200d077f9cd2e9fb5a72c1266fd16305c7e5de8b2aab` |

The "before" hash is the repository source. Confirm it matches `/usr/local/bin/hubsync` on fpd-prod before any install (step 2 below).

## The three fixes

1. **Capped-batch starvation.** After a capped push, `last_seen` became our own commit, so the next poll took the "no change" shortcut and the leftovers waited for an unrelated hub commit. Now `write_and_push` counts the tasks left by the cap, and `state.json` records them as `.backlog`. The shortcut applies only when `remote == last_seen` **and** `backlog == 0`. Old state files have no `.backlog`, so it reads as 0 and behaviour is unchanged until a cap is hit. `hubsync status` now shows `backlog`.
2. **Conditional errexit suppression.** `if write_and_push` switched off `set -e` for every write, stage and commit inside it. Now:
   - it is called plainly, and signals a non-fast-forward through `REJECTED=1` instead of its return code;
   - every write step has an explicit `|| fail`, so failures land in `status.json` as an error and nothing is pushed or counted;
   - `shopt -s inherit_errexit` makes command substitutions fail too;
   - the comment above the function says never to call it as a condition.
3. **Symlink writes, and the matching reads.**
   - **Reads:** task and existing-result content now comes from Git objects at `HEAD` (`ls-tree` / `cat-file`), never through work-tree paths. Only regular-file modes (100644/100755) count as tasks.
   - **Writes:** `results_dir` walks every component of `HUBSYNC_RESULTS` and refuses a symlink or non-directory. It creates missing components itself, no `mkdir -p`. The target file is refused if it is a symlink or not a regular file. The result is written to an `mktemp` file in that directory, then `mv -fT` into place: rename replaces, never follows. Any leftover temp file is removed by the existing `git clean -qfdx` on the next poll.
   - **Fail-closed:** a planted link stops the poll with an error until a human removes it. Nothing is written outside the repository, and the existing outside-results diff guard stays as a second line.

## Evidence (offline, local bare repo, run on Chris's PC Linux VM, bash 5.1.16 / git 2.34.1)

- New regression checks 12–16 added to `test-hubsync.sh`:
  - 12: capped backlog drains with no new hub commit, then returns to the no-change path;
  - 13: a write failure is an error, with nothing pushed or counted, and recovers after unblocking;
  - 14: a symlinked result file is refused, the canary is untouched, and it recovers;
  - 15: a symlinked results directory is refused, with nothing written outside;
  - 16: a symlinked task file is not read through.
- **Old script with the new tests: 22 passed / 5 failed.** Each of the five failures is one of the defects above, so the tests prove the defects.
- **New script: 27/27 pass** (18 original + 9 new).
- **Stage B suites with the new hubsync beside them: 48 + 7 + 2 + 3 = 60/60.** That includes "hubsync poll on the shared clone still works and pushes nothing". The Stage B files are unchanged and their `SHA256SUMS` are untouched.

## Not in scope / for Codex to weigh

- Setting `core.symlinks=false` in the shared clone would remove symlinks from the work tree entirely. It also changes what `myc-gate` sees in that shared clone, so it is **not** done here; raise it separately if wanted.
- Stage C/D, automatic dispatch and the v5.1 install stay closed. Merging this source authorises nothing on the host.

## Revision 2: Codex's review R1 and R2 ([review](PHASE_0_2_HUBSYNC_CODEX_REVIEW_2026-10-25.md))

- **R1 (migration), fixed.** A missing `.backlog` field now means *unknown* (`// -1`), not empty. The first poll after an upgrade does one full scan and records the real value. Codex's [`test-review-upgrade.sh`](../../mycelium/hubsync/test-review-upgrade.sh) is unchanged and now passes both assertions; it failed on rev 1.
- **R2 (checked host plan), done:** [`upgrade-hubsync.sh`](../../mycelium/hubsync/upgrade-hubsync.sh) `check | install | rollback`, replacing the loose commands of rev 1. What it does:
  - asserts the exact old and new sha256 before touching anything;
  - records the timer's prior state and stops the timer;
  - waits until no poll is running;
  - holds the shared writer lock (`/var/lib/hubsync/lock`, the one `hubsync poll` and `myc-gate` take) while it swaps;
  - keeps a verified backup (hash plus `cmp`), then installs and verifies;
  - runs one poll through the unit and checks the unit result, `last_result` and `backlog`;
  - restores the recorded timer state.
  - **Failure handling:** any failure after the swap reinstalls and verifies the previous script, then restores the timer. Every run leaves a log in `/var/lib/hubsync-upgrade/`. `rollback` uses the same checks in reverse. `check` is read-only.
- **Upgrade-script tests:** [`test-upgrade-hubsync.sh`](../../mycelium/hubsync/test-upgrade-hubsync.sh), offline with a fake `systemctl`, **8/8**. It covers read-only check, wrong old/new hash (refused before the timer is touched), install, rollback, poll failure after the swap (previous restored, timer restored), a stopped timer staying stopped, and lock busy (refused, nothing replaced).

### Revision 2 evidence (offline, Chris's PC Linux VM)
HubSync 27/27 · Codex upgrade regression PASS · upgrade script 8/8 · Stage B 48+7+2+3 = 60/60, with Stage B `SHA256SUMS` verified unchanged.

| File | sha256 |
|---|---|
| `hubsync` | `12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d` |
| `upgrade-hubsync.sh` | `9d20b1f85831bc3e33d4e4433f18c259618f93936de2deb185afeb843d2f90bd` |
| `test-upgrade-hubsync.sh` | `ba8fb107855eabe5a77efbe355823a61255d086205f97f50adce5b45962edd14` |
| `test-hubsync.sh` | `eedd39f2b439cb6ee574200d077f9cd2e9fb5a72c1266fd16305c7e5de8b2aab` |
| `test-review-upgrade.sh` (Codex, unchanged) | `5d878472d93019b955ef5ff8ef2fce28fa716dd69019d1d1f4af44b09c7a937f` |

## Proposed host step (only after Codex re-review, then Chris's explicit go-ahead)

On fpd-prod, from a folder holding exactly `hubsync` and `upgrade-hubsync.sh` at the hashes above:
```
sudo bash upgrade-hubsync.sh check      # read-only; must report both hashes as expected
sudo bash upgrade-hubsync.sh install    # checked swap + one poll; restores the timer state either way
# if ever needed:  sudo bash upgrade-hubsync.sh rollback
```
Nothing is requested now.
