# MYC-P0 third live proof (`myc-p0-live-3`): result, 6 Nov 2026 (one attempt)

**What ran:** run by Chris on fpd-prod under DECISIONS `MYC-P0-THIRD-ATTEMPT-GRANT-2026-11-06`. Runtime 2a2cb41f; `live-3-command.sh` (`ab6b1e93…`) extracted from 76d46651 and run detached.

**Evidence:**
- Raw evidence is private on fpd-prod (`/var/tmp/myc-p0-live3-a`), with a copy on Chris's PC (`myc-live3-evidence.tgz`).
- Sanitised: `evidence/live-3-2026-11-06/`. Secrets scan clean.

## Outcome

**MECHANICAL: FAIL (4/6), one attempt used, not rerun.**

| Criterion | Result |
|---|---|
| overlappingCalls | **true**: callOverlapMs 197,414 |
| reactionEachDirection | **true**: 17, 24, 42, 49, 95 |
| changedByOther | **true**: commits 24 (Claude tests), 63 (Codex implementation, refs 42 → Claude's 17), 86 |
| sharedTestsPass | **true**: newest integration 069e3894 PASS **[fixed pass, supplemental pass]** (seq 88); also da27a3b5 (seq 66) |
| noStop | false |
| noWorkerFailure | false: the Codex worker exited 1 at 203.4 s, and the pair stopped |

**Limits:**
- Wall time 208.5 s of 600; watchdog not fired, CLEAN. Grants 12/12.
- Usage, total (fresh):
  - Claude 250,483 (30,298), **lower bound**;
  - Codex 386,209 (48,801).
- Both well under 300k fresh per agent.

## Cause: C1, the Codex RPC transport inbound bound

- `worker-codex.log`: `Error: RPC inbound work limit` at `CodexRpc.receive` (codex-rpc.mjs:48).
- Every inbound app-server notification increments `inbound` until its (sequential) handler finishes, and the cap is `maxPending = 8`.
- While a handler awaits a coordinator round trip, for example a usage note or call publication, a burst of more than 8 notifications from the real 0.164.0 app-server fails the transport. The turn is then recorded `interrupted` (seq 112) and the worker exits 1.
- This is the bound from test 27 (server-request flood), applied to ordinary notification bursts. Stand-ins never burst like that.
- Owner: Codex (transport).
- Suggestion:
  - keep a bound, but size it for notifications separately (count **and** bytes, e.g. hundreds plus a byte cap), with requests still tightly bounded;
  - answer ignored notification methods without queuing behind awaited handlers;
  - add a regression where a stand-in app-server emits a 50+ notification burst while a handler awaits.

## Substance (preliminary, Claude; Codex to review)

- **Division negotiated live:**
  - Codex announced its plan (9).
  - Claude proposed Codex owns `frontier.mjs` and Claude writes the test suite, listing about 20 adversarial cases (17).
  - Codex agreed and stated its interpretations: ignore `<base>`; only explicit `seen` suppresses (42).
  - Claude accepted and listed exactly what the suite expects (49).
- **Claude's suite was integrated first** (24, 837f800f): the fixed checks FAIL against the stub, as expected.
- **Codex implemented against it** (63, da27a3b5): **fixed pass and 16 Claude tests pass** (66).
- **Independent review from both:**
  - Codex found bogus-comment exposure and the U+0130 lowercase offset bug, fixed them, and added regressions (82, 85 → 86; 069e3894, both phases pass).
  - Claude independently found the same U+0130 bug plus two more counterexamples (95).
- **Claude's fix was refused as stale** (104: written against da27a3b5, integration already 069e3894). Base protection worked. The crash came 26 s later, before Claude resubmitted.
- **Post hoc, offline, sandboxed:** final 069e3894 passes fixed 6/6, Claude's suite 16/16 and Codex's extra 3/3. Claude's counterexample 2 (`<span don't>…</span><a href="/real">`) **still drops `/real`** on the final code. That's a valid, unresolved peer finding.

**Preliminary view:** this run shows every substantive element of the concurrent-collaboration goal:
- overlapping active work;
- reaction both ways that changed the plan and the code;
- contributions from both integrated and tested in-session (Claude's tests plus Codex's implementation and regressions);
- independent review.

It failed mechanically on one transport bound. Codex's independent review is needed before any claim.

**Next:** fix C1 offline (Codex) with a burst regression; both review. A fourth attempt is Chris's decision.
