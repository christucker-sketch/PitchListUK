# MYC-P0 — independent repair/resource-policy review, 6 November 2026

Reviewed Claude base **06042402c28d44dca81c6136974428c9413cdc67**. Chris asked Codex to review while he finalises run plans. **R1/R2 accepted; 300,000 fresh tokens per agent is a defensible proposed ceiling; three reproduced defects are fixed in this review patch.** Claude's full-suite recheck and exact final pins remain outstanding. This is not owner approval or a live execution receipt.

## Decision for planning

I support **one second proof, at most600seconds plus5seconds agent kill grace, six authorising inputs per engineer, proposed300,000 fresh tokens per agent**, retaining the existing subscription-only/£0incremental paid-API guard and no web/Neon/production activity. The cap is an **observed stop threshold**, not a hard provider-token guarantee. Nominal combined allowance is600,000fresh; reporting/interrupt delays can overshoot.

Why300k is reasonable for this bounded diagnostic: the first run reports35,481Codex fresh tokens in about116seconds. Linear scaling gives about183,522fresh over600seconds;300k offers about1.63× headroom. This is one observed Codex run, **not a measured Claude rate**, a validated engine operating budget or an estimate of subscription quota weights. The prior20k aggregate total threshold would stop at the observed35.052second report, before the later exchange. It was reasonable to change that policy explicitly rather than secretly ignore it.

Fresh is a resource-accounting proxy, not money or all work: cached input still contributes to provider/plan usage and model context. Keep total, fresh and cache reports separately. A10-minute run could use1M+ total tokens per agent if cached re-reading continues; that is an order-of-magnitude planning warning, not a forecast or certified maximum. We cannot establish how the plans weight them. Owner billing-state reconfirmation remains required: extra usage/paid fallback off, no API-key billing or new credits/subscription commitment.

Other limits remain material:24KB adapter-supplied context per agent, five deliveries,64dynamic Codex tool calls, isolated file/test bounds and the605/635second PID1 deadlines. More model tokens do not promise10minutes of useful work or waive another stop. No cap, deadline or permission was raised in this review patch. The candidate300k/id myc-p0-live-2 was Claude's existing **offline proposal**, not authorised execution.

## R1/R2 independently checked

The real adapter source was loaded with in-memory process/socket/filesystem capabilities for five independent behaviour checks: delayed initial acknowledgement, no-echo terminal result, queued delivery start timing, rejected usage ACK, and pending-ACK serialization with duplicate message blocks. **5/5PASS** against Claude's changes. A sixth check now verifies normalized terminal cache accounting. The R1/R2 fixes are accepted: observed acceptance bounds active intervals, sentAt remains separate, an unconfirmed start stays unknown, and failed usage publication is not silently retried.

This is not a process-level or OS-sandbox test. The normal R2 process test here stops at listen EPERM on a local Unix socket before exercising the branch. The added real worker/coordinator fresh-accounting check also exits before model dispatch in this managed environment. No permission or sandbox control was bypassed. Claude's95/95 remains his reported result for the **pre-review source**, not my full-suite result for this patch.

## Reproduced defects and narrow fixes

### P1 — fresh snapshots reverted to total tokens at completion

My regression runs the actual CodexSession on in-memory RPC, feeds the first run's230,937total/195,456cached/2,437output usage, completes the turn and analyzes its actual publications. Before patch, freshUsage incorrectly becomes **230,937**, although the snapshot correctly says **35,481**. The live observer uses the same max-with-call-totals formula, so a large cached terminal record can falsely stop the pair.

**Fixed:** both adapters include provider-normalized totalTokens and freshTokens on terminal records. Codex input includes cached input; Claude input excludes separately reported cache reads/creation. The coordinator preserves these fields, maintains distinct total-call and fresh-call accumulators and uses the same units in live thresholds and reanalysis. Legacy records without a usable cache split count fully, conservatively. Unknown usage remains unknown; interrupted snapshots stay partial. No cache/reasoning subset is added twice.

Concrete values retained: Codex230,937total/35,481fresh; Claude example52,000total/7,000fresh (1kuncached input+5kcreation+1koutput). Raw input/output fields remain alongside normalized totals for audit. A known all-cached zero-fresh observation now remains0; absence of real usage remainsunknown.

### P2 — malformed/incomplete cache split understated consumption

Cached input greater than all input, or a cache count with no input count, previously allowed arbitrary cache credit (my110total example became10fresh). **Fixed:** cache subtraction requires a complete nonnegative finite split and cached<=input. Invalid/incomplete splits return unknown, so the caller counts the full known total. Invalid terminal fresh metadata also falls back to the full known total.

### P3 — explicit terminal CLI error was normal completion

An in-memory frame with type:result,is_error:true,subtype:error_during_execution previously produced a normal done rather than a failed worker. That violates the existing quota/authentication/error stop condition even if all test files happened to pass.

**Fixed:** an explicit terminal error flags ledgerFailure, records outcome:failed, prevents further sends and interrupts the CLI. The worker then fails, so the coordinator stops the pair through the existing path. No new model turn, retry, resumed session or extra allowance. Success records now explicitly say outcome:completed; an existing no-echo test expectation is updated accordingly. Provider error text is not copied into the shared error message.

R1/R2 logic, watchdog, permissions, login/credentials and candidate300kvalue are otherwise preserved. The narrow shared-file claim was published before editing; Claude is asked to review those branches rather than accept an unannounced overwrite.

## Independent evidence

**61 focused checks PASS after patch:**
-42existing Codex/boundary/package/final-integration checks;
-3selected pure peer usage/integration checks;
-9fresh-policy/terminal-accounting regressions and controls;
-6real-adapter in-memory timing/ACK/cache checks;
-1explicit-terminal-error check.

Before patch, three fresh-policy cases and the terminal-error case fail; logs are retained. The95full-suite baseline did not cover these transitions. No whole-suite, process/BRIX or native-model success is claimed here.

Commands for Claude, from session root:

```bash
sha256sum -c --quiet proof/source.sha256
node --test test/*.test.mjs
node --experimental-vm-modules proof/review-tests/r1-r2.mjs
node --experimental-vm-modules proof/review-tests/terminal-error.mjs
node proof/review-tests/fresh-runtime.mjs
```

The last uses a process-level fake app-server to check both a genuine fresh stop and absence of a false cached-total stop; it remains **environment-blocked here**, not PASS. The in-memory tests use Node's experimental VM-module linker solely to inject harmless test capabilities; they are supplementary unit tests, not a new runtime, OS sandbox or live CLI.

Raw test counts, outputs, baseline failures and the numerical policy calculation are in evidence/codex-resource-policy-review-2026-11-06.json and related review logs. Source pins are refreshed for this patch; candidate manifest contents are unchanged.

## What remains before executing

Claude: independently run the full existing suite and supplemental checks, review the normalized provider fields/error guard, publish actual results and accept one final immutable runtime commit. No need to repeat unchanged host/watchdog mechanics by default. If any test fails, fix/retain evidence before presenting the run plan.

Chris can finalise the **policy intent** now: proposed300kfresh per agent, six inputs each,600s+5s, one attempt, existing subscription protection and offline fixture. Execution still needs his explicit second-attempt decision on the **final reviewed commit/manifest**, current billing check and a fresh output directory/session id. The original allowance is consumed; the old205da981command is historical and must not be rerun.

The implementation is a collaboration-mechanics proof, not a claim of web discovery, domain intelligence or production parser readiness. Manual review of intermediate influence both ways and the latest integration's in-session test receipt remains mandatory. No approval question or live attempt is issued from this incomplete peer-recheck state.
