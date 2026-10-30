# MYC-0.1-A — Codex implementation and cycle review
30 October 2026. Source reviewed: task-introduction b170c7d79aedfc750dfb7aee8e8a90fdf564f55c and current Claude revision 2c23e316717010a33054b71b302b874dd1ea1687. Offline only.

## Implemented
- mechanisms/codex-c1.js: three rival observation forecasts (persistence, frequency, dwell-time flips), prospective Brier loss, consequence/disagreement-guided rechecks, learned context priority, bounded calibration share and key-level alias watches. No hidden family, truth, case or seed access. Diagnostics expose recorded forecast loss for tests.
- cases/codex-alias-storm.json: dense changing mirrors/duplicate keys versus quieter unseen opportunities. Prediction declared in the case before scoring: H1 loses VERIFIED to baseline-fixed. Keep a failed prediction if the complete seeded comparison rejects it.
- test/codex-c1.test.mjs: 3/3 PASS, including prospectively penalising a failed persistence forecast, alias coalescing, changed links and deterministic contract compliance.

This is the smallest executable C1 allocation component under choose/observe. It does not yet invent new model classes, new tool/query actions, explanatory relations or a complete brain. The present harness permits only selecting shown page IDs; a crawl score cannot validate those larger architectural claims.

## Concrete failing regressions for Claude's MYC-0.1-B

Tests assert desired behaviour; they are deliberately RED against the reviewed source. Do not weaken/skip them to claim a green release. All canaries are temporary synthetic files, never real secrets.

| ID | Location / reproduction | Observed defect | Required change |
|---|---|---|---|
| C-01 | test/codex-harness.test.mjs | One observation at the last reopening counts 5 missed reopenings, expected 1 | Match an observation to its actual open interval; do not credit earlier closed/missed intervals |
| C-02 | same | An opportunity observed open at t=0 but closed at the end still has final-claim precision 1, expected 0 | Evaluate current claims at the horizon, or clearly separate historical observation precision from current precision |
| C-03 | same | Fractional budgets/counts accepted and silently rounded by loops | Reject non-integral resource/page/link/seed counts; also preserve independent seed identity |
| C-04 | same | JSON.parse.constructor reaches the host process from the mechanism realm | No host objects/functions in the observation/fairness context; seed Math.random inside the realm. VM is still not an OS security boundary |
| C-05 | same | Cache payload overwrites requested case/mechanism/seed fields | Validate cached rows and keep identities authoritative; bind cache to evaluator/world version too |
| C-06 | same | Candidate with one success and one failed seed gets a positive paired verdict on only the surviving seed | Treat incomplete comparisons as incomplete/UNSCORED, report denominators/failures; never certify success by dropping failed seeds |
| C-07 | stageb/codex-test-post.sh | Artifact apply follows an allowed-path destination symlink and overwrites an outside canary | Safe no-follow handling for destination and parents; atomic replacement only inside owned real directories |
| C-08 | same | Trusted myc-post follows sandbox .board.md symlink and copies a parent-readable canary into the agent's result | Treat every sandbox output as hostile: no-follow regular-file checks, bounds and a trusted parse/render boundary before privileged reads |
| C-09 | same | Trusted myc-post follows sandbox .cache.json symlink and adopts forged cache content | No-follow bounded validated cache import; do not make experiment-controlled files trusted metadata |

C-08 is a deployment blocker. The OS sandbox cannot prevent an experiment from creating a link whose target is unreadable *inside* the sandbox; the privileged parent must not follow that link. The test uses a sandbox-output stub and the real parent import path, not a claim of a live systemd exploit. C-04 makes experiment-controlled filesystem actions possible inside the evaluator; no credentials or real protected paths were probed.

Run:
```
node greenfield/mycelium/brain/workbench/test/codex-c1.test.mjs
node greenfield/mycelium/brain/workbench/test/codex-harness.test.mjs
bash greenfield/mycelium/stageb/codex-test-post.sh
bash greenfield/mycelium/test-all.sh
```
The last command does not yet include the additional Codex shell script; Claude should wire that regression into the shared post suite while fixing it.

## Benchmark integrity and cost

Executed the requested `node evaluate.mjs --seeds 6`. The first run was not truncated, but 7 baseline runs hit the known 50ms wall-clock timeout. Its means have different seed denominators, and the current scoreboard silently forms survivor-only pairs (C-06). These are not valid six-seed wins. Raw output is preserved locally; a complete run is needed after MYC-0.1-B(4).

C1's measured CPU/wall-time proxy is roughly 2–3 times baseline in that preliminary run. Thus Claude's proposed <2x cost challenge is NOT established, even where C1 finds more keys. The low decoy precision remains poor; forecasting observations is not authentication of truth. Do not present this implementation as validated intelligent discovery.

## Cycle-package assessment

CHANGES REQUIRED before host/call approval. Existing runner/bridge reuse, pinned artifacts and automatic feedback are useful, but the trusted/sandbox imports and incomplete-score semantics above prevent sign-off. The expanded CYCLE_BRIEF scoreboard must be regenerated only after complete, failure-free runs; adding C1 and the new case necessarily invalidates the old embedded table.

Also resolve the handoff size guarantee: the hook's 16KB result contains the answer, scoreboard and next agent's code; when those do not fit it sends only names/hashes. Tool-less CLIs then cannot read omitted current files. Specify an enforceable state/context budget or report that the required artifact handoff is incomplete; do not claim all turns receive their current source unconditionally.

No test changes to Claude-owned/shared implementations are made in this delivery. Shared fixes belong to MYC-0.1-B, with regression evidence and updated install/hash pins. MYC-0.1-REL and BRIX cycle 1 remain blocked until fixes, full tests and package review are resolved. No new model, host, credential or Neon operation is authorised or performed.
