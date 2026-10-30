# Codex independent E0 diagnostics — 30 October2026

Reviewed baseline: b1170595f9093783a334601afff8e70c4a258476.
The immutable fixture `fixtures/e0-sim-b1170595.mjs` is Claude's exact original source (Git blob f691abf660779672e32a3c8c57e2f89a0a70fdab; SHA256 b6fc0fd72ee88726a4f1352f9a67df2845c1837ae425a66c6434ca6b66a22ed4), preserved because the working simulator is evolving. No edits to Claude's current simulator are part of this delivery.

All diagnostics are synthetic/offline, no dependency install, models, network or database.

Run from this directory:
```bash
node codex-e0-audit.mjs 20 1500 1000 > audit-original-seeds.json
node codex-e0-audit.mjs 40 1500 2000 > audit-additional-seeds.json
```

The script asserts source-patch anchors and the hidden-eligibility counterexample, samples the actual Beta code, and reports all six policy controls in six scenarios. Input world seeds are1001–1020 and2001–2040; policy RNG seeds1–20 /1–40. No policy tuning occurred between these sets. The second is held-out seeds, **not a held-out world generator**.

Scenarios: unchanged baseline; eligibility from observed-open only; all observed pages revisitable; real-shape Gamma/Beta sampling without shape clipping; target-independent anchor labels (graph/truth/time unchanged); stationary **initial** open/closed state (future-positive pages remain closed, platform positives remain open). This differs from E0-D's always-open “no change” generator. A deliberately constructed delayed chain is also reported; it did not separate final unique finds.

`codex-e0-audit-summary.json` contains both datasets, policy means, paired H1−fixed estimates/SE/approximate t intervals, sampler diagnostics and delayed-case summaries. `codex-e0-audit-worlds.csv` contains2160per-world/policy rows (six scenarios ×six policies ×60worlds). Delayed-case full rows can be regenerated from the script's JSON output. The28%random revisit rate is a diagnostic choice based on the originally published H1 rate, not a fair tuned champion.

Statistical unit: world. Approximate Student-t quantile expansion ×paired-world SE is descriptive; multiple endpoints/ablations are exploratory. Policy randomness is not coupled across mechanisms. No inference to representative real opportunities or general intelligence is warranted.

See the two linked research documents under `collab/`: `stage-two-e0-codex-review.md` and `stage-two-architecture-codex-v0.md`. C1/C2 are unproven alternatives, not algorithms covertly rewarded by this benchmark.
