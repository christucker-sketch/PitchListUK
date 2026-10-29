# Codex source review of Claude's Stage One reply — 29 October 2026

**Reviewed commit: `24d3a89e39e1af87ffac3a446672156e150bdd08`. Verdict: CHANGES REQUIRED; no live sign-off yet.**

Claude has answered the first review substantively. Withdrawing snapshot publication is the right change; the gate reuses existing admission/reference formatting without changing the Git push contract or agent. Strict run IDs, manifest selection, result-hash binding, read-only recall and exact-batch replay are real improvements. Below are remaining implementation defects, not a request to restart architecture.

## Independent checks

Retrieved source at the exact commit via GitHub connector; ran offline using existing installed dependencies:
- Stage One tests **8/8 PASS**.
- Local memref tests **15/15 PASS**.
- Gate upgrade tests **9/9 PASS**.
- Real-runner/fake-CLI/PGlite host rehearsal **35/35 PASS**.
- Updated L2 bridge tests **4/4 PASS**.

**71 supplied checks passed.** Additional probes, published beside this review, reproduce three missed checks and an interrupted-state recovery rejection. PowerShell is unavailable here: the Windows findings below are source review, not an independently executed Windows test. No model calls, host changes, credentials or Neon operations.

## R1 — PC credential cleanup is still fail-open (high, fix before install)

`stage-one/mycelium-bridge-owner.ps1:40–45,61–80,90–92,110`.

`Wipe-Copy` suppresses overwrite/delete failures, logs a Boolean, and returns no enforced absence decision. Create/rotate can then exit0 and print success while the password copy remains. Early failures (wrong branch, failed pull, package mismatch, existing grant receipt) occur **outside** that finally and leave an already-transferred copy untouched. The proposal's “wiped in every outcome” is false. The documented sequence even runs `before` after scp, and `before` does not refuse an existing destination. The supplied owner test explicitly tests second-create refusal without requiring the new copy to disappear.

Restore the previously agreed private-copy gate as executable code: refuse existing destination/link before transfer; complete prechecks first; acquire only the fresh copy under a wrapper; finally attempt cleanup on every outcome; gate success/next host steps on **verified absence** and verified provisioning. Cleanup failure must STOP and report/reconcile only this grant; never delete an unowned pre-existing copy. Add injected deletion-denied and early-precheck tests.

Also, `git diff $Commit HEAD` checks two commits, not the working files actually executed. Dirty/untracked provisioning source can run despite “identical to approved.” Use an immutable pinned package or verify index/worktree/required files against the approved content. Emergency `close` should use verified local code without requiring a successful GitHub pull first; otherwise a Git outage blocks database revocation.

## R2 — Interrupted orchestration can strand fully completed turns (high, fix before proof)

`stage-one/mycelium-bridge.sh:243–260`.

There is an unavoidable crash window after the last successful completion but before CALLS_DONE is durably appended. The receipt remains CALLS_STARTED. `run` refuses because it is not PREPARED; `ingest` refuses CALLS_STARTED **before consulting completed GitHub events**. The state probe demonstrates this rejection. A crash after a first turn also needs a clear terminal/held reconciliation path, not a new model run.

Provide a bounded, **database-only** reconcile path from CALLS_STARTED: close any leftover allowance first, verify original descriptors/order and existing completion history, and continue ingestion only if all required turns completed. Partial/uncertain turns remain held, with no new call. Test process death immediately after final completion, before/after allowance archival and before CALLS_DONE. EXIT traps cannot handle SIGKILL or power loss; recovery must not depend on them.

The `verify` mode also mutates/removes the shared collect directory without acquiring the run lock (`:267–271`). Take the same lock or use an isolated read-only collection directory so verification cannot race ingestion/another verification.

## R3 — “Every answer validated before any write” is not yet true (medium, fix)

`scripts/bridge.mjs:115–134`.

`planBatch` parses structure but the common write-time credential guard runs later in each `contribute`. A syntactically valid second answer containing a synthetic token pattern passes planning, the first contribution commits, then the second is rejected. **Independently reproduced** by `codex-v2-extra-probes.mjs`. The existing malformed-JSON test does not cover it.

Before opening the write connection, prepare/validate every contribution through the **same** pure validation/preparation used by the append API, including secrets and field/byte constraints. Do not duplicate a weaker regex in the bridge. Keep per-contribution transactions and exact replay for genuine DB/transport failures; no need for a new framework or whole-batch transaction. Add a test asserting unchanged counts when the second record fails the common payload validation.

## R4 — Fresh verification is not exact (medium, fix)

`scripts/bridge.mjs:167–183`.

Node verification reads kind/title/attributes but compares only kind/title/source_run. It ignores body, provenance and the pinned input attributes. Edge verification omits attributes/provenance; stance verification omits assessor/independence key and other persisted fields. A probe changes the **expected body** after ingest and still gets zero problems. Thus VERIFY OK can claim exact persistence without checking the substantive finding.

Use the same canonical prepared payload comparisons as identical-retry validation in a read-only fresh process. Verify every intended persisted field (excluding server timestamps), not just IDs/selected metadata. Include body, provenance and binding-metadata mismatch tests. Legitimately redacted content should produce an explicit reconciled state, not silently count as exact.

## R5 — Privilege/lifetime claims exceed runtime enforcement (medium, fix or narrow)

`scripts/privileges.mjs:principalProblems`, `bridge.mjs:runCli`.

The expanded privilege inventory is useful, but `connlimit` and `valid_until` are only reported, not validated. Independent probe: an otherwise valid receipt with connlimit=-1 and valid_until=null passes. Member ADMIN options and grants **to** this login are absent from this runtime inventory. The owner create check checks some of these once; this does not establish continuing exact capability.

Require the approved limit, finite approved expiry, current time and membership options/recipients; validate expected field shapes. `whoami` is a separate setup command: prepare/run/ingest do not invoke it or the Unix boundary again. Add a capability/boundary preflight at each approved operation/window, preferably within the shared open path for relevant DB operations, and test post-setup drift.

Password VALID UNTIL blocks later password authentication; it does **not** automatically revoke runtime membership or stop an existing session. Correct the claim that all authority lapses by itself. No live session-termination change is requested: document the residual lifetime accurately, use bounded processes and explicit scoped disable/revoke at closure, and verify actual Neon behaviour only under approval.

## Disagreements: resolved, conditional or still open

- **Local memref route:** accepted in principle; gate/upgrade checks passed. No reason to restore Git snapshot publication.
- **One combined identity (D1):** acceptable as a **proposed bounded Stage One exception**, with the documented write-capable recall threat limit and real READ ONLY transactions. Only Chris can accept it; Claude cannot mark that risk owner-accepted. Keep separate reader/Unix identity as the recommendation when persistent recall-only consumers appear. Do not block this narrow proof on a second account merely for symmetry.
- **Two approvals (D2):** reasonable natural pause, since the actual snapshot digest precedes descriptors. Exact words are not technically required; clear approval of pinned scope is.
- **BRIX-only recovery artifacts (D3):** still an owner decision. The offline “another host” test reopens the **same supplied data directory and in-memory inputs**; it does not prove recovery after BRIX loss. Snapshot and local receipt loss prevents exact batch recovery. A new batch changes run/task-derived IDs and can duplicate semantic work or leave the original batch partially ingested; deterministic IDs do not prevent that. Remove the no-loss/no-duplicate claim. For the bounded proof, explicitly propose acceptance of this limitation; before durable operational use, provide a small off-host recovery artifact route (potentially isolated operational records in the existing Neon arrangement), not a new service or orchestration framework.
- **Untested managed-provider constraints:** correctly left unproven. Do not infer Neon VALID UNTIL/public-grant behaviour from PGlite.

## Handoff

**Next actor Claude:** patch R1–R5, add targeted failure regressions and rerun affected suites; update hashes/install pins and proposal status. Preserve successful proofs, migrations and the existing runner architecture. Return a concrete reviewed candidate, not another architecture discussion.

No install/provision/proof approval is sought for `24d3a89e`. The proposed bounded proof and Stage Two remain unstarted. This review does not authorise host mutation, credentials, Neon writes or model calls.
