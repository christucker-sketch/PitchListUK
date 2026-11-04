# MYC-P0 first live proof: result (one attempt, 4 Nov 2026)

**What ran:** run by Chris on fpd-prod at 16:09:53Z under the 30 Oct approval. Pinned runtime 205da981 with Codex's fail-fast block (sha256 `cc365043…`), run detached via `setsid`.

**Evidence:**
- The raw evidence stays private on fpd-prod in `/var/tmp/myc-p0-live-20261104-a`.
- A copy is on Chris's PC for review (`myc-live-evidence.tgz`, 20,591 bytes).
- A secrets scan of the logs and stream found nothing. This page is a sanitised summary written by Claude, for Codex's independent review.

## Outcome

**MECHANICAL CRITERIA: FAIL. One attempt used; not rerun.**

| Criterion | Result | Why |
|---|---|---|
| reactionEachDirection | **true** | Mid-session cross-references: seq 55, 61, 72, 76 |
| changedByOther | **true** | Claude's implementation (76) references Codex's 41, 63 and 61 |
| overlappingCalls | false | **Ledger gap, not lack of overlap.** Both turns were active from about 1.1 s to 116 s; see D3 |
| sharedTestsPass | false | The final merge (76) was never tested in-session: the stop aborted it (D5). Codex's two test-only commits failed against the empty stub, as Codex noted at seq 23 |
| noStop | false | The pair stopped at 116.4 s after the Codex worker failed (D1) |
| noWorkerFailure | false | Codex exited 1 (D1); Claude exited 1 (D2) |

**Limits:**
- Wall time 121.5 s of 600 s. **Watchdog: did not fire; CLEAN** (0 slice/broker processes, 0 units, 0 tagged).
- Grants 12 of 12:
  - Codex: turn/start plus 5 steers.
  - Claude: its turn plus 5 mid-turn stdin deliveries.
- Stale-base protection worked: Claude's submissions were refused twice (seq 26, 65), and Claude reread and resubmitted successfully (76).

**Usage:**
- **Codex reported 230,937 cumulative tokens** (228,500 input, of which 195,456 cached; 2,437 output; 320 reasoning). That's from many internal inference requests in one turn plus 5 steers.
- Claude's usage was **not reported**, because its turn never produced a result record.
- **The 20,000 observed-token stop never applied** (D4).
- Money: unknown. Both CLIs were on subscription logins through `myc-run`, and Chris's billing settings were checked beforehand.

## Manual substance review (Claude, preliminary; Codex to review independently)

**Investigation from both agents:**
- **Codex:**
  - seq 10: counterexamples, e.g. `title="1 > 0"`, entity-encoded query, comments/scripts containing `<a href>`.
  - seq 41: duplicate href takes the first; `data-href` must not match; entity-decoded `#` fragment is rejected.
  - seq 63: `<textarea>`/`<title>` raw text.
- **Claude:**
  - seq 55: extends Codex's seq 10 with a title value *containing* `href=`, which defeats a naive search.

**Reactions that changed the work:**
- Codex's reply 61 references Claude's 55. It accepts treating the current page as visited and flags it as an interpretation of the README.
- Claude's implementation 76 ("quote-aware attribute tokenizing, raw-text skipping; extra regression tests") references Codex's 41, 63 and 61, i.e. Codex's challenges shaped it.

**Contributions:**
- Codex: two executable test commits (12, 46).
- Claude: the implementation plus its own regression tests (76).

**Integrated artifact: tested POST HOC** by Claude, offline, sandboxed (no network, nobody), on the final integration worktree files:
- fixed oracle `checks/frontier.test.mjs` **6/6**;
- Codex's `artifact/frontier.test.mjs` **7/7**;
- Claude's `artifact/frontier.extra.test.mjs` **9/9**.

This is **not** in-session evidence and does not change the mechanical FAIL. It shows the collaboration produced a correct integrated artifact before the crash.

**Preliminary view:** the substance criteria (overlapping active model work, substantive reaction both ways, changed investigation, contributions from both, an integrated artifact) look met on the content. The run failed on harness defects. Codex's independent review is needed before any claim.

## Defects (owners proposed; nothing changed yet)

- **D1, Codex adapter: fatal "delivery limit".**
  - Claude's commit (76) arrived as a 6th peer delivery after Codex's 5 steers had used the 6th grant. `deliverBatch` threw `delivery limit`, the worker exited 1, and the pair stopped at 116 s.
  - Exhausted delivery or allowance should **withhold further deliveries** (recorded), and let the active turn finish or reach the deadline. It shouldn't crash.
- **D2, Claude adapter (mine): unhandled EPIPE.**
  - `claude-stream.mjs:53`: the bridge socket `end()` after the peer closed raised an unhandled `EPIPE` during shutdown, so Claude exited 1.
  - Handle socket errors and finish cleanly on stop.
- **D3, ledger (both adapters plus analyzer): active turns cut off at stop were not recorded as active intervals.**
  - Codex's turn/start was ledgered with `interval:"unknown"` (1.1–116.3 s). Claude's turn (grant 1) has no call record.
  - So `callOverlapMs` is 0 although both turns ran concurrently for about 115 s.
  - An interrupted turn should be recorded as `active-turn` with its real start and end, and marked interrupted.
- **D4, coordinator (mine): the observed-token stop counted only `call` records.**
  - Codex reports usage in `note` data (`thread/tokenUsage`), and call records had null tokens, so the 20,000 threshold never saw 230,937.
  - It must count the adapters' cumulative usage reports. A stop at 20k would have ended this run within seconds, so the threshold value itself needs Codex's and Chris's view. (It is observational, not part of Chris's approval, which is 12 inputs, 605 s and £0.)
- **D5, coordinator (mine): the stop aborted the in-flight test of the last merge.** A final merge should still be tested (bounded by testMs) before `done`, or the report should state it was untested.

**Scope:**
- Chris's approval covered one attempt, and it has been used.
- Any second attempt, after the fixes and reviews, needs Chris's new decision.
- Nothing was rerun.
