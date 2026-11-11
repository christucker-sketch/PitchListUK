# MYC-P0 fifth live proof (`myc-p0-live-5`): result, 11 Nov 2026

**What ran:** run by Chris on fpd-prod under DECISIONS `MYC-P0-FIFTH-ATTEMPT-GRANT-2026-11-11`. Runtime 31d043fc; `live-5-command.sh` (`22c74b4c…`) extracted from a01dedb7, hash-checked, run detached.

**Evidence:**
- Raw evidence is private on fpd-prod (`/var/tmp/myc-p0-live5-a`), with a copy on Chris's PC.
- Sanitised: `evidence/live-5-2026-11-11/`. Secrets scan clean.

## Outcome: MECHANICAL CRITERIA PASS (6/6), first time. Substance needs Codex's independent review.

| Criterion | Result |
|---|---|
| overlappingCalls | **true**: callOverlapMs 77,060; both turns `active-turn`, `completed` (Codex 79.7 s, Claude 82.5 s) |
| reactionEachDirection | **true**: 38, 51, 65 mid-session |
| changedByOther | **true**: 38 (Claude's fix, caused by Codex's plan and challenge chain) |
| sharedTestsPass | **true**: newest integration 9a14d89b, fixed **and** supplemental PASS in-session (seq 61); also 20 and 46 |
| noStop | **true**: no stop; both agents finished themselves |
| noWorkerFailure | **true**: codex exit 0 (81.3 s), claude exit 0 (90.4 s) |

**Limits:**
- Session 90.4 s of 300; broker exit 0. Watchdog: not fired, **CLEAN** (0/0/0/0).
- Grants 8/8.
- **Usage** (no lower bounds; both turns completed), total (fresh):
  - Claude 152,229 (32,447);
  - Codex 182,501 (49,765);
  - combined **334,730 total / 82,212 fresh**.
- All far under the stops.

## Substance (preliminary, Claude)

1. Codex states its plan and counterexamples (10).
2. **Claude implements first, with tests** (13, a93a7312): fixed and supplemental PASS (20).
3. **Codex reviews Claude's code and challenges two real defects** (35): anchors inside comments and scripts are extracted, and `title="note href='/wrong'"` spoofs the href.
4. **Claude fixes the first** (38, bc9a80d8, PASS at 46). Claude **explicitly hands the second to Codex to avoid conflicting edits**, keeping its tests (51).
5. **Codex acknowledges, keeps Claude's change, and implements a real attribute scanner** with Unicode and first-href regressions (55 → 59, 9a14d89b, PASS at 61).
6. Claude's further submission was refused as stale (64, base protection). Claude read the inbox (68), saw Codex's integrated work, and finished.
7. **Native behaviour now observed:**
   - Codex's steering intake paused at its delivery limit (44, 45 s). Codex then referenced Claude's reply (51, 49.9 s) and the test result (61, 68.6 s) in its finding 65, both after the pause, which is consistent with the new `myc_inbox` tool. The adapter publishes no per-read note for Codex, so this is inferred, not logged.
   - Claude used `myc_inbox` repeatedly (30, 52, 68).
   - Stale-base recovery: refusal, then reread via inbox, then a clean finish.
   - Both agents finished on their own, well inside the advisory 3 minutes.
8. **Post hoc**, offline and sandboxed: fixed 6/6. The agents' test files `frontier.test.mjs` (Claude) and `attributes.test.mjs` (Codex) both pass. They are assertion scripts, so each counts as one `node --test` test.

**Not shown here:** delta reads were not exercised (no `sinceIntegration` use observed), and no budget refusal occurred.

**Claude's view:** this is the first run that meets every mechanical criterion **and** shows the substantive pattern: overlapping work, challenge, an agreed split, peer-caused changes, contributions from both integrated and tested in-session, and a clean self-finish. Codex's independent review decides whether MYC-P0 is accepted.
