# Codex independent verification of first-run evidence and Claude repair0b19d137

4 November 2026, Europe/London. **Evidence reviewed; two narrow accounting refinements required before final repair sign-off.** No live model call, host/Pi/Neon/production change or second attempt.

## Independently reproduced outcomes

- Verified all37published source pins and6artifact hashes;84sanitized events are sequential, references point backward to existing events, and tMs is monotonic. This checks the published evidence, not equality to the private raw host files.
- The fixed oracle is byte-identical to the original candidate's6-test fixture. I reviewed the final implementation and all three test files, then independently reran **6+7+9=22/22 PASS** against final artifact17b3a2c21539b9a3cb1a3716cff42aa3dafaf315.
- Isolation for my rerun: fresh process environment and Node permission mode restricted to fixture reads, with no child/addon permission. The reviewed code does pure string/URL processing; no network operation was performed. **This is not an independent OS-sandbox rerun.** Bubblewrap's namespace probe was refused by the managed environment (NETLINK_ROUTE EPERM); no control was bypassed. Claude's reported nobody/network-isolated post-hoc test remains separate evidence.
- **44 focused harness checks PASS** independently here: prior41, the previously failing newest-integration regression1, and two pure Claude usage/final-integration checks. Claude's89/89whole-suite result is accepted as reported for his capable environment, not relabelled as my full-suite run.

Machine-readable timings, hashes, actual named test counts and reanalysis are in evidence/codex-independent-first-live-review-2026-11-04.json.

## What the event content actually supports

Codex finding10 supplies quote-aware HTML/Unicode/entity counterexamples, tests12and46 are substantive executable contributions. Claude finding55 explicitly extends10 with href text inside another attribute; Codex reply61 responds substantively, accepting self-visited semantics while identifying it as an interpretation. Codex challenge63 addresses textarea/title text. Claude commit76 references41/63/61 and its implementation actually includes attribute tokenization, raw-text skipping and self-visited normalization. Merge80 integrates that artifact. This is evidence of two-way substantive interaction on the same problem, and peer evidence changing the implementation, not two unrelated solo reports.

However, the published historical ledger lacks complete confirmed active intervals, so I cannot derive a certified exact115-second model-active overlap. Interleaved intermediate contributions and live worker spans support overlapping investigations; they do not authorize rewriting missing call records or manufacturing an overlap metric. The experiment remains **FAIL**: Codex/Claude exits81/83, STOP82, no test receipt for merge80. The22post-hoc passes establish the final artifact's behaviour on those tests, not in-session acceptance or real-web intelligence.

Reanalysis with the repaired analyzer still says mechanical:false, callOverlapMs:0, newest integration17b3a2c… tested:false, Claude usage:null and Codex230,937. Keep the as-run receipt unchanged.

## Resource policy — measured counterfactual

The first published Codex report over the unchanged20kthreshold is **seq19, tMs35,052, totalTokens27,841**. Seq7is8,327 at5,970ms; seq9is17,370 at11,292ms. A functioning observed stop would act at the35.052-second observation, not at6seconds and not reliably before all inference overshoot. Claude finding55/reply61/commit76 occur later (64.980/72.118/116.257seconds). Thus replay strongly suggests the same trial with a working20kstop would terminate before that later two-way exchange. It does not predict a new run exactly.

Cached input195,456 and reasoning output320 are subsets of the reported230,937total; do not add them again. Uncached input plus output is35,481 for the final Codex report, but switching the stop to that metric would be a **policy change**, not an accounting correction. Claude consumption and actual money remain unknown. Do not silently increase20k, promise12provider requests, or request a second run on a known-unfit unchanged budget without a concrete owner-reviewed resource plan.

## Repair review

D1/CodexD3 remain accepted under the direct regressions. D2's bridge-socket error handler closes the reported EPIPE path. D5 now binds sharedTestsPass to the newest merged hash; my failing counterexample passes and the first-run final merge is correctly untested. D4 now observes cumulative snapshots and the existing monotonic/repeated-snapshot tests pass. These are useful repairs.

**R1 — ClaudeD3 interval start still uses pre-confirmation send time.** In claude-stream.mjs the interrupted record checks confirmedAt/consumedAt but publishes startedAt:t.startedAt. For queued input sent at0, accepted at60s and stopped at65s, that attributes65seconds of activity despite only5seconds of confirmed activity. The normal result record also uses send time. Use the matching confirmedAt (initial) or delivery.consumedAt (queued/new turn) for a confirmed active interval, retaining send time separately only as dispatch timing. Without start confirmation, preserve unknown interval; do not fabricate active overlap from a later result alone. Mid-turn folded deliveries remain stdin-ack, not new active intervals. Add delayed-echo/queued-consumption and no-echo completion regressions, not just a long-running early-echo test.

**R2 — ClaudeD4 usage publication can fail silently.** reportUsage advances usageSent before durable acknowledgement and catches runtime.publish rejection with an empty handler. The loop's existing ledgerFailure check never sees it, so an active-session failed usage publication can be permanently treated as sent and inference continues without the resource observation. Make a non-shutdown publication failure fatal through ledgerFailure/the existing stop path, do not auto-retry an ambiguous publication, and advance durable sent state only consistently with acknowledgement. During an already-observed STOP, retain usage as partial/unknown rather than advertising successful publication. Add a rejected-usage-ACK regression showing the running pair stops and does not continue sampling; duplicates/same-message blocks still count once.

These are direct continuations of D3/D4, not new infrastructure or a larger orchestration project. Claude owns that adapter; I have not overwritten it. Please patch those two paths, rerun focused/full offline tests, update pins and hand back through the hub. No repeated host/watchdog rehearsal is needed for unrelated unchanged mechanics, and no new live call is needed to reproduce either source defect.

**No second live approval is requested.** First allowance remains consumed. Complete these small repairs and agree a realistic, explicit token/usage policy before presenting another bounded proof package. Offline fixture success is not a FindPitches discovery experiment or a production parser approval.
