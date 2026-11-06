# MYC-P0 second live proof (`myc-p0-live-2`): result, 6 Nov 2026 (one attempt)

**What ran:** run by Chris on fpd-prod under the 6 Nov grant (DECISIONS `MYC-P0-SECOND-ATTEMPT-GRANT-2026-11-06`). Runtime fd4cc719; Codex-accepted command `live-2-command.sh` (`92417fa5…`), extracted from hub ref 876e8aa9 and run detached.

**Evidence:**
- Raw evidence stays private on fpd-prod (`/var/tmp/myc-p0-live2-20261106-a`), with a copy on Chris's PC (`myc-live2-evidence.tgz`, 17,545 bytes).
- Secrets scan: clean.
- Sanitised review summary by Claude; Codex reviews independently.

## Outcome

**MECHANICAL: FAIL. One attempt used; not rerun.** Four of six criteria passed in-session:

| Criterion | Result |
|---|---|
| overlappingCalls | **true**: callOverlapMs 151,336 (both turns active-turn, CLI-confirmed) |
| reactionEachDirection | **true**: seq 18, 27 (Claude→Codex), 35, 38 (Codex→Claude) |
| changedByOther | **true**: Codex's implementation commit 38 references Claude's 18 and 35 |
| sharedTestsPass | **true**: fixed checks PASS on 80f1a00a (seq 41) and on the **newest** integration ee558a26 (seq 56); `finalIntegration.tested:true, ok:true` |
| noStop | false |
| noWorkerFailure | false: Codex exited 1 at 156.2 s, and the pair stopped |

**Limits:**
- Wall time 161 s of 600; watchdog not fired, CLEAN (0/0/0/0).
- Grants 12/12.
- Usage, total (fresh):
  - Claude 77,802 (22,258);
  - Codex 178,434 (39,042).
- Both well under the 300k fresh per-agent cap.

## Why it failed

- **L1: the Codex context budget ended the session.** Codex adapter: `context byte budget exhausted; no silent truncation`, at `consume` from the `myc_read` reply path (codex-app-server.mjs:160).
  - The 24 KB `maxContextBytes` is cumulative for the whole turn: prompt, steers and every read reply.
  - The integration grew to about 6.8 KB of artifact files, so repeated full reads used it up.
  - A *read* reply overflowing is treated as fatal for the worker, so the pair stopped.
  - This is the risk Claude flagged on 4 Nov.
- **L2: Claude's own contribution never landed.**
  - At 144.8 s, Claude's submission (its test file) was refused as stale: it was written against 0a12b477 while Codex had moved integration to ee558a26. The base protection worked as designed.
  - The session stopped 11 s later, before Claude reread and reconciled.
  - The refused content isn't kept, since the coordinator refuses before committing.
  - So "substantive contributions from both" is shown only as Claude's influence on Codex's implementation (18, 27 → 35 → 38), not as integrated Claude code or tests.
- **L3: the shared test command runs only the six fixed checks.** Codex noted this itself at seq 64. Agents' own tests under `artifact/` (e.g. Codex's `parser-regressions.test.mjs`) are not executed in-session.
- **L4 (mine): Claude's in-turn usage undercounts output.**
  - Stream-json assistant events carry usage from the start of each message: Claude's snapshot shows `outputTokens:166` after long written output.
  - The final per-turn `result` would correct it, but the turn was cut off.
  - Claude's fresh figure is therefore a lower bound.

**Observations (not defects):**
- Claude took in its four queued stdin deliveries only at 144.9 s (`stdin-ack` 41–94 s). It was in one long generation and reads stdin only between model steps. It also read the inbox via its tool at 28.7 s.
- Codex found and fixed two bugs in its own code (53→54) and reported a third (82).

## Substance (preliminary, Claude; Codex to review)

- **Real division of labour, negotiated live:**
  - Codex announced its plan (10).
  - Claude proposed semantics (13) and took the tests, with eight concrete parsing challenges for the implementation (18).
  - Claude asked about self-links (27).
  - Codex agreed and answered both (35).
- **Codex's implementation (38) explicitly builds on them:** per-attribute parsing, entity-encoded `javascript:`, raw-text skipping, unclosed anchors.
- **Codex then reviewed its own integrated work:**
  - Unicode case-mapping offsets and cross-tag entity synthesis: found (53) and fixed (54).
  - `&constructor;` prototype leak: found (82).
- **Final integrated artifact ee558a26:**
  - in-session fixed checks PASS;
  - post hoc (offline, sandboxed, nobody, no network): fixed checks 6/6 and Codex's `parser-regressions` 3/3.

## Proposed fixes (offline; owners proposed; nothing changed yet)

1. **Codex adapter (L1):** a read reply that would exceed the context budget must not kill the worker. Either return an unsuccessful tool result ("too large: ask for specific paths / budget left N"), or give reads their own bounded budget. Either way, never silent truncation.
2. **Shared test command (L3, joint, candidate change):** also run the agents' own `artifact/*.test.mjs` beside the fixed checks, so integrated tests count in-session. The fixed checks stay authoritative and unmodifiable.
3. **Claude adapter (L4, mine):** treat in-turn assistant usage as a lower bound; record it as such in the report (`outputLowerBound`), and keep the final `result` usage as authoritative when present.
4. **L2** needs no code change. With L1 fixed, the session continues long enough for stale submissions to be reconciled.

**A third attempt needs Chris's new decision** after these fixes and both reviews.

## Repairs after review (6 Nov, offline)

**L1 (Codex, ec1865bb): reviewed and accepted by Claude.**
- An oversized read returns a charged, unsuccessful receipt, keeping 256 B of headroom. `headOnly` is exposed. The 24 KB ceiling is kept, and real exhaustion is still fatal.
- Pins verified.
- **Observation for Codex:** a peer **delivery** batch that would overflow the budget (`deliverBatch → consume`) is still fatal. Five deliveries of up to 6 KB (`pullBytes`) can exceed 24 KB, so the same crash could recur through steering instead of reads. Suggest pausing intake, as with the delivery limit, rather than crashing.

**L3 (Claude): the agents' own tests now run in-session.**
- `testCmd` may be `{ fixed, supplemental }`.
- The **fixed checks run first, in their own fresh sandbox copy**. Only if they pass do the agents' tests (`node --test --test-concurrency=1 'artifact/**/*.test.mjs'`) run, in a second fresh copy. Both must pass.
- Having no agent tests passes; a refused phase is NOT RUN.
- The `tested` event records per-phase results.
- An agent test can't alter the fixed checks before they run, because they've already run in a separate copy.
- A malformed `testCmd` is refused before startup.
- The candidate (`myc-p0-live-3`) uses this form; the fixed oracle is unchanged.

**L4 (Claude): Claude's in-turn usage snapshots are labelled `lowerBound:true`.**
- The report carries `usageLowerBound`, true when the figure rests on such snapshots.
- A final turn result supersedes it.
- The fresh-token cap therefore may undercount Claude's output mid-turn; this is stated, not hidden.

**Tests:**
- `test/live2-repairs-claude.test.mjs` 5/5, using the real unshare sandbox: agent-test fail gives FAIL; both pass gives PASS; no agent tests gives PASS; a tampering agent test can't flip a fixed FAIL; malformed testCmd refused; lower-bound flag.
- Against the pre-fix source the file fails to load (`testPhases` absent).
- **Full suite 113/113.** Pins 45.

**Sanitised evidence for independent review:** `evidence/live-2-2026-11-06/`:
- all 88 events (data allowlist);
- final integration ee558a26 files with SHA256SUMS;
- Codex worker error lines;
- watchdog.json and report-as-run.json;
- post-hoc log (fixed 6/6, parser-regressions 3/3);
- `refused-submission-provenance.txt`. Claude's refused test file is **not recoverable** from the session (refused before commit). A Claude CLI transcript may exist in the myc account on fpd-prod (sessions are not run with `--no-session-persistence`); collecting it needs Chris.
