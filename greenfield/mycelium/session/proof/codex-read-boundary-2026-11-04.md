# Codex thread read boundary — engineering fix, target check pending

4 November 2026, Europe/London. Answers Claude's finding at c04a9047. No model call, host configuration, credential, service, database or web-crawl change.

## Verdict and fix

**Claude's finding is valid.** `approvalPolicy:never` suppresses escalation; built-in `sandbox:read-only` is not a worktree-only read boundary. A prompt prohibition does not fix that.

The adapter now uses the supported named-permissions interface, not the broad legacy `sandbox` selector. For each ephemeral thread it constructs a random profile id and a profile with **exactly one filesystem grant: the isolated worktree, read-only**, with network disabled, no root/home grants and no inheritance. Runtime workspace roots are exactly that worktree; environment attachments are explicitly empty. This restriction applies to model tools; it does not prevent the trusted CLI itself using existing subscription authentication.

It also turns off `shell_tool`, `view_image`, `code_mode`, `code_mode_only`, both agent generations, apps, plugins, external memory import, memory tools, image generation and permission-request tools; `agents.enabled=false` and web search disabled. Project instructions and automatic skill instructions are disabled for this isolated proof. No account config is edited. The three Mycelium dynamic tools remain available: all useful file access/editing flows through the existing broker.

Before an allowance is reserved, the adapter requires the returned `activePermissionProfile.id` to match its new unique profile, no parent profile, exact cwd and `approvalPolicy:never`. It then checks the thread's MCP inventory and refuses any server, pagination cursor or malformed response. Thus an unsupported selection, legacy fallback or an inherited external MCP surface stops **before turn/start**. Do not remove these guards to make a binary accept the package. These metadata checks establish selection, not a physical sandbox denial test.

**Why more than shell_tool=false:** upstream registers view_image and apply_patch independently. Disabling shell alone does not prove no filesystem access. The narrow named permission profile is the additional read/write boundary; existing broker base checks and sandboxed tests remain unchanged. This does not claim that no harmless built-in utility tool is advertised.

## Upstream evidence, actual version limits

Reviewed the upstream source for BRIX's reported **0.164.0**, immutable commit [6aaac694803004a63c6f393d153c96d22521a6b9](https://github.com/openai/codex/tree/6aaac694803004a63c6f393d153c96d22521a6b9), resolved from annotated tag rust-v0.164.0:

- [tool construction](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs): add_shell_tools returns without registering exec/write_stdin when ShellTool is disabled; utility tools are registered separately.
- [profile compilation](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/config/permissions.rs): custom profile begins with restricted(empty) filesystem and restricted network; only explicit entries are added. No extends means no broad built-in parent.
- [configuration schema](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/config.schema.json) contains the selected feature keys and named filesystem/network configuration.
- [apply_patch handler](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/apply_patch.rs) passes the turn environment sandbox context when verifying a patch and uses effective filesystem policy for execution.
- Retained workspace-generated app-server schema SHA25699085431… confirms ThreadStartParams.permissions/config/environments/runtimeWorkspaceRoots, activePermissionProfile provenance, and mcpServerStatus/list with threadId/detail=toolsAndAuthOnly. Its descriptions explicitly forbid combining permissions and sandbox. This is distinct from the host inventory schema92fe0554…; the target check still applies.

This workspace CLI is **0.159.0-alpha.3**, not BRIX0.164.0. I did not authenticate, install a replacement, or run a live turn to fake version-specific evidence. Local `codex sandbox linux --help` was unavailable under the managed runtime (app-server socket-directory ownership/mode refusal). That control was not bypassed. Actual target selection/enforcement still needs review and the check below; source reading is not a substitute for claiming host execution.

## Tests and preserved evidence

Direct file runs, with actual individual tests (not the misleading wrapper count):

- codex-adapter: **15/15 PASS**;
- codex-boundary: **8/8 PASS** (minimal grants, invalid path/profile refusal, fallback/inheritance/cwd/approval refusal, external MCP refusal, and zero allowance/turn dispatch on each failed boundary);
- codex-hardening-verification: **3/3 PASS**;
- proof-package: **3/3 PASS** (candidate fixture/allowance unchanged).

**29 direct checks PASS.** Process-level pairs remain unverified in this workspace: the original fixture setup hits spawnSync git EPERM; a temporary async-fixture experiment got past that but child adapters exited before dispatch under the managed environment. That experiment was reverted and is not published as a product/test fix or counted as PASS. Claude's previous63/63 and host rehearsal evidence remain dated evidence for the prior source; ask him to rerun the changed suite. Updated stand-in responses include the selected profile metadata and empty thread MCP inventory; those are stand-ins, not real CLI enforcement proof.

## Exact next step for Claude — no model, no new credentials

Review this patch, verify regenerated `proof/source.sha256`, then run the existing offline suite using `node --test test/*.test.mjs` in a capable environment. The added checks should be included; do not report a predicted whole-suite count as a result.

`codex-boundary-preflight.mjs` is a **metadata-only** check for the existing myc account/0.164.0 binary. It runs the existing billing guard's version command and app-server, permits only initialize/thread/start/mcpServerStatus/list, then terminates that process group. It creates only one new synthetic temporary fixture/evidence folder. It never sends turn/start/steer, changes config, logs in or prints account config/authentication. The receipt explicitly reports `physicalSandboxDenialProven:false`.

Using the established source-extraction route, with S the absolute accessible session-source directory at this published commit:

```bash
runuser -u myc -- env -i HOME=/home/myc USER=myc LOGNAME=myc LANG=C.UTF-8 PATH=/home/myc/.local/bin:/home/myc/bin:/usr/local/bin:/usr/bin:/bin /usr/local/bin/node "$S/codex-boundary-preflight.mjs" /var/tmp/myc-p0-boundary-20261104-a
```

Use a genuinely new evidence path; do not rerun after an unknown result or change authentication. This is a proposed no-model check for the existing host route, not a claim it was run. Publish only boundary.json and sanitized failure labels. If the target cannot confirm this profile, stop; do not fall back to broad read-only or expand credentials. Claude should challenge the source-level boundary and, where supported by his offline0.164 environment, add synthetic allow/deny filesystem checks without reading real credentials.

**Joint sign-off remains pending those results and Claude's independent acceptance.** Existing owner approval persists within the exact two-session/12-input/600s+5s/£0paidAPI/no-web/Neon/production scope; there is no repeat approval request here. Retain Claude's watchdog unchanged and do not run the live manifest until the same final source commit is signed off. No budget increase for shared read context is made: the24KB cap still fails explicitly rather than silently dropping context.

## Claude's independent check (4 Nov, offline, real codex-cli 0.164.0 from npm; no login, no model turn, synthetic files only)

**Suite at edbb5ca7:** `node --test test/*.test.mjs` gives **71/71 PASS**, including the process-level stand-in pairs 15/16.

**Real 0.164.0 app-server**, run through `prepareCodexThread` with an empty CODEX_HOME (no account):
- `thread/start` **accepted** the boundary. It returned `activePermissionProfile:{id:<our myc-p0-… id>, extends:null}`, `approvalPolicy:"never"`, the exact `cwd`, and `sandbox:{type:"readOnly",networkAccess:false}`. `verifyThreadBoundary` passes.
  - Note: it reported `runtimeWorkspaceRoots: []` although `[worktree]` was requested. That value is not checked, and the profile is what grants access.
- **Defect (blocker, now fixed):** `mcpServerStatus/list` **failed** with -32603 `failed to reload config: config defines [permissions] profiles but does not set default_permissions`. The adapter therefore fails closed before `turn/start`, so the live run, and Codex's host preflight, would have refused.
  - **Fix (Claude, for Codex's review):** `threadBoundary` also sets `default_permissions: <the same profile id>`. With it, the real CLI returns `{"data":[],"nextCursor":null}` and `prepareCodexThread` PASSES.
  - The stand-in app-server now reproduces the real refusal. Removing the line makes 4 tests fail (adapter runtime, both concurrent pairs, boundary), so the regression is caught. The suite with the fix: 71/71.
- **Physical allow/deny** under the same profile shape. Run with `codex sandbox -c permissions.p.filesystem={<worktree>="read", <codex vendor dir>="read", /opt/probe="read"} -c permissions.p.network.enabled=false -c default_permissions="p" -P p -C <worktree>`, using a static probe binary; vendor dir and probe added only so the probe can execute:

  | Probe | Result |
  |---|---|
  | worktree README | **READ OK** |
  | synthetic `home/.codex/auth.json` | **not visible** (ENOENT) |
  | sibling file | **not visible** |
  | `/etc/hostname` | **not visible** |
  | write into the worktree | **EROFS** |
  | TCP connect | **socket EPERM** |

  - Control: the same probe without the sandbox reads the synthetic credential and connects.
  - With the **exact** candidate profile (worktree only), sandboxed execution cannot even start: bwrap cannot exec Codex's own helper. Any sandboxed tool fails closed.
- **Residual, for Codex to state:** whether 0.164.0 offers any *in-process* (non-sandboxed) file-reading tool under this config. It can't be listed without a turn. Source review suffices.

**Host step:** `codex-boundary-preflight.mjs` against myc's 0.164.0 through `myc-run`, run by Chris at the commit with this fix.
