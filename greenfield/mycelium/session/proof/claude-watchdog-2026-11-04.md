# MYC-P0: Claude's independent check of Codex 33088f09, the OS watchdog, and the billing-guard review

4 November 2026, Claude (Cowork session with Chris). This is offline work only: no model call, no host or Neon change, and no web use by any session.

## 1. Codex's base/read patch (33088f09): independent test and review

- At 33088f09, `proof/source.sha256` verified with every file OK.
- The four files Codex asked for, run with `node --test` one at a time:

  | File | Pass |
  |---|---|
  | `codex-adapter` | 15/15 |
  | `claude-codex-bridge` | 1/1 (also run directly with its named test: ok) |
  | `claude-stream` | 2/2 |
  | `proof-package` | 3/3 |

- **Full session suite `node --test test/*.test.mjs`: 53/53 PASS.** It includes the process-level pairs Codex could not run (spawnSync EPERM there):
  - test 15/16, "Claude adapter + Codex adapter concurrently (stand-in CLIs; stdin midturn / queue)";
  - stale-base refusal, 31 and 50.
- This environment runs as root with `unshare`, so the sandbox tests run for real. The systemd backend is still only exercised on fpd-prod.
- Running bare `node --test test/` counts one wrapper test and fails (`not ok 1 - test`). Use the file glob instead. This confirms Codex's warning about the runner.

**Review (adapter diff):**

- **Accepted.** `myc_read` charges context and is deduplicated per callId. A base is required. The stale regex matches the coordinator's exact message (`stale submission: integration is now <40 hex>`, coordinator.mjs:170). A stale refusal becomes an unsuccessful tool result under the same callId, with no retry. Anything else stays fatal.
- **Observation.** Every `myc_read` reply counts against the same 24 KB context as peer deliveries. With growing files, a few reads can exhaust it. It fails explicitly (test 30), not silently, but it may end Codex's turn early. Consider a separate small read budget.
- **FINDING for Codex, must resolve or explicitly accept before live:**
  - The Codex thread starts with `sandbox: 'read-only'` and `approvalPolicy: 'never'`. As I understand Codex's read-only sandbox, the model's built-in shell may still **read** any file the `myc` account can, including its own sign-in file, without approval.
  - It could then copy what it read into the stream through `myc_publish`.
  - Claude's side has no built-in tools at all (`--tools ""`, only the four myc MCP tools).
  - Please confirm what the installed 0.164.0 app-server exposes under this thread config, and disable shell/file tools or confine reads to the worktree if the protocol allows it. The prompt's "no credential access" is an instruction, not enforcement.

## 2. Independent OS watchdog (new: `watchdog.mjs`)

**Gap:** the 600 s limit was a JavaScript timer inside the broker. A hung or dead broker would leave the two separately scoped workers, and any test unit, running.

**Design.** Minimal, no new orchestration. The deadline is handed to PID1 before anything starts.

1. **Refuses** a reused output folder, and any loaded unit, slice or cgroup process this session id already has. Nothing is started on refusal.
2. **Arms first** a transient timer `myc-watchdog-<id>`. It fires at `ceil((maxWallMs + graceMs)/1000)`, which is **605 s** for the candidate.
   - When it fires, it writes `cgroup.kill` on `mycp_<id>.slice`, then runs `systemctl kill --signal=SIGKILL` and `stop` on that slice.
   - If arming fails, nothing starts.
3. **Starts the broker** (`run.mjs`) as the transient service `myc-session-<id>-broker`.
   - It has `RuntimeMaxSec` = deadline + 30 s (**635 s**) so the report can be written, and `KillMode=control-group`.
   - It sets `MYC_SESSION_SLICE`, so both worker scopes (`--slice`) and every sandboxed test unit (`--slice=`) join the session slice.
4. **Always cleans up afterwards**, whether the broker ends normally, fails, or the wrapper gets SIGINT/SIGTERM/SIGHUP:
   - records whether the deadline fired (`LastTriggerUSec`);
   - kills the slice, then stops the broker, the slice and the timer, and resets failed units;
   - sweeps tagged processes as a backstop;
   - verifies **0 processes in the slice and broker cgroups, 0 active or failed session units, and 0 tagged processes**;
   - writes `<out>/watchdog.json`.
5. It touches only units named for this session id. Overrides (`--deadline-s`, `--broker-max-s`) can only shorten the deadline.

**Gate in `run.mjs`:**

- Real model adapters under `systemd-scope` are refused unless `MYC_SESSION_SLICE` is this session's slice. So the live candidate can only run under the watchdog.
- A foreign slice is refused.
- Both refusals happen before anything is created.
- Fake-agent rehearsals are unchanged.

**Independence:**

- If the wrapper is killed with SIGKILL, PID1 still kills the agents and tests at 605 s and the broker at 635 s.
- Units left behind make a rerun with the same id refuse, which forces a new id rather than a reuse.

**Why cgroups, not the tag:**

- `myc-run` execs the CLIs with `env -i`, so the CLI processes (and anything they spawn) do **not** carry `MYC_SESSION`.
- The existing tag sweep, and the rehearsal's "tagged processes left" count, are blind to them. Only the scope/slice cgroup contains them.
- The watchdog therefore verifies by cgroup process count.

**Tests:**

- New `test/watchdog.test.mjs`, **9/9**, with stand-in systemd-run/systemctl that log what PID1 is asked to do. It covers:
  - plan values for the candidate (605/635, slice, unit names);
  - overrides may only shorten;
  - the deadline is armed before the broker, with only the reuse check before it;
  - cleanup and verification after a normal end, a broker failure and a fired deadline;
  - refusals start nothing (reused folder, existing units, a non-empty slice cgroup, failed arming means no broker);
  - leftover slice processes give NOT CLEAN, and `cgroup.kill` is written;
  - SIGTERM to the wrapper triggers cleanup and is recorded;
  - the run.mjs gate (no slice or a foreign slice: exit 2, nothing created);
  - the scope and sandbox `--slice` plumbing and misuse refusals.
- **Full suite now 62/62.**
- **On the host** (not exercisable offline: no PID1 systemd here), `brix-rehearsal.sh` step 4 runs fake agents mid-call under the watchdog with a 6 s deadline. It requires:
  - the deadline to have fired;
  - a CLEAN watchdog record;
  - both scopes in `mycp_rehearsal_w.slice`;
  - both workers exited with SIGKILL;
  - completion in under 30 s;
  - 0 leftover units or tagged processes.
- It also probes whether `cgroup.kill` is present. If it's missing (kernel older than 5.14), the `systemctl kill` fallback is what the step tests.
- Not covered on the host: a broker that itself hangs past `RuntimeMaxSec`. That's plain systemd behaviour; the probe records the configured `RuntimeMaxUSec`.

**Coordinator note:** the internal stop can take up to 2 × graceMs (10 s) after 600 s. The outer 605 s absolute limit takes precedence; that is intended.

## 3. Billing guard and connector compatibility (review of the source; host confirmation below)

`/home/myc/bin/myc-run`, as installed by `greenfield/docs/mycelium/preflight/myc-setup.sh`:

- Expected sha256 `827c2940a4b846da61bc93f6e677933ad1caf9fee0be488e7edb27927c2444bd` if it is unchanged.
- It refuses to start if any of these is set: the ANTHROPIC_ / CLAUDE_CODE_USE_* / OAuth-token / OPENAI_ / CODEX_API_KEY / *_BASE_URL variables, apiKeyHelper, `~/.config/anthropic`, or `--bare`.
- Otherwise it `exec`s with `env -i` and keeps only HOME/USER/LOGNAME/LANG/TERM/PATH.

How each connector fares:

- **Claude (`claude-stream`).**
  - The arguments contain no `--bare`.
  - The bridge socket is passed **inside the `--mcp-config` JSON** (`env.MYC_BRIDGE_SOCK`), not the process environment, so it survives `env -i`.
  - The bridge is started by absolute node path from the reviewed source tree (a+rX).
  - stdin/stdout stream-json go through `exec` unchanged.
  - `--setting-sources ''` does not stop the guard reading `~/.claude/settings.json`.
  - **Compatible.**
- **Codex (`codex-app-server`).**
  - `myc-run codex app-server --listen stdio://` keeps stdio. CODEX_HOME is not needed (the default is `~/.codex`).
  - The adapter passes no env.
  - **Compatible.**
- **Not a code check.** Owner account settings (Claude extra usage OFF, no Codex credits or API key) are what make £0 true. The preflight checks sign-in type, not account billing options. Chris should reconfirm them just before the live run.

**Host read-only confirmation still needed (Chris on fpd-prod):**

- the `myc-run` hash;
- free memory, disk, kernel and systemd version;
- a rerun of the rehearsal at this commit (step 4 is new).

Then both engineers sign off the SAME commit (gate 4).

## 4. Host evidence (fpd-prod, run by Chris, pasted; read-only except the rehearsal's own transient units)

**Host checks:**

| Check | Result |
|---|---|
| `myc-run` sha256 | `827c2940…44bd`, **matches the source** |
| Memory | 7280 MB available of 7769 (swap 5908) |
| `/` | 95 G free |
| Kernel | 6.12.113 (cgroup.kill supported) |
| systemd | 257 |

**Rehearsal at b3512f40** (evidence `/var/tmp/myc-rehearsal.WZdL8Y`):
- Steps 1–3 PASS as before: preflight OK for both CLIs, MECHANICAL PASS with FAIL→FAIL→PASS, 0 leftovers, and STOP with 0 leftovers.
- **Step 4: the watchdog worked; my check failed.**
  - Armed 14:18:16.521Z, broker started 3 ms later.
  - Both scopes were in `mycp_rehearsal_w.slice`, cgroup.kill was present, and the broker had `RuntimeMaxUSec=20s`.
  - Broker log: claude was SIGKILLed at +5889 ms and codex at +5931 ms, i.e. at the 6 s PID1 deadline while both were mid-call. The coordinator ended at +8015 ms. The broker exited 1, as expected (mechanical FAIL because of the kill).
  - Leftovers: sliceProcs 0, brokerProcs 0, units [], tagged 0. **CLEAN.**
- **Defect found (mine, fixed in this commit):** the record said `fired:false`. systemd discards a one-shot transient timer after it runs, so `LastTriggerUSec` could no longer be queried.
  - Fix: the timer's PID1 command first appends a timestamp to `<out>/deadline-fired`. `fired` and `firedAt` now come from that marker. The cleanup kill never writes it, so a firing can't be faked.
  - The output path is restricted to plain absolute paths, because it is interpolated into the PID1 shell command.
  - New test: watchdog 10/10; full suite 63/63.
  - Also fixed: the rehearsal's slice probe compared a string that systemd separates with a blank line. It now counts matching lines and also requires the marker file.
- A rerun of the rehearsal at this commit is needed before sign-off.
