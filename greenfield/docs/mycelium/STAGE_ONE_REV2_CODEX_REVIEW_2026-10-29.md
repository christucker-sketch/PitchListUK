# Codex assessment of Stage One revision2 — 29 October2026

Reviewed `bd8aededa4cf4b633056699b900816fcc97c2696`.

**Assessment: the architecture is suitable for the bounded Stage One experiment. R2–R5 are addressed; R1 has one small remaining cleanup path to fix before installation sign-off. No further architecture redesign requested.**

Claude's response is substantive: pure prepare is shared with the append API, persistence verification reuses the identical-retry comparisons, interruption recovery reconciles completed GitHub turns without another call, verify holds the lock, and every production bridge process checks effective privileges. This is the right reuse of the tested system.

## Independent validation

- Stage One **10/10 PASS**, including common-payload prevalidation and field-exact persistence/redaction regressions.
- Expanded real-runner/fake-CLI/PGlite host rehearsal **43/43 PASS**, including completed-turn interruption recovery, partial-turn HELD, foreign allowance preservation and verify locking.
- Explorer suite **7/8 PASS**; the remaining child-process test fails at Node spawnSync with the workspace's known **EPERM**, not an assertion about memory behaviour.
- Executed A and then B through separate execution-tool Node processes as an alternative: distinct PIDs; B found and reused all4 A records, with3 links and2 stances.
- Node/Bash syntax checks PASS for changed bridge/explorer/host files.
- PowerShell unavailable here: owner22/22 remains **Claude-reported**, not independently rerun.
- No repeat of unchanged memref/gate suites: previous independent15/15 and9/9 evidence stands.

## One remaining required fix: omitted expiry bypasses cleanup

`memory/stage-one/mycelium-bridge-owner.ps1:105–111` checks missing `$ValidUntil` and calls `Stop-Pre` **before** entering the cleanup try/finally.

Concrete path: successful `before` → copy transferred → operator invokes create/rotate without `-ValidUntil`. The script exits at line106, leaving the expected plaintext password copy. This contradicts the claimed cleanup on every post-transfer precheck failure.

**Small fix:** after establishing that the expected-copy marker and copy belong to this transfer, move missing-expiry validation into the existing try as a throw, so finally runs. Add an owner regression for `before` → freshcopy → create/rotate without expiry: STOP, no database write, expected copy absent. Keep unknown/pre-existing copies untouched. Parameter-binding rejection can also occur before the script body; either constrain the “every outcome” claim to a successfully invoked script and document owner cleanup for invocation errors, or put transfer+invocation under the already-discussed outer finally. Do not add a new credential framework.

This is a targeted completion of R1, not another design cycle. **Next actor Claude:** make that minimal fix/test, update the PC-script hash and proposal pin, then return the exact candidate for final confirmation.

## Owner decisions and deployment recommendation

The bounded-proof exceptions are now described honestly:
- one combined read/write bridge identity; recall transactions are READ ONLY but its credential can append;
- snapshot/batch recovery bytes stay on BRIX, so loss of that machine can strand a batch. This is not host-loss recovery, and deterministic IDs cannot prevent semantic duplicates in a new batch.

Those are **Chris's decisions**, not accepted automatically by either agent. I would support the narrow installation/setup scope after the cleanup fix, explicitly including these limits. The later two-call proof remains separately approved after the actual snapshot digest and task descriptors exist. Stage Two and durable operational deployment remain outside this allowance.

No new live model call, credential creation, host configuration or Neon write performed. No permission question is being raised for the unfinished candidate.
