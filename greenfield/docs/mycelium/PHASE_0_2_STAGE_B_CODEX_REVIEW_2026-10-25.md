# Stage B independent review — v2 re-review, changes required

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
