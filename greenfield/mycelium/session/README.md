# Concurrent session (MYC-P0-BUS + MYC-P0-AGENT): offline

Claude and Codex run **at the same time** on one shared problem. The pieces:
- Each agent has a worker process that leads its own process group, and its own git worktree.
- The coordinator is the single writer of an append-only stream (`events.jsonl`). It tells workers when new events exist, and they pull them from a cursor; nothing is dropped.
- Commits from each worktree are merged into an integration branch. The shared tests run on a copy of each merge commit, inside an OS sandbox.

No model, network or host changes are involved: the tests use scripted fake agents, and process-level stand-ins for both CLIs.

```
node --test greenfield/mycelium/session/test/      # 36 tests (Claude + Codex suites)
node greenfield/mycelium/session/demo.mjs [dir]    # timeline + evidence of the fake-agent proof scenario
```

## Controls (each one tested)

- **Pre-dispatch grants.** `runtime.reserve(intent)` writes a durable `grant` before any model turn or steer. With an allowance of zero there are no dispatches. Every `call` ledger line must use an unused grant. Steering counts as a dispatch.
- **The stream** (`bus.mjs`):
  - one exclusive writer (a lock file);
  - limits counted in UTF-8 bytes;
  - deduplication is exact, and a reused id with different content is refused as a collision;
  - every record is validated when the stream is reopened; a torn final line is reported, not repaired;
  - control records keep reserved headroom, so a full stream can still record its stop.
- **STOP** (file, wall-clock limit, or full stream):
  - the stopping flag is set first, so no new grant, publication or Git mutation can start;
  - a Git step already running finishes before the `stop` record, so nothing is committed or merged after it;
  - running tests are aborted;
  - workers are signalled, then their whole process groups are killed;
  - each worker's exit becomes a trusted `exit` record, and that ends its live span.
- **Files:**
  - only the submitted paths, exactly, under `artifact/`;
  - no symlinks, dotfiles or modes other than 100644;
  - direct worktree edits are discarded and reported;
  - Git hooks are disabled.
- **Tests** (`sandbox.mjs`): they run on a copy, as `nobody`, with no network, a private `/tmp`, a clean environment and rlimits. If no sandbox works they are NOT RUN (fail closed). The backend is `unshare` here; on fpd-prod it would be `systemd`, which is untested.
- **Workers** get a clean environment: nothing is inherited except PATH, plus explicit `config.env`.
- **What is delivered to a peer:** the other agent's finding, question, challenge, reply and commit events, plus the coordinator's tested, conflict, refused, stop and limit events. Notes, grants and ledger lines are recorded but not delivered: each delivery may cost a model steer.

## Adapters

All adapters use `async function* agentRun({ agent, config, worktree, inbox, runtime })` with `runtime = { reserve, publish, signal, rpc? }`:
- `publish` resolves with the coordinator's receipt;
- `inbox.take()` and `inbox.wait(ms)` read from a bounded, replayed buffer.

| Adapter | How it works | Offline evidence |
|---|---|---|
| `fake` | Scripted reference | — |
| `codex-app-server` (Codex) | Persistent app-server thread; `turn/steer` into the same active turn; `myc_publish` / `myc_submit` dynamic tools | 12 tests (Codex); `test/claude-codex-bridge.test.mjs` runs it under the real worker runtime with a process-level app-server stand-in |
| `claude-stream` (Claude) | One persistent session (`claude -p --input-format stream-json --output-format stream-json`), started with `--restricted`, `--tools ""` and only the `myc` MCP bridge (`mcp-bridge.mjs`: `myc_publish`, `myc_submit`, `myc_inbox`). Peer events go both to `myc_inbox` (read during the turn) and to stdin, under a grant | `test/claude-stream.test.mjs`: both adapters together, with a stand-in for each CLI |

How each stdin delivery to Claude is classified (from `--replay-user-messages`):
- `mid-turn`: taken in during the running turn;
- `queued`: held until that turn ended;
- `new-turn`: sent while Claude was idle.

**Not yet proven:** whether the real CLI consumes stdin mid-turn. Collaboration does not depend on it, because `myc_inbox` is read during the turn either way.

**Evidence:** `analyze()` computes the following from the stream alone:
- `overlapMs` and `callOverlapMs`;
- `midSessionReactions`: references to the other agent's event while both sessions are live; a crashed agent's span ends at its exit;
- `commitsCausedByOther`;
- `integrationTests`;
- `pass.criteria`, and `pass.mechanical` when all criteria hold.

`pass` always says manual review is required, because references prove linkage, not substance.

**Not done (needs Chris's separate approval of a bounded package):**
- running the real CLIs;
- confirming the installed versions' schemas and flags on fpd-prod;
- the systemd sandbox backend on fpd-prod;
- memory headroom;
- the real-web breadcrumb fixture.
