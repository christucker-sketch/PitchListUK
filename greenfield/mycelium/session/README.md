> **Codex independent review (30 October): NOT LIVE-READY.** [Verdict and nine reproduced failures](codex-review.md), [bounded live-proof candidate](codex-live-proof.md). The Codex app-server adapter has 12 passing offline tests and uses persistent same-turn steering. It requires trusted runtime injection absent from the original worker and cannot launch a model by itself. Shared regression tests intentionally fail until Claude hardens the coordinator; the seven-test fake proof is not a live acceptance result.

# Concurrent session (MYC-P0-BUS): offline proof

Claude and Codex run **at the same time** on one shared problem. Each has its own worker process and its own git worktree. The coordinator is the single writer of an append-only stream (`events.jsonl`) and delivers every event to the other agent the moment it is written. The tests use fake agents only: no model, no network, no host changes.

```
node --test greenfield/mycelium/session/test/      # 7 tests: proof, negative controls, stop, limits, safety, inbox, bus
node greenfield/mycelium/session/demo.mjs [dir]    # prints the timeline and the evidence report of the proof scenario
```

**Evidence (`analyze()`, computed only from the stream):**

| Field | Meaning |
|---|---|
| `overlapMs` | How long both sessions were live together |
| `callOverlapMs` | How long both agents' model calls were in flight together |
| `midSessionReactions` | Events by one agent that reference the other's event while both sessions were live |
| `commitsCausedByOther` | Commits whose reference chain starts at the other agent |
| `integrationTests` | The shared test result after each merge |

The negative controls show that parallel solo work, or a reply sent only after the other agent finished, does **not** count.

**Event:** `{seq, id, at, session, actor: claude|codex|coordinator, kind, refs: [seq], body ≤4000, data?}`.
- `kind` is one of `start note finding question challenge reply commit merged conflict refused call limit stop done error`.
- Adapters refer to earlier events by **id** (`refIds`); the coordinator maps ids to seq.
- Duplicate ids are not stored twice.

## Adapter interface (MYC-P0-AGENT plugs in here)

`adapters/<name>.mjs` exports `async function* agentRun({ agent, session, config, worktree, inbox, acks })`.

**It yields:**
- `{type:'event', kind, body, refIds?, id?, data?}`
- `{type:'files', files:[{path, content}], message, refIds?}`. The coordinator writes the files (allowlist `artifact/`, no symlinks, no dotfiles), commits them on the agent's branch, merges into `session/<id>/integration`, and runs the shared tests there. It reports `commit`, `merged {tests}` or `conflict`.
- `{type:'call', startedAt, endedAt, ms, model?, inputTokens?, outputTokens?, costUsd?}`, one per model call, for the ledger.
- `{type:'done', body}`.

**It reads:**
- `inbox.take()` returns the new events.
- `inbox.wait(ms)` resolves on the next delivery or after `ms`.
- `inbox.dropped` counts events lost because the bounded inbox (64) overflowed.
- `inbox.stopped` becomes true once the coordinator says stop.

The fake adapter (`adapters/fake.mjs`) is a scripted reference.

**What a real adapter must add:**
- a way to put new inbox events in front of a live model session. The Claude CLI (2.1.314) has `-p --input-format stream-json --output-format stream-json`, which takes further user messages on stdin while running. Codex's equivalent is still to be checked;
- a context budget per delivery;
- the CLI's tool/sandbox mode;
- a `call` record per model turn.

**Controls:**
- a `STOP` file in the session directory;
- `limits.maxWallMs` and `maxCallsPerAgent`;
- the stream size limit (`maxEvents`);
- a grace period and then SIGKILL;
- after STOP, only the ledger lines of calls that were already running are accepted.

**Not yet:** real adapters, live calls, the web breadcrumb experiment (MYC-P0-AGENT, proposed for Codex), and any deployment. The coordinator runs both workers on one machine.
