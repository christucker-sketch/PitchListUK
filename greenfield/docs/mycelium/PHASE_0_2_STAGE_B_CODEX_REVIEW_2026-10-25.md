# Stage B independent review — v4 passes; installation approved, host execution pending

> **Latest,25October09:49GMT:** v4 is installed and the original exchange is partial (001completed/002failed before a Claude call per host evidence). See the [v5 review + concrete continuation plan](PHASE_0_2_STAGE_B_V5_CODEX_REVIEW_2026-10-25.md):59/59offline checks pass; option B/003creation approved, exact host-upgrade/run go-ahead pending. Historical v4 review below is retained.

**Approval update, 25 October 2026, 09:14 GMT:** Chris replied **“approved”** to installation of this v4 plan ([record](../../../team/DECISIONS.md#myc-stage-b-host-install-2026-10-25--v4-installation-go-ahead-chris)). **No further installation approval is needed.** The Codex cloud cannot resolve the home-LAN hostname`fpd-prod.Home`, including on an outside-sandbox retry; no SSH command reached the host. Claude/Chris should use the existing manual PC/home-LAN workflow below and return sanitized installer evidence. Installation remains **unexecuted by Codex/unverified on host**. This update does not authorize the two real tasks/model calls or reopen other stages.

**Codex, 25 October 2026, 09:10 GMT. Reviewed runtime `cfa2280a997421a5cd76eede10c2ba276fb6201e`. Technical review PASS for the bounded manual Stage B proof only. Nothing installed or invoked on the host.**

## Verified outcome

Independently rerun against v4, with temporary local Git and fake/simulated CLI/clock fixtures:

| Check | Result |
|---|---:|
| Maintained Stage B suite | 44/44 pass |
| Original independent safety regressions | 7/7 pass |
| Absolute admission-deadline regressions | 2/2 pass |
| Shared publication-deadline regressions, including positive control | 3/3 pass |
| Pinned source file checksums | 9/9 match |
| Shell syntax | All nine scripts pass |

**56/56 offline checks pass. All findings raised in the previous reviews are resolved for this limited manual test.** This is not evidence of real native provider behaviour, subscription allowance/billing, host installation, an actual GitHub-mediated model exchange, or unattended safety.

The remaining R3 publication correction is now present in the shared source. `complete` passes the immutable absolute publication end into `commit_push`. The writer re-reads remaining time after local preparation/before push, then again before confirming fetch; TERM/KILL fit inside each remaining allowance. A final clock check prevents late confirmation being reported as success. Short time, failed confirmation and uncertain/late outcomes stop without an automatic retry. The three independent publication tests now pass unmodified on the actual shared bundle, rather than only a private proposed correction.

Earlier admission, durable accounting, single-start, cancellation-boundary, strict parsing, safe public metadata and fresh-install/rollback repairs remain covered by the passing suites. No runtime changes were made by Codex. The stated post-admission cancellation limitation remains: cancellation can be too late to prevent a call, including during bounded preflight; changed history must prevent acceptance at completion. Strong approval authentication and broader unattended execution remain outside this proof.

Chris's single-call same-request Codex transport-retry exception remains accepted; do not ask him to repeat it. Native subscription sessions, existing billing guard, disabled paid fallback/extra credits and before/after allowance readings remain host-run prerequisites. Fail closed on uncertainty. No claim of £0 billing verification is made from fake CLI tests.

## Concrete installation approval scope

The reviewed [v4 host plan](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md#5-exact-host-commands-only-after-codexs-re-review-and-chriss-go-ahead-the-3-decision-is-made-a) has **Chris's installation go-ahead**; execution/evidence remain pending from the home network. This means a fresh manual install on **fpd-prod (J3455) only**, with the nine pinned files, three root-owned commands, the new spool/state/allowlist directories and `mycspool` group memberships. It starts no model, timer or service and leaves the existing five-minute HubSync script/unit/key unchanged. Existing managed state causes refusal, not replacement. On a partial-install failure, stop and inspect; do not improvise cleanup.

Declared Claude archive: **`stageb-0.5.tgz`**, SHA256 **`d35f98a9aefaa5ad92b70db18af9977def0f157556b3de5fa4328c9933687004`**. The archive itself is absent from this Codex workspace: individual source files are independently verified, while archive identity must be verified on transfer. Do not substitute an older archive or bypass checksum checks.

PC transfer commands from the plan (after go-ahead):

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\ChrisT\claude-sync.ps1
scp C:\Users\ChrisT\stageb-0.5.tgz ct_admin@fpd-prod.Home:~/
```

Reviewed host install chain, including **all four** offline suites before sudo (python3 is required by the original regression fixture; missing prerequisites stop installation):

```bash
set -euo pipefail
cd ~
printf '%s\n' 'd35f98a9aefaa5ad92b70db18af9977def0f157556b3de5fa4328c9933687004  stageb-0.5.tgz' | sha256sum -c -
tar -xzf stageb-0.5.tgz
cd stageb
sha256sum -c SHA256SUMS
bash test-stageb.sh
bash test-review-regressions.sh
bash test-review-deadlines.sh
bash test-review-publication.sh
sudo bash install-stageb.sh
```

If a successfully installed bundle needs to be backed out, its reviewed narrow undo is:

```bash
sudo bash ~/stageb/uninstall-stageb.sh
```

That command requires the install receipt and refuses during a Stage B run. It removes only unchanged installed commands, the newly created allowlist/group, and moves spool/local state/private logs to a root-only evidence directory. GitHub task records and existing sign-ins/HubSync are retained. This is a reviewable reversibility plan, **not an instruction or approval to run rollback now**.

## Remaining manual proof steps and gates

1. **APPROVAL GIVEN:** Chris approved this installation after review `fd341c81`. Claude/Chris executes from the home-LAN workflow; this cloud cannot resolve the host. No remote command/install has been run by Codex.
2. Claude prepares the two task files described verbatim in [plan §4](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md#4-the-two-tasks-chris-creates-or-authorises-them-not-on-the-hub-yet). **Chris creates them or explicitly reviews/authorizes their creation.** No active task descriptors or allowlist hashes were fabricated by this review; the plan's placeholders must be replaced with the exact approved, pushed descriptor blobs before execution.
3. With native billing/auth/allowance checks recorded, manually run the one Codex review and then the one Claude review of its GitHub result. Maximum two invocations total, 180s each, 30-minute grant, £0 incremental; on failure/uncertainty stop, do not advance. The scoped Codex transport exception is the only accepted retry exception.
4. Publish the real task/event/result hashes, outcomes, call usage/timing, sanitized before/after allowance evidence and limitations. Failed/uncertain publication is a held outcome, not a passed proof. Do not retry/reconcile through another model invocation.

The explicit gate comes from [Chris's Stage B authorization](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md): **“Before running commands on the host, present the exact implementation/deployment commands and reversibility plan to Chris for explicit go-ahead.”** Technical review completion does not remove it. Installation approval does not approve task creation, unattended triggers, email/Stage C, new paid services or changes to Pi/J1900/Cloudflare/V1/V2/production.

**Actions this review:** local offline tests and GitHub documentation only. Zero native model calls, new spending, host install/run/rollback, real task creation, email or running-system changes. No new inventory/producer-health measurement is implied.

---

## Historical v3 review — findings repaired in v4


**Codex, 25 October 2026, 08:59 GMT. Reviewed `030c7315`. Changes required before host execution.**

## Confirmed repairs

Independently rerun against this exact revision: **44/44 maintained tests, 7/7 original Codex regressions, and 2/2 admission-deadline regressions pass**. All **eight** entries in `SHA256SUMS` match. The two admission bugs reported in the v2 review are fixed: slow reference checks cannot extend the absolute deadline and an expired grant is not admitted.

The installer now refuses existing managed paths/group before changes, and the new rollback uses a receipt, removes unchanged commands and retains spool/state/private logs as evidence. These source changes address the prior fresh-install/narrow-rollback finding for this first manual install. Claude reports a disposable simulation; Codex has reviewed the source, **not run the installer or rollback on the host**. Partial-install failures must stop for inspection; do not bypass a fresh-install refusal or improvise cleanup. No additional rollback finding is raised here.

Chris's one-call same-request Codex transport-retry exception remains accepted. No further retry decision is needed. No new scope, approval, credential or spend is requested.

## Remaining R3 finding — the publication phases reuse the same allowance

In [`myc-gate`](../../mycelium/stageb/myc-gate), `cmd_complete` computes both `PUSH_T` and `FETCH_T` from the same `left_s`, **before** writing the event and making the local commit. `commit_push` then uses those two durations sequentially. It does not re-read the absolute deadline immediately before each phase or after confirmation. Each phase can fit its own timeout while their combined duration exceeds the remaining grant. Also, `timeout -k 5 <remaining>` permits five additional seconds after TERM for a resistant process.

[New independent publication regressions](../../mycelium/stageb/test-review-publication.sh) reproduce the issue using only disposable local Git and a deterministic clock/timeout shim. Synthetic metadata represents a completed worker; **no model is invoked**. The genuine admitted deadline agrees with the durable first-claim time and a short 90-second grant; the test does not rewrite the job packet. The clock simulates elapsed phase durations, and the timeout shim rejects a phase whose simulated work exceeds its supplied cap. Initial sync/file reads still use real GNU timeout and local Git.

On v3: **1 control passes, 2 cases fail**:

| Case | 20 seconds remain at the initial check | Outcome on v3 |
|---|---|---|
| Control | Fast push and confirming fetch | Timely result accepted |
| Local work consumes budget | Local commit consumes 16 s, then push and fetch consume 16 s each | Both still receive 20 s. Remote push occurs 12 s after grant end; gate reports success **28 s late**. |
| Confirmation consumes budget | Push consumes 16 s, confirming fetch consumes 16 s | Both still receive 20 s. Gate reports success **12 s late**. |

Run: `bash greenfield/mycelium/stageb/test-review-publication.sh`. The current nonzero exit is the reproduced failure, not a failed native proof. All remotes are temporary local repositories. The new review-only file is outside the eight-file pinned manifest; existing pinned source is unchanged by Codex.

**Claude, exact correction:** carry the immutable absolute publication end into `commit_push`; re-read remaining time **after local preparation and immediately before the push**, then re-read it **after the push and before the confirming fetch**. Bound each phase's hard kill inside that remaining allowance, and check the absolute clock before reporting successful completion. If time is exhausted or the push may have landed without confirmation, stop with an explicit uncertain/held outcome and do not retry automatically. Preserve the distinction between an uncertain remote outcome and a confirmed failure; do not claim nothing was published after a timed-out push.

A private, uncommitted source copy using those remaining-time checks, an immediate hard-kill bound and a final clock check passes **3/3**, including the positive control. That is a focused feasibility check, not a replacement runner, merged runtime fix or full validation of the proposed correction. Shared runtime remains Claude-owned and unchanged by Codex.

## Next checkpoint

Claude integrates this remaining correction into the same bundle, includes the two timing cases and control in maintained coverage, reruns the local suites and repins archive/manifest/commands. Codex rechecks that exact revision. **Do not request host go-ahead on v3 yet.** The archive itself is not available in this workspace, so Codex has verified individual file checksums only.

Once technically cleared, [Chris's Stage B authorization](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md) still requires presentation of exact reviewed host commands and rollback for explicit go-ahead. That gate is unchanged, not a new approval flow. The two real task descriptors still require Chris's creation or explicit approval.

Zero native model calls, new spending, host install/run/rollback, email, production/Pi/J1900/Cloudflare/V1/V2 changes. Existing HubSync is unchanged. No fresh commercial inventory or producer-health measurement is claimed.

---

## Historical v2 re-review — superseded by the v3 outcome above


**Codex, 25 October 2026, 08:39 GMT. Reviewed runtime revision `4673d428`, retry decision `c1c2fef0`. Host execution remains on hold.**

## Current outcome

The revised bundle is substantially safer. Independently rerun: **42/42 maintained checks and 7/7 original Codex regressions pass**. All six entries in its existing `SHA256SUMS` match. Claude's marked adaptations to the original Codex tests preserve their intent: fresh independent scenario grants and the new admission step before testing a worker. R1/R2/R4/R5/R6 regressions now pass; durable history-based accounting and host test-exit propagation are also repaired.

Chris's option (a), recorded in `c1c2fef0` and the [plan](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md), resolves the retry decision: native Codex retries of the **same request on transport error, for this one read-only Codex call only** are accepted. No second CLI invocation, task, reconciliation call or later-stage exception. Do not ask Chris to decide this again. All other limits and the separate host-command go-ahead remain in force.

Two concrete implementation/host-plan items remain from R3/R7. No new approval is requested at this repair stage.

### R3 follow-up — absolute grant deadline can move during admission

[`myc-gate`](../../mycelium/stageb/myc-gate) calculates `GRANT.window_left_s` **before** validating pinned references, then calculates the deadline as **later current time + that stale remaining time − margin**. This extends the grant by time spent checking references. It also does not recheck expiry after those checks before creating `admitted` and `job.json`.

[New independent deadline regressions](../../mycelium/stageb/test-review-deadlines.sh) use a disposable local Git repository and a deterministic forward clock advance at the pinned-reference read. **0/2 pass on v2:**

- A 60-second advance extends the job deadline by **60–61 seconds** beyond first-claim time + window − publishing margin.
- A 120-second advance in a 60-second test grant still creates admission and a job after the fixed grant has expired.

Run: `bash greenfield/mycelium/stageb/test-review-deadlines.sh`. A nonzero exit currently denotes the reproduced failures. There are **no model calls**, host commands, real GitHub writes or real credentials in this test. Short configurable windows avoid waiting 30 minutes.

**Required correction in the shared bundle:** derive an absolute deadline from durable `first_claim_epoch + window_s`, subtract the publishing margin, take the minimum with the lease, and recheck current time immediately before admission. Do not convert an old duration back into a new absolute deadline. A private, uncommitted copy using that calculation and an expiry check passes **2/2**; shared runtime remains Claude-owned and unchanged by Codex. The two tests are published for integration, not a second runner.

Also finish the already-requested end-to-end bound: `complete` checks expiry before `commit_push`, but the push and confirming fetch can each wait up to 120/60 seconds beyond its 30-second reserve. Bound the remaining writer/network phases by the absolute grant end; if the outcome is uncertain, hold and report without retry. Do not claim a hard whole-test 30-minute limit from a check before potentially long network waits. That publication-time finding is from code review, not a new timed-network reproduction.

### R7 follow-up — rollback still assumes everything was newly created

The repaired test command now propagates failure correctly. However, `install-stageb.sh` still permits existing command files/group/spool/state/allowlist/log paths, while the plan's unconditional undo removes them and the entire `mycspool` group. Printing before-state does not make that rollback safe for pre-existing data/configuration.

For this minimal first install, fail **before any mutation** if managed paths or the shared group already exist unexpectedly, or explicitly preserve and restore their prior state. Document a narrow rollback based on the successful install's receipt; retain task/evidence/private diagnostic records, and never delete pre-existing state or memberships. Do not run the present blanket cleanup. This is the existing R7 request for before-state/ownership checks and narrow rollback, not approval to delete infrastructure.

## Next shared checkpoint

**Claude:** repair the absolute deadline and remaining-time enforcement, tighten fresh-install/rollback semantics, integrate the two new cases, rerun all offline checks, and repin files/archive/commands. The six-file v2 checksum manifest still verifies; the newly added review-only deadline test is outside that manifest. The archive itself was not present in this workspace and its declared checksum has not been independently verified by Codex.

**Codex:** recheck that exact revised bundle, then present the concrete reviewed host plan for the explicit go-ahead required by [Chris's Stage B authorization](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md). No task descriptors have been created or authorized here. Cancellation after the final admission boundary remains a stated manual-proof limitation: it may be too late to prevent a call, including during preflight; completion must refuse changed history. This review does not grant unattended execution.

**Actions this review:** local fake/offline tests and GitHub review documents only. Zero native model calls, new spending, host installs, email, production/Pi/J1900/Cloudflare/V1/V2 changes. Working five-minute HubSync remains untouched. No new inventory or producer-health measurement is implied.

---

## Historical v1 review — superseded findings retained


**Codex,25October2026. Reviewed bundle `8d56af1e949c5275791b2276490cddceebab5cc7`. Not cleared for host execution.**

This reviews [Claude's implementation/host plan](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md) against the [joint contract](PHASE_0_2_TASK_CONTRACT_REVIEW_2026-10-24.md) and [Chris's limited grant](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md). Preparation/review remain authorised. The implementation stays Claude's shared bundle; Codex supplies reproducible regression tests and this review, not a competing runner.

## Verified evidence

- Original five SHA256SUMS entries match. Original offline suite independently passes **32/32**.
- Added [independent review regressions](../../mycelium/stageb/test-review-regressions.sh): **1 control passes,6 safety checks fail** on this bundle. All Git remotes are disposable local bare repositories; all inference is fake. No real key, login, model invocation, GitHub task, host install, production change or email was used.
- Run locally for review: `bash greenfield/mycelium/stageb/test-review-regressions.sh`. Its nonzero exit is intentional until the findings are fixed. The new test is review-only and is not part of the original installed bundle/checksum list.

## Blocking findings and required changes

| Finding | Reproduced result / source | Required correction |
|---|---|---|
| **R1 — one claim can invoke twice concurrently** | Two `myc-agent` processes for one accepted run both pass the marker check, then each touches `out/started` and invokes the fake Codex. Observed **2 fake calls for1claim**. [Agent precheck](../../mycelium/stageb/myc-agent#L22), [non-atomic start](../../mycelium/stageb/myc-agent#L54). | Atomic per-run execution admission/locking, with a durable non-replay hold and no marker a second worker can simply reset. Concurrent/restarted entry must not invoke again. Preserve the root stage-wide grant as well. |
| **R2 — cancellation can land before dispatch but inference still starts** | A controlled local Git shim adds Chris's cancellation immediately after claim push succeeds, before the gate's confirming fetch. The fetch sees cancellation, but the gate checks only claim ancestry and writes a packet using old local HEAD; the fake agent runs. Completion later quarantines it, too late. [Remote check](../../mycelium/stageb/myc-gate#L123), [packet publication](../../mycelium/stageb/myc-gate#L160). | Revalidate current descriptor, complete history, exact live claim and deadline at the final dispatch admission boundary. An ancestor claim alone is insufficient. Test cancellation/invalid event and result changes in this window; prevent inference, not just later publication. Define any remaining unavoidable post-admission cancellation race honestly. |
| **R3 — elapsed overall budget is reset by local state loss** | The normal stage window rejects task2 while state remains. Removing only the temporary test-local state permits task2 to finish despite that same elapsed window. Test uses a short configurable window, not a30min sleep. [State recreation/window](../../mycelium/stageb/myc-stageb#L20). | Recover earliest grant/claim time and held/uncertain usage across **both** approved tasks from durable records, or fail closed on missing state. Serialize stage-wide admission, recheck after claim/network waits and enforce the overall deadline through completion. Local counters are not the authority. |
| **R4 — unsafe failure/metadata text bypasses result filtering** | A fake worker returns an entirely synthetic credential-shaped marker in `meta.error`. The writer commits it to the public failure event. [Free-form failure reason](../../mycelium/stageb/myc-gate#L198); model/CLI/agent strings are also copied atL192–196. No real credential was exposed. | Public failure receipts should use fixed safe error codes; private diagnostics stay private. Validate every emitted metadata/string field, binding run/agent/version appropriately. The `result.md` filter alone does not protect public events. Include unsafe error/model/version and malformed metadata cases. |
| **R5 — strict JSON duplicate-key rejection is incomplete** | Descriptor with `"instructions":{"ignored":1}` followed by `"instructions":"x"` is accepted as pending. Leaf-path duplication catches identical scalar paths, but misses repeated container keys whose value shapes differ. [Strict reader](../../mycelium/stageb/myc-gate#L43). | Reject duplicate object members during parsing, before a JSON tool normalises the object. Cover container→scalar, scalar→container and nested variants, plus explicit event actor/time/run validation; do not claim strict parsing from duplicate leaf paths. |
| **R6 — timeout sends TERM but does not ensure the cap** | Fake CLI ignores TERM and sleeps3s. With a scaled1s call cap, the runner reports3s elapsed before returning failure. [Inner timeout](../../mycelium/stageb/myc-agent#L57), [outer timeout](../../mycelium/stageb/myc-stageb#L33). | Enforce process-group termination with a hard kill/deadline within the approved bound, including TERM-resistant children. Bound auth/preflight, native call and final publication against remaining overall time; no retry after timeout. |

**Host-plan blocker R7:** §4 uses `bash test-stageb.sh | tail -1 && sudo ...install...` without pipeline failure propagation. A failing test can therefore still run the installer. Independently demonstrated with a harmless `false | tail -n1 && printf ...`; no installer was run. Use explicit checked test exit status/pipefail, verified pinned archive provenance, before-state/ownership checks and narrow rollback. Do not present the old command as ready.

Cancellation being quarantined is safe for an already stopped task; it does not compensate for starting its inference after the cancellation was already observed remotely. Likewise the two-ID allowlist limits task identities, not the number of executions of the same packet or the elapsed grant. These findings concern the implementation, not a request to weaken the approved contract.

## Codex 0.164.0 retry question — do not guess a setting

Inspected official **pinned** source, without calling a model:

- [Provider defaults/constants](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/model-provider-info/src/lib.rs#L68): request retry setting4, stream reconnection setting5.
- [API retry construction](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/model-provider-info/src/lib.rs#L456) and [effective getters](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/model-provider-info/src/lib.rs#L500).
- [Provider merge](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/model-provider-info/src/lib.rs#L696): built-in providers are not generally overridable; the non-Bedrock path uses `entry(key).or_insert(provider)`. [Config loading](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/config/mod.rs#L3972) merges that catalogue and defaults to `openai`.

Consequently I **cannot endorse** `-c model_providers.openai.request_max_retries=0` / `stream_max_retries=0` as a working override for this built-in provider: the pinned merge preserves the existing entry. The fields' existence in documentation/binary is not proof they change that route. I have not established another supported built-in zero-retry switch. `--ignore-user-config` and a timeout do not establish it either.

This does **not** prove that each transport retry is another billed inference; it proves the strict no-retry requirement remains unresolved. Do not silently redefine the grant, swap to a custom authenticated endpoint/provider or use an API key to force a pass. First repair the implementation findings. Then establish a supported, reviewed way to meet the existing limit, or present Chris with the precise remaining limitation and ask for a specific decision **before any native call**. Claude's claimed environment controls also need version-specific validation; fake CLI argv tests do not prove provider behaviour.

## Handoff / acceptance for the revised bundle

**Claude:** fix R1–R7 in the one shared implementation and add these adversarial cases to the maintained offline coverage; keep model calls at zero during preparation. Repin code/checksums and correct the host/rollback commands. Codex will re-review and rerun both the existing and independent regression suites against that exact revision. An accepted revision still needs Chris's explicit host-command go-ahead and subscription/billing/terms checks; StageC/D remain closed.

No running HubSync, BRIX, Pi, J1900, Cloudflare/V3, protected branch or production state was changed by this review. No permission or credential is requested from Chris at this repair stage.
