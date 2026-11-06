# MYC-P0 fourth live proof (`myc-p0-live-4`): result, 6 Nov 2026 (one attempt)

**What ran:** run by Chris on fpd-prod under DECISIONS `MYC-P0-FOURTH-ATTEMPT-GRANT-2026-11-06`. Runtime d2ae54fc; `live-4-command.sh` (`e5561c9d…`) from c74b95c7.

**Evidence:**
- Raw evidence is private on fpd-prod (`/var/tmp/myc-p0-live4-a`), with a copy on Chris's PC.
- Sanitised: `evidence/live-4-2026-11-06/`. Secrets scan clean.

## Outcome

**MECHANICAL: FAIL (4/6). One attempt used; not rerun.**

| Criterion | Result |
|---|---|
| overlappingCalls | **true**: 178,474 ms |
| reactionEachDirection | **true**: 22, 28, 36, 56, 70, 82, 102 mid-session |
| changedByOther | **true**: 36, 56, 77, 91, 117, 125 |
| sharedTestsPass | **true**: newest 58425611 **[fixed pass, supplemental pass]** (seq 139), also 127, 134 |
| noStop | false |
| noWorkerFailure | false: Codex exited 1 at 433 s |

**How it ran:**
- **Claude finished cleanly:** its turn completed at 182.8 s, worker code 0, `done` at 186 s.
- Codex worked on until 433 s, then failed.
- Wall time 438 s of 600; watchdog not fired, CLEAN. Grants 12/12.
- **Fresh usage: Claude 51,799, Codex 56,501**. Neither is a lower bound now that Claude's turn completed. Totals: 277,362 and 600,629.

## Causes

- **M1, Codex adapter: a malformed model submission is fatal.** `worker-codex.log`: `Error: bad submission` at `handleTool` (codex-app-server.mjs:189). The validation throws for a model-supplied `myc_submit` with a missing or invalid base, files or message, and the throw kills the worker.
  - Most likely, the model's read budget was exhausted (seq 114: remaining 4,843 bytes, `frontier.mjs` refused), so it submitted without a valid base.
  - A model's tool-argument mistake should return an **unsuccessful tool result**, the same way stale bases already do. Only trusted-runtime or transport faults should be fatal. The same applies to `bad publication` and `bad tool arguments`.
- **M2, Codex can't see the session after its steering allowance.**
  - Codex used its 6 grants (turn/start + 5 steers) by 82 s, and intake paused (seq 62).
  - For the remaining 350 s it received **no peer events and no test results**, which it says at 100, 121 and 123.
  - Claude has a grant-free `myc_inbox` tool during its turn; Codex has no equivalent.
  - **Proposal (Codex):** a `myc_inbox` dynamic tool that reads the durable bus, charged to the context budget, needing no inference grant. That gives the two agents parity.
- **M3, the 24 KB supplied-context budget is too small for real work (policy).**
  - **Both** agents ran out. Claude's read budget was used up (seq 102); it declined to resubmit blind and ended its session.
  - Codex **compacted its implementation twice "to fit the shared final-review read budget"** (132, 137).
  - The cap is now distorting the work itself.
  - **Proposal:** raise `maxContextBytes` (e.g. 24 KB → 160 KB) and `readBytes` accordingly. Fresh-token use here (about 52–57k per agent) is far under the 300k cap, which stays as the resource stop.
  - This changes the approved candidate and is Chris's decision.

## Substance (preliminary, Claude; Codex to review)

- **Claude implemented first** (36, `7e8a8b4c`): fixed and supplemental PASS. Then Claude added edge tests (56).
- **Codex owned the tests and review:**
  - challenged named entities (70);
  - added independent regressions (77);
  - found the `&constructor;` prototype leak (90 → 91);
  - found EOF-in-tag fabrication (109 → 117);
  - then fixed all the demonstrated defects (125, PASS).
- Claude accepted the challenges and started a fix (82), which was refused as stale (96). The base protection worked.
- **Final 58425611:** in-session PASS. Post hoc, offline and sandboxed: fixed 6/6 and supplemental 24/24.

**Preliminary view:** the most complete run yet:
- 7 minutes of genuine co-engineering;
- both agents' code and tests integrated;
- defects found by each and fixed;
- the newest integration passes both test phases.

It failed on one adapter policy (M1) and was constrained by M2 and M3.

**Next:**
- Codex fixes M1 and M2 offline, with regressions.
- Chris decides M3, the context-budget number.
- Both review.
- A fifth attempt is Chris's decision.
