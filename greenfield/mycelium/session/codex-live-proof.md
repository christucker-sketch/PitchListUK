# Smallest real concurrent proof: candidate, not execution approval

30 October 2026. The six-turn cycle is parked. No model, fetch, host or Neon operation was performed preparing this package.

## Finish before asking Chris to execute

This is a concrete test specification, **not yet a deployable signed-off command bundle**. Do not ask for permission to run incomplete code. Claude and Codex must first:

1. Fix P0-01…09 and review the trusted runtime/launcher; show fail-closed pre-dispatch allowance, collision/replay recovery, clean test sandbox, descendant kill and no post-STOP writes. Plug the existing coordinator into `CodexSession`; do not build a second event framework.
2. Implement and offline-test Claude's corresponding persistent-session publication/inbox mechanism. Validate its active-turn input consumption timing. Keep one independently active process per engineer, not alternating completed tasks.
3. Through the existing host route, collect only CLI versions/help and generated schema, not model output. These read-only commands use a fresh temporary directory, change no configuration/credentials, and do not log in:

   ```bash
   codex --version
   codex app-server --help
   schema_dir=$(mktemp -d)
   codex app-server generate-json-schema --experimental --out "$schema_dir"
   node greenfield/mycelium/session/codex-protocol-check.mjs "$schema_dir/codex_app_server_protocol.schemas.json"
   claude --version
   claude --help
   ```

   Command availability and generated schema MUST match the installed binaries; no automatic installation or credential expansion. The Codex model process would later run `codex app-server --listen stdio://` inside the reviewed launcher. This command is documented, **not authorised or executed now**. Authentication remains the existing subscription setup. Claude must publish its precise version-compatible command and tool permission list; stream-json flags alone are insufficient.
4. Publish one candidate commit SHA, exact command, immutable manifest and hashes, two prompts of equal status, sandbox mappings, allowance-file ownership, cost/billing guard, audit output paths and rollback command. Both engineers review that SAME package. Tests must pass on the target-capable environment; environment-blocked tests are not waived.

## Bounded request to make once the package is complete

One manually started concurrent session on the existing BRIX, isolated from FindPitches, with:

- Exactly **one Claude process/session and one Codex process/thread**. No restart, resume fallback, subagent, paid fallback or automatic repeat.
- At most **six inference-authorising dispatch actions per engineer**: one initial start and up to five intermediate input/steer actions, 12 total. Reserve each before dispatch; unknown outcome consumes it. This is an action bound, NOT a promised bound on provider HTTP requests. Internal requests/retries must be captured where exposed and reported unknown otherwise; verify the existing no-retry/billing guard before claiming an exact model-call cap. If Chris requires an exact provider-request cap, this remains blocked until enforceable telemetry/control exists.
- **10-minute absolute session deadline**, at most 5 seconds graceful interruption then whole-group kill/reap. No repeated attempt after a quota or authentication refusal. A pre-existing STOP prevents startup; STOP/worker death/gap/timeout/allowance exhaustion terminates both workers and tests. An independent OS watchdog enforces the deadline even if broker code hangs.
- Model/context choices stay the already approved subscription defaults. At most **24KB adapter-supplied prompt/event text per engineer**, max five steering deliveries, max eight files/32KB candidate submission, 2,000 bus records/4MB log. No silent truncation or dropping. Provider history/context limits remain distinct from byte budgets.
- Record observed token use for each turn and cumulative totals; pause on **20,000 observed aggregate input+output tokens**. Usage may arrive after inference and overshoot this observational threshold: do not advertise it as a hard token cap. The hard controls are dispatch count and OS deadline. Missing usage is a recorded failure, not zero cost.
- **£0 incremental paid API spend**: existing subscription CLIs only, no API-key provider or automatic paid fallback. Record actual billing mode/guard outcome; unknown money is null, not invented £0. No new subscription commitment.
- Fixed bounded test workload in an isolated fixture repo, no network tools, no direct gateway/Neon/host access; 60-second maximum per test, 512MiB maximum aggregate test processes and two CPU threads if supported by the reviewed launcher. CLI aggregate memory cap must be chosen from measured available headroom and pinned before approval, rather than guessed and risk affecting services. No service/timer installation.

The final approval phrase must identify the reviewed commit and this exact allowance, e.g. `approved: MYC-P0 concurrent proof at <SHA>, two sessions, twelve dispatch actions, ten minutes, no web/Neon/deployment, £0 paid API`. This document does not supply a usable SHA or imply such approval has been given.

## Shared problem and PASS evidence

Give both engineers the same incomplete multilingual breadcrumb/frontier artifact and fixtures. Each investigates independently while publishing intermediate hypotheses and counterexamples through tools. Do not script their discovery or require agreement. At least one substantive response must happen in EACH direction before either engineer finishes; at least one response changes an investigation or candidate implementation, with linked event IDs and visible before/after diff/test evidence. Mere acknowledgements or adding a peer ref are insufficient.

Capture trusted spawn/exit times, active turn IDs, dispatch reservations, accepted deliveries, tool publications, peer responses and integration/test receipts. Prove **overlapping active model work**, not just idle processes. Accepted turn/steer alone is not PASS. If Claude consumes messages only after its full task finishes, or Codex steering is unavailable, report FAIL and retain evidence; do not reinterpret alternation as success. All submissions carry a base commit; the broker validates actual staged paths and merges/tests without giving model workers GitHub credentials. Both must contribute substantively to the resulting executable artifact. Preserve disagreements and failed experiments.

Manual review of the linked event/diff/test chain is part of acceptance. Report unknown request counts/costs plainly. Export only sanitized engineering evidence through the existing GitHub hub. Neon durability is already proven separately and is NOT mutated by this minimal concurrency proof.

Rollback/closure: STOP both workers; watchdog kills/reaps their process groups and test sandbox; archive consumed allowance and immutable ledger even on failure; retain isolated branches/worktrees as evidence, with no merge into production. No cleanup that deletes existing project work. No background restart or service remains enabled.

## Subsequent real-public-web mission experiment: separately approved

The first concurrency proof uses offline input; that does NOT satisfy the owner's real-web exploration criterion. Once collaboration passes, propose **at most 12 total HTTPS GET attempts**, 1 request/second, five-minute deadline, 128KiB per response/1MiB total, at most three redirects counting toward the same attempt limit. Robots/access-policy requests consume that budget too; blocked/authenticated/challenged/private targets are refused without bypass. Public web only, no forms/contact submissions, no credentials/personal-data harvesting, no paid search and no Neon writes. Domain scope and network/IP restrictions must be explicit in the approved manifest.

Persist the starting public URLs, timestamps, status/redirects, hashes and bounded sanitized link context. Use a small multilingual seed set without predefined discovery categories; follow observed breadcrumbs into relationships and sources, retaining a revisitable frontier. Run a documented fixed-search/list-following baseline at the SAME request/byte/time budget with the same starting evidence; no oracle labels or source identities leaked to either policy. Pre-register metrics before fetching: distinct genuinely new source hosts/documents against the initial corpus, paths/provenance, potential opportunity hints, independently confirmed trader eligibility, false positives, and cost. Public appearance alone does not confirm eligibility. If no new sources are found, retain the null result.

This is a maximum-bound proposal, not permission to crawl. The public corpus and exact source manifest are still to be selected and reviewed. It must stay a small mission experiment after the table works, not another platform-development phase.
