# FindPitches V3 — current execution orders

Updated: 2026-10-11T12:45:00+01:00
Authority: Chris requested the team's next actions be refreshed after Claude completed and pushed the producer-side V3-001 evidence through `d69ef8c`. These orders supersede the 10 October 19:10 execution order where progress has overtaken it. They do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, real subscriber migration, unapproved outbound messages, UKCraftFairs Option B, or protected/live branch merges.

## Current position

- V3-004 remains DONE for synthetic subscriber-recognition/acceptance scope. Real subscriber continuity and migration remain separately gated.
- V3-005 remains DONE with the genuine hosted Stripe TEST journey complete 22/22.
- V3-008 is DONE: real-origin checks passed 39/39 API and 30/30 browser checks on the restricted preview. The remaining performance concern is catalogue/boot latency and repeated proof-read/boot dependencies, not correctness of the tested customer flow.
- Claude's producer-side V3-001 work is complete and pushed. The three genuinely fresh retries are already verified by Codex; the remaining three producer resolutions are now fully evidenced:
  - `fdx1_86aaebe…` / Pop Up Shops: past/not relevant, CLOSED/withheld is the correct outcome;
  - `fdx1_9b04c3e…` / From the Ground: replacement is `fdx1_f05d338d30aabbc8010f`, the same 2026 edition, retired and never delivered, so there is no current record to relink;
  - `fdx1_f889ad…` / Nashville: reviewed supersession candidate into `fdx1_5c40d2…`, with both old anchors retained by the surviving identity and an edition-boundary review required.
- V3-001 is therefore waiting on Codex's final V3-side resolution/sign-off of those three cases, not further Pi refetching.
- Latest producer evidence shows the recheck queue reduced from 1,390 to 320 and the latest delivery accepted 2,096 / rejected 0. Do not treat queue reduction alone as lifecycle proof.
- V3-010 launch-readiness review is active. Controlled launch, real-subscriber migration/live billing and paid acquisition remain three separate approval gates.

## Codex — close V3-001 first, then release-readiness follow-up

### V3-001 — immediate priority
1. Verify the three remaining producer resolutions against V3 state, identity and customer visibility using Claude's evidence at `docs/findpitches-v3-001-producer-evidence-2026-10-11.md` and the exact IDs therein.
2. **Pop Up Shops / `fdx1_86aaebe…`:** confirm the obsolete request can be resolved as CLOSED/withdrawn/non-customer-visible from the audited past/not-relevant evidence without inventing a new source fact or requiring a pointless new fetch.
3. **From the Ground / `fdx1_9b04c3e…`:** confirm replacement `fdx1_f05d338d30aabbc8010f` is the same past 2026 edition, retired and never delivered, and that V3 should keep the old customer outcome CLOSED/withheld with no duplicate/relink required.
4. **Nashville / `fdx1_f889ad…`:** review the old standing/2026 identity against survivor `fdx1_5c40d2…` / 2027. Confirm whether a reviewed supersession link is valid from the two shared anchors and edition evidence. Do not silently merge editions.
5. Resolve/acknowledge only where the current V3 rules and audited evidence allow it. Do not write fabricated source timestamps or mutate immutable source facts to clear the queue.
6. Confirm none of the three creates duplicate customer-visible inventory or leaks a held/closed/retired record.
7. Publish one final V3-001 cloud checkpoint. If all three are clean, explicitly state that V3-001 has sufficient cloud-side evidence to close and hand that statement to Claude/ChatGPT.
8. If one case remains unsafe, name that exact case and required evidence only; do not reopen the whole lifecycle design.

### Release-readiness support after V3-001 checkpoint
1. Keep V3-004, V3-005 and V3-008 closed unless regression evidence appears.
2. Preserve the existing real-subscriber migration gate: all 57 legacy rows still require canonical LIVE owner/mode/product/price/period-end evidence; eight vendor-binding exceptions and four scheduled-cancellation continuity cases remain review items. Do not perform LIVE provider writes/imports/messages.
3. Run a bounded, read-only catalogue/boot profiling pass to identify the cause of the measured preview latency (API median ~4.1s, sampled p95 ~5.1s, browser readiness occasionally much slower in the test environment). Focus on repeated proof reads, boot dependencies, caching opportunities and avoid behavioural/product changes unless a narrow defect is proven.
4. Publish only measured findings and a safe optimisation recommendation. Do not change production routing or claim production-load performance from the current proxy/interception environment.

## Claude — close ownership after Codex sign-off, then V3-002 recommendation

### V3-001
1. Producer-side implementation/evidence work is complete. Do not keep refetching the three obsolete/replaced/merged ids merely to make pending tokens disappear.
2. Watch for Codex's final V3-001 cloud checkpoint.
3. If Codex verifies all three remaining resolutions cleanly, mark V3-001 DONE and update Claude status/TASKS/HANDOVERS with the producer evidence plus Codex cloud proof.
4. If Codex leaves one case open, address only that exact evidence/identity issue; do not reopen paging, lifecycle-feed or discovery design without new evidence.
5. The proposed exporter improvement — re-emitting a previously delivered id once as WITHDRAWN with a genuine new clock and explicit `not_relevant:<reason>` / `superseded_by:<id>` — remains a proposal only. Do not implement it unless separately ordered after V3-001 closure.

### V3-002 — immediately after V3-001 closes
1. Keep UKCraftFairs Option B OFF and unwired while V3-001 is open.
2. Once V3-001 is DONE, publish a concise Option B recommendation covering:
   - expected customer-visible READY/enquiry inventory gain from the retained 159 UKCF records;
   - how many have genuinely customer-usable verified contact/application routes under D-012;
   - operational/security cost of accepting producer-supplied retained documents;
   - failure/expiry/revalidation behaviour;
   - whether the gain is commercially worth the extra custody path.
3. Do not weaken READY/source-proof rules and do not enable Option B as part of the recommendation.

### Pi housekeeping — operator work, not a launch gate by itself
1. When the replacement PSU is available, swap it and re-check the Pi throttling/under-voltage status before treating the old `0x50005` reading as current.
2. Configure off-site backup with `sudo fpd-offsite-setup`, then prove one backup and document the restore destination/custody. Do not put backup credentials in GitHub.

## ChatGPT — finish V3-010 launch-readiness review

1. Fold the completed V3-008 report into the launch acceptance matrix now. Treat correctness/security checks as passed in bounded preview scope and treat catalogue/boot latency as an explicit release concern requiring profiling/monitoring, not as proven production-load failure.
2. Fold Claude's final producer evidence into V3-001 interpretation now; the only remaining lifecycle dependency is Codex's V3-side sign-off on Pop Up Shops, From the Ground and Nashville.
3. Keep the three approval gates separate:
   - **controlled V3 launch**;
   - **real-subscriber migration / LIVE billing**;
   - **paid acquisition**.
4. Tighten the controlled-cutover plan to the exact routing/domain/publication sequence, pre-flight checks, rollback trigger and monitoring thresholds. Do not execute it.
5. Preserve the real-subscriber NO-GO until canonical LIVE ownership/product/price/period-end evidence, price policy, exception handling, cohort reconciliation and explicit migration approval exist.
6. Preserve the paid-acquisition NO-GO until V3-009 paid-client attribution/account protection is complete, launch monitoring is live and Chris separately approves spend.
7. As soon as Codex publishes the final V3-001 checkpoint, issue the concise V3-010 **GO / CONDITIONAL-GO / NO-GO** recommendation for controlled launch, with exact remaining release concerns and operator approvals.

## Priority order from here

1. Codex: verify and resolve the three remaining V3-001 cloud-side cases and publish the final closure checkpoint.
2. Claude: on clean Codex sign-off, mark V3-001 DONE and publish the V3-002 / UKCraftFairs Option B recommendation.
3. ChatGPT: fold V3-008 + final V3-001 into V3-010 and issue the controlled-launch recommendation.
4. Codex: bounded catalogue/boot profiling and safe optimisation recommendation.
5. Operator/Chris: replace the Pi PSU when available and configure/prove off-site backup.
6. After controlled-launch readiness is settled, return to V3-007 UK source expansion, V3-009 paid-client attribution and V3-006 alert delivery in that order unless Chris reprioritizes.

## Standing gates

Do not restart paid acquisition, enable live billing, migrate real subscribers, publish V3, cut over custom domains, alter live V1, delete legacy infrastructure, send unapproved customer messages, enable UKCraftFairs Option B, or merge to protected/live branches until Chris explicitly authorizes that exact gate.
