# MYC-P0 — Codex base/read implementation and first-live candidate

4 November 2026, Europe/London. Resumed after V3 delivery/recheck recovery receipt at 85cf5581. No model call, host deployment, web fetch or database operation.

## Engineering changes

Codex now exposes `myc_read` through the existing coordinator `runtime.read`, returns the current integration commit and allowlisted files, counts reply bytes against its context budget, deduplicates concurrent/replayed tool calls, and validates bounded optional paths. No inference dispatch is reserved by a read. Submissions require and forward a 40-character base commit. The coordinator remains the authority for atomic stale-base refusal. A definitive stale refusal returns an unsuccessful dynamic-tool result so the model can explicitly reread/reconcile; no automatic retry. Unknown/transport/STOP errors remain fatal. Read/submit checks do not create another communications framework.

The process stand-in reads integration state before its submission. Both paired-adapter integration tests now retain `requireBase=true`; the prior bypass is removed. Codex adapter-supplied budgets now honour config (24KB/five deliveries in the candidate).

## Evidence and precise limits

- Direct execution `node test/codex-adapter.test.mjs`: **15/15 PASS**, including three new base/read regressions. These use in-memory RPC/streams, not models.
- Direct execution `node test/proof-package.test.mjs`: **3/3 PASS**. Source and pinned JSON agree; commands, equal prompts, hard action/deadline limits and protected oracle placement checked.
- Incomplete breadcrumb implementation produces a nonzero result against fixed acceptance tests, as intended. This is a baseline, not an experiment outcome.
- Updated process-level pairing attempted but **BLOCKED by workspace `spawnSync git EPERM` at initial fixture creation**, before adapter launch. It is not PASS and not waived. No sandbox relaxation or alternative credential was attempted. `node --test` itself misleadingly reported a single wrapper-file pass in this workspace without executing inner tests; the recorded PASS counts above come from direct file execution, with individual test names.
- Prior host rehearsal at 8bac724c is accepted as **owner-executed, Claude-reported mechanical evidence**: launch as myc, sandbox red→green, STOP and zero leftover scopes/tagged processes. Raw host files were not independently accessed here; it does not validate this changed adapter or real model behaviour. The source and rehearsal script were inspected.

## Concrete pinned candidate

`proof/first-live.candidate.json` is generated from `scenarios/breadcrumb-proof.mjs`. `proof/source.sha256` pins source/tests/manifest (verify from session root). Both agents receive the same prompt and shared incomplete multilingual frontier. Six fixed oracle tests under `checks/` are outside the coordinator's `artifact/` write allowlist. Agents can add meaningful supplemental tests under artifact; no prescribed discoveries, lanes, dialogue or forced agreement. Fixture use demonstrates collaboration only; no real-web discovery claim.

Candidate retains the existing approved scope: one Claude process/session and one Codex thread, six authorising inputs each, 600s wall deadline plus5s kill grace, 24KB supplied context each, five deliveries each, 20,000 observed aggregate tokens (observational, may overshoot), £0 incremental paid API via existing subscription guard, no web/Neon/production. CLI command selectors use the existing `/home/myc/bin/myc-run`; absolute Node path and `/home/myc` derive from the reviewed host route. Per-worker2G gives at most4G CLI limits; fixed test sandbox512M. Recheck current headroom against the old7.4GB available observation; do not infer current capacity. Costs/provider request counts remain unknown where unreported, never invented zeros.

**NOT LIVE-READY. Do not run run.mjs with the candidate yet.** The source manifest is pinned, but it is not a signed-off execution bundle. No new permission request while these engineering gates remain:

1. Claude independently reviews this base/read patch and runs the changed process-level tests in an existing capable offline environment, especially concurrent stale submissions. From the session directory: `node --test test/codex-adapter.test.mjs test/claude-codex-bridge.test.mjs test/claude-stream.test.mjs test/proof-package.test.mjs`, then the existing full session suite. Preserve failures, no model command.
2. Publish the exact existing billing wrapper compatibility for app-server and Claude bridge environment. The rehearsal ran preflight, not actual bridge invocation. Do not weaken flags/guard or add credentials to make it work.
3. Add/review a minimal **independent OS watchdog** for the actual proof. Current coordinator uses a JavaScript timer and worker scopes; it does not enforce the promised absolute deadline if the broker hangs. An outer timeout alone must also kill/reap both separately scoped workers and test units. Bound cleanup to this unique session, retain evidence, reject reused output/STOP, and do not touch other services. This is a necessary guard, not a new orchestration layer.
4. Bind final execution command and watchdog to the same source commit/hash manifest, verified CLI versions/schema, fresh headroom and billing guard. Then both engineers sign off the SAME package. Owner approval from30Oct persists within its scope; do not ask Chris to reapprove the same allowance merely because engineering resumed. Any changed allowance/scope must be explained separately.

Next actor Claude through the hub, not owner relay: process-test recheck, review integration, and minimal watchdog proposal/implementation under offline authority. Codex remains co-owner and reviews/extends it. There has been no live attempt to consume the existing grant.

Acceptance remains overlapping active model work, intermediate substantive peer-linked reaction BOTH directions, a changed investigation, substantive contributions from both, integrated executable artifact and trusted tests plus ledger/manual review. Stand-ins, thread/steer ACKs, idle overlap and a mechanically green report do not qualify.
