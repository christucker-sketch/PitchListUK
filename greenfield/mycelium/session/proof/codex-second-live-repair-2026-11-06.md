# Second-proof L1 repair — Codex, 6 November 2026

The second run remains a mechanical FAIL. Claude's published report supports 151,336ms confirmed overlap, two-way reactions, peer-influenced work and newest fixed-test PASS, but Codex context-read failure stopped the pair. Raw second-run evidence has been requested through the hub; these are not independently certified raw-ledger findings.

## L1 fix

Keep the cumulative 24,000-byte supplied-context limit. Oversized integration reads return unsuccessful read_context_budget receipts instead of throwing while sufficient bounded control space remains. Successful reads leave 256 bytes of control headroom. Refusal text itself counts against the same ceiling; repeated refusals eventually stop honestly if even the receipt cannot fit. No silent truncation or automatic larger budget. consume() now checks before incrementing, so unseen rejected content is not charged. Identical call IDs retain the same receipt and never repeat the broker read.

Expose the already-existing runtime headOnly boolean in myc_read, allowing a cheap current-base read without all files. Selective paths remain supported. Unknown broker/transport failures remain fatal. This is a targeted recovery mechanism, not unlimited context or a guarantee a 600-second session cannot exhaust its finite budget. Publish/submit ACK accounting is unchanged; this is the existing supplied prompt/peer/read budget, not total provider context/token accounting.

## Actual offline tests

Direct execution under Node 24.19.0 in this managed workspace:
- New codex-read-budget: 4/4; baseline original adapter: 3 failures and 1 pass. Baseline fails oversized-read recovery, headOnly and repeated-refusal handling.
- Existing codex-adapter: 15/15.
- Existing codex-live-regressions: 10/10.
- Existing codex-boundary: 10/10.
- Existing proof-package: 3/3.
Total 42/42 patched focused checks. No model calls, host services, live database, sandbox changes or deployment. No whole process-suite or target Node 22 claim. Source hashes regenerated.

## Remaining work / Claude handoff

Claude owns L3 combined fixed oracle plus integrated artifact tests and L4 explicit partial-output lower-bound usage reporting. Fixed checks must always run, supplemental failures must fail integration, and absent optional tests must be handled explicitly. Keep the oracle outside model write access. Please run the full suite and independently review these Codex changes.

L2 stale refusal is correct: reconcile against latest integration; do not bypass optimistic concurrency. Request sanitized second-run events/report/watchdog/final files plus recoverable refused Claude tests with provenance. Posthoc checks never become in-session evidence.

Both grants consumed. No third live run is authorized or launched here. After L3/L4 and joint source/evidence review, prepare a distinct immutable third candidate, command, output path and owner approval request; do not reuse live-2 script/grant.
