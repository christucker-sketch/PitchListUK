# Codex review — bounded BRIX memory exchange, 28 October 2026

Reviewed proposal/source at `8c5ecd33f61bf02b1d3fde2828c059ff6765af2d`, following the owner course correction. **Core sequential exchange works in offline fixtures. Two descriptions need correction before presenting the final execution approval. No host/model grant is inferred.**

## Independently verified

- Collaboration chain **12/12 PASS**, using the exact descriptors/context/launcher, real repository gate/runner, fake CLIs and a local bare repository.
- Existing runner-decision regression suite **29/29 PASS**, including local fake notification/owner-record fixtures (no real email, provider or host).
- Launcher/test Bash syntax passes. Shellcheck is unavailable here; Claude's shellcheck result is not independently repeated.
- Launcher SHA256 matches `3ddca150705243ff7ba27d6e199017b4adf56c46745953626bdc8118b2ff0233`.
- Repository runner hashes match the recorded installed pins: agent `d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6`, stageb `c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a`, gate `a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7`. This compares repository bytes with published host evidence, not a fresh host inspection.
- Four proposed descriptor blobs match the allowlist pins. Completed predecessor results are required at claim, pinned and rechecked at admission, then supplied to the next CLI. Tests verify the peer token reaches turns 2–4.
- Four claims/CLI invocations maximum; fresh ephemeral turns; 180-second model invocation cap; 3600-second claim/admission window; no automatic extra turn. Sequential fixed-turn collaboration is correctly distinguished from autonomous exploration.
- Context includes the founding vision and current schema/API; preparatory cloud critique is excluded. No memory schema change should precede actual peer results.

## R1 — distinguish a launcher STOP from a durable grant hold

Proposal says **any refusal/transport failure** holds the grant so later manual tasks cannot call. That is too broad.

`myc-stageb` runs grant and sign-in preflight before claim. A sign-in failure there creates no claim/event. The launcher exits, but the GitHub grant is still unspent; rerunning after fixing login is technically possible. Similarly a state-fetch failure can stop the launcher without changing any task state. Durable holds apply to recorded failed/uncertain/awaiting/in-progress states, as tested; they do not arise from every preclaim stop.

**Required narrow correction:** describe these cases accurately. Make the execution instruction explicit: on ANY STOP Chris closes/archives the separate allowlist before any rerun; recovery needs fresh direction/approval. Existing step 6 already archives the allowlist whatever the outcome, so documentation can align with that procedure. Do not claim the gate enforces an unrecorded failure. No runner redesign is requested.

## R2 — distinguish tool prohibition from tool removal

Proposal says **the CLIs have no tools**, citing Claude `--tools ""` and Codex `--sandbox read-only`. Claude's flag disables its tools; the Codex flag constrains writes, not tool availability. The installed common prompt tells both CLIs not to run commands/use tools, and Codex runs in a fresh work directory with user config/rules ignored. This is a prompt-level restriction for Codex, not an enforced tool-less CLI.

**Required narrow correction:** state that distinction in the proposal/context. The review's tests use fake CLIs and cannot prove real Codex never invokes a tool. Keep SQL execution/offline implementation in the cloud follow-up as proposed. No installed script change is requested; if owner requires hard tool denial, identify that as a separate unresolved capability before execution.

## Limits to preserve in the approval

“4 calls” is enforced as at most four admitted task runs/native CLI invocations. It is not proof of exactly four underlying provider requests: provider internals, reasoning and retries are not measured by the fixture. There are no orchestrator retries; Claude retry settings are explicitly zero; the shown Codex command has no corresponding explicit provider retry override. Describe the unit honestly rather than promising a provider request count.

The £0 assertion remains conditional on Chris's subscription/extra-usage checks; offline fake usage is not a billing audit. No new paid resource/API key is authorized. The 60-minute window bounds claims/admission/model-publication work; ancillary checks/cleanup are not a universal hard wall-clock kill of the launcher.

## Next action

**Claude:** make R1/R2 factual corrections and clarify invocation-count wording in the proposal/handoff. Preserve the working runner and scope. Codex can check that narrow delta once without repeating passed suites unless code changes. Then Chris may approve the exact bounded host execution. Do not create executable tasks or the allowlist yet.

No real task creation, BRIX command, model/API call, host change, notification, Neon access or remote SQL by this review. All local fixture writes are isolated. Existing production/communications services remain untouched.


## Revision 2 follow-up — PASS, execution approval pending

28 October 2026. Reviewed complete delta `85f222f977f3ac92a610ba800a9aaf0a06033268`. R1 now explicitly distinguishes preclaim procedural stops from recorded grant holds and requires archiving the allowlist on any STOP before rerun. R2 correctly distinguishes Claude's removed tools from Codex's prompt prohibition. CLI invocation/provider-request count, window boundaries and conditional £0 wording are corrected. Context change only rephrases the no-tools instruction. Launcher, runner, descriptors and limits are unchanged. Prior independent 12+29 offline PASS remains applicable; no redundant suite rerun.

**PASS for the bounded revision-2 proposal.** This is source/proposal review, not execution authorization or a fresh host audit. Next actor Chris: explicitly approve or defer the exact proposal's four CLI invocations (Claude → Codex → Claude → Codex), at most 180 seconds each, 3600-second claim/publication window, subscription-only billing checks, separate allowlist and archive-on-stop procedure. Approval phrase in proposal: `approved: BRIX memory collab, 4 calls`. Then Claude prepares the pinned executable tasks and Chris follows the reviewed host sequence. No task creation, host call, email, Neon operation or additional grant has occurred from this review.
