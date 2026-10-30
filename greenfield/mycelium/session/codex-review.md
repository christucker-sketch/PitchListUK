# MYC-P0: independent Codex engineering verdict

30 October 2026, Europe/London. Reviewed Claude `f7d54f61d606770ba58b0c938ec2a5d2480af7e9`. Code/coordination published in `56e19f8b10f96a32e0b3bbf8962f24afc71fc4da`, then extended with the evidence in this revision.

**CHANGES REQUIRED.** The two persistent worker processes and single-writer broker are the right small starting point. The scripted proof demonstrates event plumbing, not two models reasoning together. It must not be deployed with real tools yet. Preserve this implementation; replace its unsafe boundaries rather than build a second collaboration framework.

## What Codex actually supports

Inspected the locally installed `codex-cli 0.159.0-alpha.3` using `--version`, `exec --help`, `app-server --help` and `app-server generate-json-schema --experimental`. These operations invoke no model. Two independent schema generations have SHA-256 `99085431ecae51f218e46dd87858a03168f5c3c6b5c369315e2f430f4a7eff62`; the selected definitions are in `evidence/codex-protocol-extract.json`. Full schemas are generated locally rather than committed as a large opaque dependency. `codex-protocol-check.mjs` checks the required method/parameter/tool shape; `evidence/codex-protocol-verification.json` records its result.

- `codex exec --json` is output JSONL. Its stdin prompt and `exec resume` are **not evidence of live input injection**. Repeated resume calls are not the solution proposed here.
- App-server is a persistent JSONL RPC connection over stdio. `initialize`/`initialized`, then `thread/start` create a context-bearing thread. `turn/start` begins work; `turn/steer` targets the SAME active turn with mandatory `expectedTurnId`; `turn/interrupt` stops it. An ended or mismatched turn must fail explicitly, not silently start another assignment.
- Dynamic tools declared on `thread/start` generate `item/tool/call` server requests during the turn. Our adapter supplies `myc_publish` and `myc_submit`: intermediate linked findings and candidate files reach the broker before completion. Files are submitted as data; local tools remain in read-only mode.
- The server reports turn lifecycle and cumulative token usage. A turn/steer dispatch is NOT one provider inference request: tools, steering and internal retries can cause more requests. No fabricated per-model-call count or zero-dollar usage is emitted. Monetary cost is null when unknown.
- Accepted steering is a delivery acknowledgement, not proof of cognition or an instantaneous interrupt of generation. The real model must later demonstrate substantive use of the finding. No live test was performed here.

The BRIX inventory previously records Codex 0.164.0, a different build. Its schema and feature compatibility have NOT been established here. Do not install/downgrade a CLI or assume newer means compatible. Claude should run the read-only schema commands in the proof plan through the existing host path. The local generated API is experimental: fail closed on missing methods or changed tool shape.

Claude's `-p --input-format stream-json --output-format stream-json` capability is reported in the hub; no Claude executable exists in this workspace. Further user input over stdin does not, by itself, establish when an active Claude turn consumes it. Claude must independently validate the installed version's streaming/MCP tool behaviour and consumption boundary. If it queues input until a turn ends, keep its persistent context and poll the broker through an approved tool **during** ongoing work. Record that latency honestly. Never force the two workers into alternating completion turns. If either CLI cannot respond before completion, live acceptance fails.

## Tested implementation

`adapters/codex-app-server.mjs` implements the persistent Codex state machine. `adapters/codex-rpc.mjs` implements bounded JSONL transport, UTF-8 framing, correlated responses, tool callbacks, bounded pending/inbound work, timeouts, connection-loss handling and no automatic retry. Concurrent duplicate deliveries serialize into one steer. Context exhaustion and inbox loss stop explicitly. Publication is acknowledged only after the trusted broker accepts it. A duplicate tool call ID executes once; reusing it with changed content fails.

`node greenfield/mycelium/session/test/codex-adapter.test.mjs`: **12 passed, 0 failed**. These use in-memory RPC/stream doubles, not real model processes. They test active-turn steering, durable-permit refusal before dispatch, no restart fallback, context bounds, tool provenance/deduplication, artifact submission, usage/unknown costs, abort/interrupt, split Unicode, response reordering, RPC failures and request flooding. A wire-level fake app-server also emits a linked reply after steering and before its single turn completes. They do not prove provider/server compatibility or genuine collaboration.

The adapter intentionally cannot launch under the old worker. It requires `runtime={rpc,reserve,publish,signal}`. That is a visible integration blocker, not a hidden credential request. `reserve(intent)` must durably reserve BEFORE `turn/start` or `turn/steer`; a lost response consumes the permit and stops. `publish(output)` must await durable append/integration ACK. The launcher and broker, not model code, own these capabilities. Read-only CLI sandbox plus `approvalPolicy: never` does not isolate the CLI process itself or its credential reads: a separately reviewed OS boundary is still required. No CLI process, model, authentication or host setup was run.

## Independent coordinator regressions

`node greenfield/mycelium/session/test/codex-coordinator-regressions.test.mjs`: **0 passed, 9 failed** on the reviewed shared implementation. These assert desired behaviour and are deliberately red; do not invert/skip them. Tests use asynchronous local Git, fake workers and temporary synthetic canaries only.

| ID | Reproduced failure | Required shared fix |
|---|---|---|
| P0-01 | A 500-byte bus cap admits a UTF-8 record exceeding 500 bytes | Bound actual encoded bytes before append; bound data payload too |
| P0-02 | Codex can reuse Claude's event ID and receive that existing finding as its own append result | Dedupe only identical actor/session/payload; reject collisions; never redeliver/re-ACK a conflicting event |
| P0-03 | Two openBus instances both own the file and can allocate the same seq | Exclusive single-owner lock, crash/recovery policy and startup refusal for another writer |
| P0-04 | Reopen accepts invalid actor, wrong session and seq=900 as valid history | Validate all recovered records and monotonic seq; distinguish a torn trailing append from corruption; no silent repair/replay |
| P0-05 | maxCallsPerAgent=0 still runs and records one call | Durable pre-dispatch grants, unique dispatch IDs, no automatic replay after uncertainty; count steer too |
| P0-06 | A queued integration/test finishes and publishes merged after STOP | Stop checks before each mutation, cancellable Git/tests, no post-stop mutation; reserve audit capacity for termination |
| P0-07 | An allowlisted generated test writes a temporary file OUTSIDE the integration tree | Execute tests in an OS sandbox, clean environment, no credentials, no network, bounded process tree/resources |
| P0-08 | A worker that crashed is counted alive until later peer events, fabricating mid-session reaction | Trusted worker exit records terminate its span; distinguish process alive, turn active, delivery and actual reaction |
| P0-09 | STOP kills/ends workers but a child survives and writes after stop | Launcher must own a process group/cgroup and terminate/reap the whole group; cover tools and test descendants |

Exact output: `evidence/codex-coordinator-regressions.log`. The short-lived `adapters/codex-stop-probe.mjs` is a test helper, not a production adapter. Its only child writes one canary under `/tmp/myc-codex-*` after a timer, then exits.

Other source-level blockers (not claimed independently reproduced):

- Inbox overflow drops oldest undelivered events with no cursor replay or ACK. A count cannot restore the missing evidence. Replay from durable seq within a byte budget; on truncation/lag return an explicit gap and pause. Bound transport/IPC buffers as well as the 64-entry array. `wait()` retains timed-out waiter callbacks until a delivery, so an idle persistent worker can leak callbacks.
- Workers inherit the coordinator environment, and generated tests inherit almost all of it. Whitelisting file output does not protect ambient secrets. Keep GitHub/Neon gateway credentials out of both model workers and tests; use narrowly scoped broker operations. No need for new credentials to do this review.
- `git add -A` stages direct worktree edits outside the submitted file list; it is unsafe once real tools can edit. Validate the ACTUAL staged diff, modes, paths and immutable base. Integration tests and Git hooks/config also execute code. Reject worker metadata writes; disable untrusted hooks. Fixed-path writes are not an OS sandbox and have race windows if a worker can mutate their parents concurrently.
- Merge conflicts produce an event, but workers never import each other's integration state. A real read-only Codex must obtain current files through bounded broker context or a trusted snapshot/read tool. No tool-less request to 'rebase' can repair that. Tie a submission to a base commit and reject stale edits rather than losing changes.
- IDs/refs are evidence pointers, not proof of causation. Missing refIds are silently discarded. Peer-ref spam or worker-authored lifecycle-like events must not establish PASS. The analyze() report has no success predicate and trusted execution/cost/receipt linkage is incomplete.
- stop() appends to the same possibly full stream BEFORE setting its stopping guard. Stream exhaustion can recurse through emit()/stop(). Reserve control/ledger capacity and enter stopping state first. Recovery cannot auto-redo uncertain model dispatches.

The original seven tests: **1 pass, 6 blocked by `spawnSync git EPERM`** here, before their scenarios run. This workspace limitation is distinct from the nine executable failures. Neither the prior seven-pass report nor these results establishes a live model proof. We did not rerun unrelated historical suites or alter tests to conceal the environment restriction.

## Joint next step and mission

Direct GitHub handoffs were published with the claim and `56e19f8b`; Claude owns the shared bus/worker/launcher bridge fixes, Codex owns the steering transport and independent attacks. No claim Claude has read/replied until it is evidenced. The six-turn package stays parked. Real acceptance is NOT approved while these blockers remain.

Use the first shared artifact to improve Mycelium's domain-independent multilingual breadcrumb/frontier handling, with retained source URLs, link context, deduplicated revisitable frontier and separate eligibility evidence. Do not spend another programme selecting synthetic lanes or awarding fictional rewards. The current links-proof fixture is authored synthetic HTML, NOT a recorded public-web corpus or evidence of unexpected discovery. A recorded public fixture is still missing; none was fabricated or fetched under this offline grant. Acquire a small bounded corpus only under the separate fetch approval in `codex-live-proof.md`; retain counterexamples and compare equal-budget fixed-search and breadcrumb exploration without treating unverified opportunity hints as confirmed trader eligibility.

Deliverable status: independent verdict, tested Codex adapter candidate and red regressions DELIVERED; real worker integration BLOCKED on trusted runtime/CLI/sandbox proof, Claude side unverified; live proof NOT RUN. The smallest staged plan and exact remaining gates are in `codex-live-proof.md`.
