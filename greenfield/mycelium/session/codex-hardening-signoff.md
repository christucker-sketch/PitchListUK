# Independent hardening verification and first live BRIX proof

30 October 2026 (Europe/London). Reviewed Claude `1eb0ca67b1da6259c6ada5714ced7c7b80bae1c1`. Follow-up code and evidence pinned at **`9e856343031ca3199fc80c1cbe5f44f6ccfaef8a`**.

## Verdict

**Original P0-01…09 hardening VERIFIED at the regression level; first live proof NOT READY for approval.** The existing coordinator remains the shared implementation. No replacement platform or six-turn cycle is proposed.

Executed unchanged original tests against Claude's revision:

- `node greenfield/mycelium/session/test/codex-coordinator-regressions.test.mjs`: **9/9 PASS**.
- `node greenfield/mycelium/session/test/codex-adapter.test.mjs`: **12/12 PASS**.

Important coverage limit: this workspace is non-root, so the sandbox test passes by refusing execution (fail closed), not by demonstrating successful OS isolation. Claude's positive unshare/systemd and process-level CLI tests are not independently established here. Synchronous Git subprocesses remain denied with EPERM; a separate asynchronous Node process probe exits 0 without returning its expected stdout, and the process-level stand-in exits before handshake in this environment. That is an observed test-environment limitation, not proof the real CLI transport works or a claim all 36 tests passed independently. No sandbox override or alternate credential was used.

## Additional findings fixed in the pinned code

1. **Missing Codex terminal ledger.** The unchanged Codex adapter under Claude's runtime only published usage and lifecycle notes. A completed turn produced zero `call` records; `evidence/codex-ledger-before.log` reproduces it against the pinned pre-fix source. The adapter now records every dispatched grant's outcome. The initial turn has an `active-turn` interval; a steering response has a `steer-ack` interval and does NOT count as model-work overlap. Interrupted/ambiguous operations remain consumed and are marked unknown. Tokens are attributed once to the completed thread turn; money remains null.
2. **Pre-existing STOP allowed dispatch.** Independently reproduced two grants despite STOP already existing. Startup now returns without workers/worktrees/grants, and reserve checks STOP again before granting.
3. **SIGKILL could pass acceptance.** `exit.code=null, signal=SIGKILL` was treated as no worker failure. Acceptance now rejects nonzero/null code and any exit signal.

`test/codex-hardening-verification.test.mjs`: **3/3 PASS** after fixes. Re-ran original coordinator and adapter tests after changes: **9/9 + 12/12 PASS**, 24 focused checks total. Claude ledger annotations now distinguish actual turn spans from stdin echoes; overlap excludes acknowledgement-only and unknown intervals. The code does not equate CLI dispatch actions to provider requests or claim receipt timestamps prove active inference.

Logs: `evidence/codex-hardening-original-regressions.log`, `codex-hardening-adapter.log`, `codex-hardening-followup.log` and `codex-ledger-before.log`. Bash syntax and modified JS syntax checks pass. No claim of a full test-all PASS from this environment.

## Remaining live blockers

- **Worker/CLI isolation and cgroup ownership:** worker processes and launched CLIs run under the coordinator UID. If the coordinator is root for the sandbox, CLIs would also be root; if it is myc, the systemd test backend refuses non-root. A process-group kill still does not contain a descendant calling setsid. A reviewed least-privilege launcher plus whole-cgroup stop/watchdog is needed, reusing the existing Stage One/BRIX boundaries. Do not launch this revision as root to make tests work.
- **Systemd test backend:** sandbox source chowns the copy to UID 65534, while the systemd unit runs as mycexp. Writable fixture tests may fail under the intended backend. No positive target-host proof of this backend exists. Fix account/access mapping and verify sandbox isolation, timeout, descendant termination and cleanup with no models.
- **Authentication/configuration:** workers receive a new private HOME; existing subscription logins are not proven accessible through that launch. Allowing arbitrary config.env is not an authentication plan. Keep existing login files unchanged, expose only the necessary identity to its own worker, and keep GitHub/Neon credentials out. No new login, key or credential expansion is requested.
- **CLI compatibility:** installed BRIX Codex schema and Claude restricted/tool/stream flags are unverified. Claude replay echoes are receipt evidence, not conclusive model consumption. Actual peer tool reads and substantive changed work must establish collaboration.
- **Shared current state:** submissions still lack a checked integration base commit; no integration read tool exists. Tool-less agents cannot reliably inspect/rebase after peer changes or conflicts. Add a bounded snapshot/read capability with base SHA, require that base on live submissions, and reject stale changes atomically.
- **Budget and termination semantics:** a permit can be granted just before STOP; the Claude adapter must re-check AbortSignal before launching/writing input. Worker failure and refusal/exhaustion must stop the pair, not merely leave the peer running until the deadline. Claude's ledger sends still swallow publication failures. Provider request counts/retries, paid-fallback guards, observed token limits, CLI memory headroom and external watchdog require target-compatible enforcement/evidence.

These are source-level blockers except where explicitly identified as reproduced above. They are not grounds to invent further infrastructure or request credentials. Claude has the direct hub handoff and should complete the minimal shared launcher/state fixes; Codex will challenge the resulting same package.

## Exact next command: no-model host inventory

Use the existing Claude-controlled host route on fpd-prod, from a checkout whose HEAD is the pinned code commit. This command performs no model login/call, deployment, package install, service or database change. It writes only a fresh private `/tmp/myc-p0-preflight.*` directory. Do not change an existing checkout to run it; use the existing isolated source-delivery route if this commit is not available. Do not forward credentials or raw account files.

```bash
 test "$(git rev-parse HEAD)" = "9e856343031ca3199fc80c1cbe5f44f6ccfaef8a" || exit 2
 sudo -u myc -H bash "$PWD/greenfield/mycelium/session/brix-preflight.sh"
```

The script refuses if existing CLIs are missing or unsupported; it does not install, authenticate or remove safety flags. It records CLI versions/help, generated Codex schema compatibility, memory availability and cgroup/account existence. CLI binary paths may be supplied explicitly only from the established installation. A failure is evidence to report, not authority to modify the host. Read-only investigation is already in scope; this is a direct Claude handoff, not a request that Chris relay routine agent messages. Review sanitized outputs before hub publication.

## First live proof: exact bounded scope to approve AFTER blockers close

This replaces the earlier open-ended wording with a fixed first attempt. **No execution command is signed off yet:** the launcher and target facts above are missing, so publishing a runnable-looking command would misrepresent readiness. The final command, manifest and source hashes must all refer to one reviewed code SHA, then Chris may approve that concrete result. Approval is withheld, not inferred from preparation authority.

- One manually started session on fpd-prod, one existing-subscription Claude session and one existing-subscription Codex thread. No subagents, restarts, exec-resume fallback, retries at the orchestration layer or automatic paid fallback.
- At most **6 authorising input actions per engineer**, **12 total**: one initial prompt and up to five steer/stdin inputs each. Reserve/fsync before dispatch, unknown outcomes consume allowance. Report provider-request counts as unknown unless reliable telemetry exists; do not call this a 12-provider-call cap.
- **600 seconds absolute wall time**, external watchdog, at most **5 seconds grace**, then kill/reap the complete cgroups including tools/tests. STOP prevents startup; pair stops on either worker failing, lost/gapped context, allowance exhaustion or quota/authentication refusal. No repeated attempt.
- **24,000 bytes** supplied prompt/event context per engineer, no truncation; **2,000 normal bus events / 4,000,000 bytes** plus the documented control reserve; at most **8 files** and **32,000 bytes** per candidate submission. Pin these values in the eventual manifest and enforce them, rather than only mentioning them here.
- Observe and record tokens; stop at **20,000 observed aggregate input+output tokens**, with explicit potential in-flight overshoot. This is not a hard token cap. The hard bounds are dispatch permits and the watchdog. CLI memory cap is **not guessed**: select it from the preflight headroom before approval; if safe headroom cannot be demonstrated, do not run.
- **£0 incremental paid API spend**, existing subscription access only. Billing/provider guard must fail closed; unknown monetary attribution stays null. No new subscription or resource commitment.
- All artifact tests: no network, no credentials, copy-only filesystem, **60 seconds/test, 512MiB memory, 64 tasks, CPU quota 200%** under the verified systemd sandbox. Model workers cannot access production paths, each other's credentials, GitHub gateway or Neon. No service/timer installation or persistent activation.
- **Zero web fetches, zero Neon operations, zero production writes.** The first proof uses a small offline multilingual breadcrumb/frontier fixture. It does not establish real-web discovery; that remains the separately approved bounded follow-up in `codex-live-proof.md`.

### Same-table acceptance

Both engineers independently investigate the SAME executable breadcrumb/frontier artifact with source URLs, multilingual context, deduplicated revisitable frontier and separate eligibility evidence. Starting source and current integration must be accessible to each through the bounded broker read capability. Both publish intermediate findings through tools while still working, each responds substantively to the other before either session ends, and at least one peer finding changes the investigation or implementation. Both contribute to the integrated artifact; trusted tests must pass on its exact commit. Do not pre-script the finding, response or agreement.

Retain trusted process/cgroup and turn timing, grant ledger, delivery receipts, intermediate tool events, linked changed diff, base/integration hashes, test receipts, failures, request-count/usage limitations and manual review of substance. Receipt or process overlap alone is not PASS. A timeout or queued-only exchange is FAIL/INCOMPLETE, never relabelled concurrency. Do not force a code change on every message.

Closure: stop both complete cgroups, verify no tool/test descendant remains, seal the consumed allowance and ledger, retain isolated worktrees/commits as evidence, and leave no background session/service/timer. Preserve existing work; no production merge or cleanup of historical evidence.

### Approval readiness

**NOT READY.** Next: Claude returns the no-model preflight evidence and minimal launcher/state fixes through the hub; Codex verifies them, pins the exact final launch/stop commands and manifest, then presents the one bounded live-run approval request. No approval question is put to Chris for the incomplete package.
