# Mycelium Stage B completion review and v5.1 source review

Codex, **25 October 2026, 14:02 GMT**. Reviewed host evidence in [plan §10](PHASE_0_2_STAGE_B_PLAN_2026-10-25.md#10-v5-upgrade-and-task-003-run-25-oct-fpd-prod-run-by-chris-completed-exchange-done), real task commits through `80c936b2`, and proposed source revision `a955fdc3`.

**Functional GitHub handoff: PASS across the original grant and explicitly approved continuation. Before/after usage check: RECEIVED as Chris's observation of no change. v5.1 source review: PASS, not installed. No further model call or host deployment is proposed by this review.**

Usage/context update,25October14:11GMT: Chris says he checked usage before and after and it did not change. He separately reports high general Claude usage and suspects accumulated chat context. This is a user-attested display comparison, not an independently reconciled bill or a claim that inference consumed zero tokens. Exact readings/times and separate paid-setting values were not supplied; existing£0/no-paid-fallback guardrails remain.

## Verified functional outcome

| Task | Outcome and recorded native call | Immutable result SHA256 |
|---|---|---|
|001 Codex|Completed in489561e0;19s,402output tokens|`0cc1a7fd3db9270b463152feaffd9fbbc989bff00235c92c934ad14fe8382ffa`|
|002 Claude|Failed in216e9024; host evidence says sign-in only, no inference|No result; original failure retained|
|003 Claude|Completed in80c936b2;14s,848output tokens,`claude-sonnet-5-5`|`4e1f07aa455ab8473b5ee65042a808c1e4f7b151df3c5f4ce98868dd647822fc`|

Both successful result hashes independently match the committed completion events, and each completion's`prev_event` matches its claim blob. The gate's strict reader validates001completed/002failed/003completed against a disposable local clone of actual Git history.001/002terminal folders and003's original descriptor/creation event are unchanged. The003claim commit changes only its new claim event; completion adds only its result and completion event. No task/history repair or overwriting was needed.

Host evidence records the approved v5 receipt-checked upgrade, only003allowlisted, successful preflight1s, claim13:50:43Z, completion13:51:07Z. Its single14s Claude call fits the180s cap and the new30-minute grant. Codex001's original19s call and Claude003's14s call are the **two recorded successful inference calls**; host reports zero inference for002and003's earlier preflight stop. The public v4 failure receipt alone cannot independently establish002's zero-call count.

The approved exchange now exists:001task → native Codex review → GitHub result →003reads that result through the gate's pinned reference path → native Claude response → GitHub result. The operator manually initiated each run; no human copy/paste of model response content was required. This proves the bounded manual exchange, not unattended orchestration or strong human-approval authentication. The two calls occurred under separate explicitly approved grants with a quota wait between them; this is **not one uninterrupted30-minute wall-clock test**.

The earlier quota hold is superseded by003's successful post-reset result.003is now terminal and its one-call allowance is consumed. The generic grant status still displays`max:2`, but there is no approved pending task: only the completed003descriptor belongs to the continuation allowlist. **Do not re-claim/replay it, invent004, or treat unused generic capacity as authority.**

## Terminal failure diagnosis and v5.1 review

Claude reports a same-user/environment host sign-in comparison: attached terminal timed out(rc124), detached stdin returned immediately(rc0,loggedIn,true/firstParty). Detached input then allowed the original approved v5 command to complete003. The first003preflight failure made no claim/model call; manually correcting stdin and relaunching was not a retry of a model invocation. The earlier slow-token-refresh explanation is withdrawn in the current evidence.

The host comparison establishes that terminal-attached input mattered. The precise kernel stop signal is a reported explanation, not a signal trace independently inspected by Codex. We did not run a live native sign-in or model call here.

Proposed v5.1 changes only stdin handling in`myc-agent`and`myc-stageb`, plus the regression test: four version/auth checks and both agent entry points receive`/dev/null`. Actual model calls still receive their prompt files, so the handoff content is preserved. Gate/claim/identity/deadline/allowlist/billing guards and installer/upgrade scripts remain unchanged. v5.1 is prepared source; the host evidence is v5 plus the operator's detached-input workaround, **not a v5.1 installation**.

| Local source check | Independent result |
|---|---:|
|Maintained suite, including real-PTY fixture|48/48 pass|
|Original independent regressions|7/7 pass|
|Admission deadlines|2/2 pass|
|Publication deadlines|3/3 pass|
|Manifest hashes|10/10 match|
|Shell syntax|All10scripts pass|

**60/60 offline checks pass.** All CLI inference is fake; all test Git remotes are disposable local repositories. The PTY case ran here without skipping. Independently extracting and running that same PTY fixture against v5 gives0pass/1fail; against v5.1 it gives1pass/0fail. This proves the regression test detects the missing input detachment, not the native CLI's exact stop-signal internals. Private copies only; shared source unchanged by Codex.

Host v5 verification is reported as46maintained+7+2+3checks, with the optional parent-repository HubSync check absent from the transfer directory. Local v5.1 includes that check plus the new PTY test. Do not present the differing counts as a host failure or claim all60ran on the deployed v5.

Declared proposed archive`stageb-0.7.tgz`, SHA256`e952413879820a9a2f84f02f7bc0db9a25258a5a1384d9ae47c5c4740a7b5890`. Codex verified source entries, not the absent archive. **No deployment or new run is requested now**: there is no remaining Stage B task to run. Retain this reviewed fix for a future explicitly authorized host upgrade; no user approval is sought by this check.

## Review quality and outstanding evidence

Claude agrees with the three original HubSync findings; source review confirms the mechanisms:

- After a capped batch,`last_seen`is updated to the writer's own tip; the unchanged-remote shortcut can skip pending leftovers.
- `write_and_push`is called as an`if`condition, suppressing reliance on Bash errexit for internal writes/staging/commits.
- Output redirection can follow repository symlinks before the later Git-diff guard runs.

Claude's extra conditional concern about an unvalidated`$id`is **not a confirmed defect**: the existing`^T-[A-Za-z0-9_-]{1,40}$`check and exact filename match already prevent that traversal. Do not add it to the defect count or implement a redundant fix. The three real issues remain later coordinated, separately reviewed HubSync work; no live/source HubSync mutation is made here.

**Before/after usage check is now recorded:** Chris replied that he checked usage before and after and it did not change. Accept that as his reported observation for this bounded manual check; do not keep asking for the same comparison. Exact numeric readings/times and an independent billing reconciliation are not available. Do not turn unchanged display readings into zero token consumption or independently verified£0, and do not treat the`api_equivalent_usd_not_billed`estimate(Claude≈$0.020588)as a charge. No additional spend/fallback is authorized.

**Usage completeness gap:**003's public input count2omits Claude cache-creation tokens, so it is not total input consumption. Preserve the original completion event. If retained host logs contain the omitted usage, a later sanitized additive evidence record/future telemetry change can include it; do not rewrite the receipt or fabricate totals. No usage-parser change is bundled into the stdin fix.

## Current coordination outcome

1. Mark the manual exchange functionally complete; remove the stale quota/unclaimed banners.
2. Record Chris's completed before/after check as no observed change; keep its measurement/billing limitations explicit without inventing numbers or repeating the request.
3. Record v5.1 source review PASS and leave it undeployed; no further model calls are authorized.
4. Keep the three real HubSync defects as the next coordinated source-safety work before broader unattended orchestration; source-review planning does not authorize host changes, Stage C email or Stage D automation.

No host access, native model call, new spend or change to HubSync/service/credentials/Pi/J1900/Cloudflare/production/V1/V2 by Codex. No current inventory or producer-health measurement. Existing commercial counts retain their dates; this is a collaboration proof, not catalogue growth.


## Context continuity without reloading the whole conversation

Chris reports Claude's broader usage rising independently of this test and suspects accumulated chat context. That is plausible, but this review has no account-wide usage trace to attribute it. One concrete source of avoidable input is repeated full-history reading: before this update,`team/HANDOVERS.md`alone measured34,702words. Word count is a document measurement, not a provider-token or billing estimate.

[Claude fresh-session brief](../../../team/CLAUDE_RESTART_BRIEF.md) gives a compact checkpoint, current source links, ownership, consumed grants, open defects and dated operational evidence. Root`AGENTS.md`now directs routine checks to current sections/relevant rows and older evidence on demand; full task contracts/code remain required before implementation. No old conversations, status history or source evidence are deleted. Start a fresh Claude chat with the brief and current execution order; archive the old chat rather than pasting it back into the new one. This changes context-loading practice, not provider configuration, billing or runtime.
