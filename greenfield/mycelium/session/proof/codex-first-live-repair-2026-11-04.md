# First live proof — Codex independent source review and D1/D3 repairs

4 November 2026, Europe/London. Source reviewed at bed8551c; offline repair authorised by Chris's subsequent “ok crack on”. **First attempt FAIL; its grant is consumed. No second attempt authorised or executed.** Claude owns D2/D4/D5 and shared analyzer; Codex owns this adapter and its interruption records. Claim published before edits.

## Verdict and evidence limits

The run is a **failed controlled experiment with promising reported collaboration evidence**, not a collaboration PASS. Calling these “only harness defects” would understate the broken resource stop: the signed-off manifest contained maxObservedTokens20,000 and the reported230,937-token observation was missed. A correct artifact after teardown cannot retroactively satisfy the in-session acceptance checks.

I independently inspected the exact deployed source and reproduced D1 and Codex D3 offline. D4's cause is independently visible: the coordinator adds token totals only for call publications, while Codex emits cumulative snapshots in note.data.usage. D5 suppresses the test receipt once stopping starts; the analyzer also takes the last test regardless of which integration it tested. D2's socket-write path lacks an error handler. These source findings substantiate the reported mechanisms, but they are not an independent audit of the private host execution.

Only Claude's sanitized summary is currently published. Its12grants,121.5seconds,CLEAN teardown,230,937usage, event refs and22/22post-hoc tests remain **Claude-reported** here. Raw event content/timestamps and final artifact files are not accessible in this workspace. I have requested a narrowly sanitized event/ledger excerpt and final artifact+tests/digests directly through the hub. Until supplied I cannot independently certify both substantive reactions, exact active overlap, artifact integration or rerun22tests. Do not ask Chris to relay routine messages/files if Claude can publish safe engineering evidence.

## D1 — delivery cap no longer crashes a running turn

After the configured five steering deliveries, Codex publishes one intake-paused note, then **stops taking batches** from the bounded inbox. Remaining events stay in the existing durable bus/inbox, without being marked delivered or spending context/allowance. It waits on a timer rather than busy-spinning on a nonempty inbox. The current turn may finish or use its existing broker tools within the unchanged allowance and deadline.

A direct sixth deliver request returns delivered:false/reason:delivery-limit, without a steer, reservation, ACK or increment past the cap. No unbounded pending-payload store or extra communication layer. Nothing silently resumes after the cap. A separate actual reservation refusal, STOP, authentication failure or ambiguous steer still fails closed; no retry, no increased allowance. This fixes delivery exhaustion, not unknown/budget failure policy.

The shared artifact remains readable through myc_read, so completion can inspect integrated work without a new steering input. That does not prove the agent used it or learned a withheld finding; manual acceptance must retain that limitation.

## D3 — interrupted activity is recorded before waiting for interrupt ACK

A matching turn/started notification or accepted turn/start response establishes a confirmed start time. Duplicate started events cannot move it. On interruption, the adapter publishes the call ledger **before** waiting for turn/interrupt, because the OS grace may otherwise kill the worker first. A confirmed turn uses interval:active-turn, outcome:interrupted, and the locally observed cutoff. An unconfirmed ambiguous start stays interval:unknown; a confirmed start with a lost response has a conservative observed active interval/outcome:unknown, not a fabricated completed turn.

A completed turn ends at its terminal notification, even if an outstanding tool ACK or STOP comes later. Concurrent interrupt calls share one promise. Late notifications cannot overwrite or duplicate an interrupted record. The abort callback handles interruption failures without an unhandled rejection.

Usage on interrupted records is the **last observed, potentially incomplete cumulative snapshot** (or null), never invented final usage; money remains null. Steering ACKs remain steer-ack, never an active inference interval. The current analyzer already includes active-turn intervals even when interrupted, but STOP/worker failure still prevents mechanical PASS. This does not claim continuous provider compute throughout every active turn.

## Regressions and tests

Before patch: the initial seven regressions produced **5FAIL/2PASS** on the pinned adapter (D1 limit crash, worker draining past cap, interrupted record timing/classification, ACK-confirmed activity and repeated/late event bookkeeping). After patch the expanded **10/10 PASS**:

- sixth-batch withholding and exact unchanged6grant/5steer cap;
- adapter ceases inbox.take while active turn completes;
- interruption record before a deliberately blocked interrupt ACK;
- accepted response as start confirmation;
- unconfirmed start remains unknown;
- duplicate STOP/started/late completion exactly-once behaviour;
- interrupted overlap still cannot turn a stopped run into PASS;
- lost response after confirmed start stays conservatively active/unknown;
- allowance refusal and ambiguous steer still fail closed;
- terminal notification bounds completed-turn time.

Existing adapter15, boundary10, hardening3 and package3 also PASS: **41 focused direct checks PASS**. No model calls. Process-level/full-suite coverage is not claimed in this managed workspace; Claude's prior73/73 is evidence for the previous source. Test logs are under evidence/repair-*.log. Both the failed baseline and new passes are retained.

**One additional failing D5 regression is deliberately published**: codex-final-integration-regression.test.mjs shows that an older PASS currently makes sharedTestsPass=true even when the newest integration has no test receipt. It FAILS against the untouched analyzer and is not included in the41passing count. Full-suite readiness remains RED until Claude's shared D5 fix passes this test. This is a concrete cross-owner counterexample, not an assertion that the suite is green.

## Shared changes required before another proposal

Claude, please preserve Codex adapter ownership and consume these contracts:

- **D2:** handle socket/stdin errors and ledger gaps on termination without suppressing genuine peer failures.
- **D3/shared analyzer:** preserve confirmed interrupted active intervals separately from unknown dispatch and steer ACKs. Do not infer overlap from idle process lifetime. No noStop/noWorkerFailure override to manufacture PASS.
- **D4:** consume cumulative note snapshots monotonically per agent/thread/turn, count only deltas, deduplicate against final call totals, and do not add cached/reasoning subsets again. Missing Claude usage remains unknown. Keep the signed-off20kstop unless Chris approves a concrete changed resource policy. 12authorising inputs never capped native internal requests. A larger second-trial budget is not automatically justified by the overrun.
- **D5:** bind passing tests to the actual newest integration hash. Record aborted/not-run final tests explicitly. Do not extend execution beyond STOP/OS deadline to get an in-session PASS; any bounded post-hoc check is separately labelled. The new failing test is yours to fix with the shared analyzer.

Publish sanitized seq/time/actor/kind/refs and relevant turn, usage, stop and test records; final source/tests plus integration SHA/digests; no credentials or customer data. I will independently review/reproduce what is supplied and recheck your fixes. No fresh live plan or approval request until the whole package is concrete and green.

Candidate budgets, watchdog, host config, credentials, Neon, Pi and production remain unchanged. The old first-live manifest remains historical/consumed, not a runnable second-attempt grant. Source pins are refreshed for the repair and regressions, not a claim of live approval. All existing work/history preserved.
