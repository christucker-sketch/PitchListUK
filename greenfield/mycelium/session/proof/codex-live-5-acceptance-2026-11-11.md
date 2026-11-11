# MYC-P0 independent acceptance — 11 November 2026

**Verdict: ACCEPT MYC-P0's concurrent-collaboration demonstration on live-5.** All six mechanical criteria reproduce, and manual content review supports the owner's “two engineers at the same table” requirement in this bounded session. No repeat live proof is needed merely to close MYC-P0.

This is acceptance of demonstrated concurrent co-engineering, not production readiness, indefinite autonomous operation, a general HTML parser, or Mycelium's exploration intelligence. Further model calls, crawls, database or infrastructure changes are not authorized by acceptance.

## What was independently checked

Evidence snapshot: hub dc7aefb49b5582d29522f9b21dfac11a3184e476, evidence/live-5-2026-11-11. Claimed run provenance: approved runtime31d043fc and exact launch script22c74b4c…ec5eb, run by Chris on fpd-prod. Private raw streams and host itself were not accessed; this review checks the published sanitized ledger, artifact, report and watchdog receipts.

- All80 events: contiguous sequence numbers, unique IDs, backwards references and timestamp offsets verified.
- Reanalysis using the reviewed coordinator matches as-run report for confirmed overlap, grants, total/fresh usage and lower-bound flags, latest integration and all criteria.
- Exactly4 grants per agent/8combined; every call receipt names a preceding grant belonging to that agent. These are authorising inputs, not provider request counts.
- Two active-turn receipts, both completed: Codex79,685ms, Claude82,533ms. Both worker exits code0/signalnull. No session stop or worker failure.
- Confirmed model-active overlap77,060ms.
- Final merge60 is9a14d89b34e7048633db6d59ad7b2e1dd944a029; tested61 occurs afterward for the same hash. Both fixed and supplemental phases ok:true, neither refused;395ms and424ms respectively.
- All6 final-file SHA256 hashes verified. INTEGRATION descriptor names the same final hash. Fixed oracle byte-identical to the unchanged reviewed fixture.
- Published watchdog JSON and output agree: brokerexit0, deadline not fired, no interruption, clean:true, leftovers slice0/broker0/units[]/tagged0. This is receipt consistency, not independent host/cgroup inspection.

## Why this is genuine collaboration

The proof is the evolving implementation and negotiated edits, not the mere presence of replies or overlapping PIDs.

- Codex finding10 proposes normalization, conservative anchor handling and counterexamples.
- Claude commit13/a93a7312 introduces a real implementation plus executable assertions; fixed and supplemental checks pass at20.
- Codex challenge35 identifies concrete defects in that implementation: inert-content anchors and href text inside another attribute's quoted value.
- Claude commit38/bc9a80d8 adds inert-region filtering and tests, linked to the peer's initial finding10. Tests pass46.
- Claude reply51 explicitly acknowledges both defects, says which one is fixed, and hands attribute tokenization to Codex to avoid conflicting edits while preserving the existing tests.
- Codex reply55 states that it will keep Claude's inert-region change and concentrate on the attribute scanner. Commit59/9a14d89b changes the shared implementation and adds attributes.test.mjs. Final source retains Claude's visible() filtering and frontier.test.mjs while adding complete-attribute scanning and first-href behavior.
- Both contributions are actually integrated and tested together at61, not merely offered as completed separate assignments.
- Claude stale submission64 is refused against the old base; logged inbox read68 includes the new commit, tests and peer findings, then Claude finishes. Protection did not get bypassed to manufacture success.

This demonstrates independent overlapping investigation, concrete criticism, changed work allocation, peer-caused code changes, preserved peer work, integrated tests and clean self-finish. It meets the owner's bounded concurrent collaboration requirement.

## Native behavior evidence and limits

Codex steering pauses44 at44.986s. Its finding65 references Claude reply51 (49.860s) and tests61 (68.580s), both created after the pause. That is strong evidence of late shared information reaching the active Codex turn through the available tool path. There is no Codex per-read receipt in this ledger, so direct myc_inbox invocation is INFERRED, not explicitly logged. Claude myc_inbox reads are explicitly logged, including68.

No claim of continuous mid-generation injection. Cooperation occurred through persistent active sessions and tool/steering boundaries.

Delta reads and context-budget refusals were NOT exercised by live-5. Their offline regressions remain useful, not live observations. Stale refusal followed by reread and finish was observed; no successful post-refusal Claude resubmission is claimed. Native behavior on empty unsuccessful tool results remains unproven by this run. Those limits do not invalidate the collaboration demonstrated and do not justify another paid run solely to tick telemetry boxes.

## Independent posthoc artifact checks

Read source/tests before execution. In this workspace Node24.19.0:
- node --permission --allow-fs-read=. checks/frontier.test.mjs:6/6 PASS.
- same restricted read-only mode on artifact/frontier.test.mjs: assertion script exit0, prints ok.
- same mode on artifact/attributes.test.mjs: assertion script exit0.

The supplemental files are assertion scripts, not lists of16/24 node:test cases. Count them as2 passing scripts; their assertions actually executed. These are independent POSTHOC checks with Node permission restrictions, not an OS-sandbox rerun or replacement for the original in-session two-phase receipts. No network/subprocess grants, model calls, host changes or database operations in this review.

Artifact behavior matches the demonstrated regression cases. This limited fixture is not approved for deployment/crawling, and this acceptance does not certify general HTML compliance.

## Usage and closeout

Completed-turn ledger reports Claude152,229total/32,447fresh; Codex182,501total/49,765fresh; combined334,730total/82,212fresh. Lower-bound flags false for both. These are reported provider token counters, not an independent provider bill or subscription allowance measurement. Cached-token weighting remains unknown; do not attribute the result to a guaranteed delta-read saving, since delta was not exercised.

MYC-P0 is accepted for this proof; the fifth grant is consumed. Preserve all failed-attempt history, exact runtime/command pins and original evidence. No sixth attempt, live engine session, crawl, Neon mutation, service or credential change is implied.

**Next: owner-led planning of the first bounded Mycelium engine task using this existing collaboration setup.** Keep it tied to persistent, adaptive, multilingual, multidirectional exploration, with FindPitches as the first application. Do not extend collaboration infrastructure by default or introduce another framework. Before live execution, define a concrete useful artifact and explicit resource/action allowance. Offline planning/source work remains within established permissions.
