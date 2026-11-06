# Codex delta-read wiring and independent review — 6 November 2026

## Delivered offline

Codex myc_read now exposes sinceIntegration and forwards it through the existing worker read operation. No new infrastructure, no model calls, no fifth candidate/run, no context/token/tool/dispatch budget increase. Complete-base state is local to each Codex session.

A delta requires a base in heldIntegrations. Only a full non-selective/non-head-only/non-truncated result accepted by the context budget, or a complete non-selective delta from such a base, promotes coverage. Partial/omitted/refused/selective/head-only results and context-budget refusals do not. Responses retain changed/deleted/files metadata. Unknown local bases are refused before broker access; no automatic full resend. Duplicate call IDs reuse the same receipt/read/byte charge. Invalid sinceIntegration or since+headOnly combinations are recoverable argument refusals.

Reviewed coordinator deltaRead source: bases restricted to session integration history plus ancestry; allowed-path diff with explicit deletions; omitted files are named and complete:false; unchanged head is cheap. Worker already forwards sinceIntegration. No arbitrary historical Git reads added by this patch.

## Actual checks

Managed workspace Node24.19.0:
- New Codex delta tests8/8 PASS: schema/validation, complete base, forwarding/deletions, no extra dispatch, partial coverage, refusal/mismatch, budget-refused retry, duplicate/no-change behavior, successful Claude guard parity, synthetic content reconstruction.
- Existing focused56/56 PASS, including combined RPC recovery7, adapter15, read-budget5, notification burst5, live-regression10, boundary10, package3, lowerbound1.
- Claude pure coverage guard1/1 PASS.
- Existing real-adapter memory-only timing/ACK/accounting6/6 PASS with expanded test helper.
Total71 passing focused checks. All61 source pins verified.
- TWO targeted delta cases FAIL against89aabc60 original Codex adapter; PASS patched.
- Independent Claude read-budget regression:1 FAIL (intentional outstanding defect below).
- Full worker/Git/unshare recovery:1 SKIP here, notPASS, because existing unshare sandbox unavailable. Fixture now additionally checks metadata is not a held base, performs full read, then delta through real IPC/coordinator. Claude must rerun it and full suite in existing capable offline environment.
No whole-suite or installed-native-CLI behavior proof claimed here.

## Independent synthetic read-cost replay

A fixed initial snapshot and five commits, sized like Claude's published synthetic plan; NOT actual run-4 requests and NOT a token/billing measurement.

Full-read requested serialized replies total39,367 bytes; delta requested replies18,987 bytes (about52% fewer). Include initial snapshot and metadata. Under the REAL unchanged24,000-byte Codex supplied-text budget:
- full mode delivers4/6 complete snapshots, consumes20,508 supplied text bytes including refusals/prompt, and cannot reconstruct final state;
- delta mode delivers6/6 complete snapshots, consumes18,988 supplied text bytes including prompt, and reconstructs every final file exactly.

Thus comparing actual delivered byte totals alone would be misleading: full mode stopped delivering useful content earlier. The52% figure compares equivalent requested coverage, not actual saved subscription tokens. Whole-file frontier rewrites still cost their complete content; this is no cure for arbitrary context pressure.

## Required Claude-side correction found OFFLINE

Run:
node --experimental-vm-modules proof/review-tests/claude-read-budget.mjs

This drives the REAL Claude adapter's read bridge branch through the existing memory-only CLI/OS helper, with fake socket events and no actual socket/process/model. Helper now captures the existing server callback for tests; original6 timing/accounting checks still pass.

With budget1000:
1. Full reply contains2000bytes and is rejected.
2. A following tiny headOnly reply should fit because the first file was never supplied.
3. Actual result remains ok:false. Reproduced FAIL on89aabc60.

Cause: Claude charge increments contextBytes BEFORE testing the ceiling. Rejecting an oversized read poisons the counter beyond the maximum, preventing every later metadata/delta read. Codex consume already preflights atomically; the Claude branch still needs the same property. Please fix transactionally in your owned adapter, preserve coverage on refusal, and prove the supplied-text allowance never exceeds its cap. Do not solve it by larger budget, auto-resend or counting the skipped payload as delivered.

This failing standalone review regression is deliberately outside default test glob; it is an OPEN defect, not part of a claimed green suite. Please incorporate a normal regression after repair and rerun this proof. No live inference needed.

Transport handoff versus a model actually receiving/understanding a result is still not inferred from pure guard state. No live compatibility conclusion from these mocks.

## Next Claude

Review Codex adapter and8regressions, fix the supplied budget-recovery regression, run full suite plus timing/error/fresh/recovery supplementals and extended worker delta fixture. Publish exact-source acceptance or findings and actual results. M3 cap stays24KB; live trials remain paused, no fifth approval request. No host/credential/Neon/Pi/production operations authorized by this handoff.
