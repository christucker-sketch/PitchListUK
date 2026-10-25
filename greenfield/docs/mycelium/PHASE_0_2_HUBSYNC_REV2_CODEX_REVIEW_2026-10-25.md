# HubSync revision 2 independent review — migration passes; host plan changes required

Codex, 25 October 2026. Reviewed Claude commit `9f03a430a408c30ec74f83105f1f4c7016033b3b` on `findpitches-v3/greenfield`. Scope: the existing R1 migration and R2 checked host proposal only. No deployment, service/timer changes, credentials, external model calls or paid APIs.

## Outcome

**R1 PASS. R2 CHANGES REQUIRED.** Missing `.backlog` now means unknown and forces the first full scan. The precise pre-upgrade capped-state regression progresses from one to two results on the first upgraded poll, drains to three, and then resumes the unchanged-remote shortcut.

| Offline validation | Result |
| --- | --- |
| `bash greenfield/mycelium/hubsync/test-hubsync.sh` | 27 passed, 0 failed |
| `test-review-upgrade.sh` migration assertions | 2 passed |
| `bash greenfield/mycelium/hubsync/test-upgrade-hubsync.sh` | 8 passed, 0 failed |
| Stage B `test-stageb.sh` | 48 passed, 0 failed |
| Stage B `test-review-regressions.sh` | 7 passed, 0 failed |
| Stage B `test-review-deadlines.sh` | 2 passed, 0 failed |
| Stage B `test-review-publication.sh` | 3 passed, 0 failed |
| Stage B `sha256sum -c SHA256SUMS` | All 10 entries OK |

Source was retrieved using the connected GitHub actions at the exact reviewed commit and tested locally. The migration harness requires repository history; this workspace is a connector-materialized snapshot. Its local copy replaced only the repository-root lookup and `git show e5887c96:greenfield/mycelium/hubsync/hubsync` with reading that same connector-fetched pinned old file. All fixture, poll and assertion logic was unchanged. Old source SHA256: `e1417ef1bc5cd44380dba1959e9385b444fd02cba23c44b2c124b0c2d6ef128e`. New source: `12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d`. Tests used temporary local Git repositories, fake systemctl and fake model CLIs only; the completed Stage B manual model collaboration was not repeated.

## R2 finding: timer restoration failure reports success

In `greenfield/mycelium/hubsync/upgrade-hubsync.sh`, lines 62–68, `restore_timer` converts a failed timer restart into a successful warning echo. At lines 131–133 the EXIT trap is removed before this function runs, and the script then prints DONE and exits zero. Thus an install can report success while the previously active five-minute watcher remains stopped.

Independently reproduced by extending a local copy of the existing fake-systemctl upgrade harness:
1. In fake systemctl's `start)` branch, insert:
   `if [[ $2 == hubsync.timer && -f $F/fail_timer_start ]]; then exit 1; fi`
2. After existing cases run:
   `reset; touch "$F/fail_timer_start"; r=$(run "$U" install)`
3. Inspect exit status and fake timer state.

Observed:
```
INDEPENDENT timer restart failure: exit=0 timer=inactive
upgrade-hubsync: WARNING: could not restart hubsync.timer; start it by hand: sudo systemctl start hubsync.timer
upgrade-hubsync: DONE: install complete; ...
```
The new expectation `[[ $r != 0 ]]` fails, while all original eight upgrade tests pass.

**Required correction:** propagate restoration failure as nonzero, verify the final timer state, retain clear recovery evidence, and emit DONE only after verified restoration. Add the timer-restart failure case to the maintained offline suite and repin the changed proposal. Do not claim the script can guarantee restoration when systemctl itself refuses it.

## Next actor and boundaries

Claude owns the narrow R2 source/test correction; Codex checks the resulting change. R1 is settled and the Stage B manual proof remains complete. No new project approval is needed for this source/review work. No host approval is requested while R2 fails; any later installation still requires Chris's explicit approval of reviewed exact commands. Stage C live mail and Stage D remain closed.

GitHub connector reads in this session succeeded without an approval prompt; terminal GitHub networking was not used. This supersedes the previous session's tool-availability observation for this session only.
