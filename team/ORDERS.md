# FindPitches V3 — current execution orders

Updated: 2026-10-11T14:11:00+01:00
Authority: Chris requested the plan be refreshed after Claude added V3-011 international expansion work for Ireland, Canada, Australia and New Zealand. These orders supersede the 12:45 execution order where progress has overtaken it. They do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, real subscriber migration, unapproved outbound messages, UKCraftFairs Option B, or protected/live branch merges.

## Current position

- V3-004 remains DONE for synthetic subscriber-recognition/acceptance scope. Real subscriber continuity and migration remain separately gated.
- V3-005 remains DONE with the genuine hosted Stripe TEST journey complete 22/22.
- V3-008 is DONE: real-origin checks passed 39/39 API and 30/30 browser checks on the restricted preview. Catalogue/boot latency remains a release concern to profile, not a proven production-load failure.
- Claude's producer-side V3-001 evidence is complete. V3-001 is waiting only on Codex's final V3-side resolution/sign-off for Pop Up Shops, From the Ground and Nashville.
- The Pi off-site backup is now configured and proven to an encrypted rclone crypt remote on Chris's personal Google Drive, with a nightly 05:40 schedule and 14-day retention. A spare-hardware restore test is still outstanding, but off-site custody is no longer an open setup task.
- Claude has claimed V3-011 under D-013: international customer-ready supply for **Ireland, Canada, Australia and New Zealand**. Success is measured as **V3 READY/customer-ready listings**, not raw producer volume.
- Current international baseline from Claude's plan: AU 185 producer current / 4 V3 READY; NZ 77 / 4; CA 28 / 0; IE 2 / 0. AU/NZ already have producer volume but poor V3 conversion; CA/IE need both supply and V3 proof support.
- Claude's first V3-011 increment is built: a `marketsireland` lane (5 IE OPEN_NOW in dry-run), plus new AU/CA hub seeds for NEON NSW, Finders Keepers, Alliance for Arts and Alberta Craft Council. Kit `29a7c85d…` awaits Pi install by Chris.
- The biggest immediate V3-side international levers are a ClueMart proof parser for NZ and a per-source blocker breakdown for AU/NZ/CA/IE.
- V3-010 launch-readiness remains active. International expansion is commercially important supply work but **is not a controlled-launch gate**.

## Codex — close V3-001, then work V3-011 international conversion

### V3-001 — immediate first priority
1. Verify the three remaining producer resolutions against V3 state, identity and customer visibility using `docs/findpitches-v3-001-producer-evidence-2026-10-11.md`.
2. **Pop Up Shops / `fdx1_86aaebe…`:** confirm the obsolete request can be resolved as CLOSED/withdrawn/non-customer-visible from the audited past/not-relevant evidence without fabricated source facts or another pointless fetch.
3. **From the Ground / `fdx1_9b04c3e…`:** confirm replacement `fdx1_f05d338d30aabbc8010f` is the same past 2026 edition, retired and never delivered, so the old customer outcome remains CLOSED/withheld with no duplicate/relink required.
4. **Nashville / `fdx1_f889ad…`:** review the old standing/2026 identity against survivor `fdx1_5c40d2…` / 2027. Confirm whether reviewed supersession is valid from the two shared anchors and edition evidence. Do not silently merge editions.
5. Resolve/acknowledge only where existing rules and audited evidence allow it. Do not invent timestamps or mutate immutable source facts just to clear tokens.
6. Confirm none of the three creates duplicate customer-visible inventory or leaks a held/closed/retired record.
7. Publish one final V3-001 cloud checkpoint. If all three are clean, explicitly state that V3-001 has sufficient cloud-side evidence to close and hand that statement to Claude/ChatGPT.
8. If one remains unsafe, name only that exact case and required evidence; do not reopen the lifecycle design.

### V3-011 — immediate next engineering priority after the V3-001 checkpoint
1. Work directly from `docs/findpitches-v3-international-expansion-plan-2026-10-11.md`. The target countries are **IE, CA, AU and NZ** and the metric is **V3 READY/customer-ready**, not producer totals.
2. **L1 — build the ClueMart proof parser for NZ.** Claude has about 48 NZ ClueMart OPEN_NOW records and V3 currently has no dedicated ClueMart parser. Add a conservative parser with fixtures and the same provenance/immutability rules as existing source-specific proof parsers. Do not broaden generic proof rules to make the numbers look better.
3. **L2 — publish a per-source blocker breakdown for AU/NZ/CA/IE from the V3 ledger.** Reason codes are sufficient. Break down why producer records fail READY by source and country, especially:
   - AU/NZ LocalStalls OPEN_NOW records that do not become READY;
   - NZ ClueMart records;
   - CA directory/Marketspread/hub records;
   - IE records, including the new `marketsireland` lane once delivered.
4. For LocalStalls specifically, quantify which failures are missing dated proof, application-route proof, geography, stale evidence, parser mismatch, or another V3 rule. Claude will use this to fix producer-side issues rather than guessing.
5. Prepare support for the new **MarketsIreland** lane. Listings arrive as `discovery_source=marketsireland` with platform id `marketsireland_market:<slug>`. OPEN_NOW listings carry a `platform_enquiry` route to the listing showing status/date/county/fee/organiser contact. Judge them under existing V3 proof rules and D-012. Make no READY assumption until V3 verifies the route.
6. After L1/L2 evidence exists, recommend the next highest-yield V3-side conversion work across IE/CA/AU/NZ. D-012 enquiry readiness can be proposed where there is a genuinely customer-usable verified HTTPS route; do not count generic contact pages that fail that test.
7. Report READY gained **by country and source**, not just parser pass counts or producer volume.
8. Keep V3-011 independent of V3-010 launch gating: no production routing, publication, live billing or spend changes are authorized by this work.

### Release-readiness support after the above
1. Keep V3-004, V3-005 and V3-008 closed unless regression evidence appears.
2. Preserve the existing real-subscriber migration gate: all 57 legacy rows still require canonical LIVE owner/mode/product/price/period-end evidence; eight vendor-binding exceptions and four scheduled-cancellation continuity cases remain review items. Do not perform LIVE provider writes/imports/messages.
3. Run a bounded, read-only catalogue/boot profiling pass after the V3-001 checkpoint and the first V3-011 diagnostic work. Focus on repeated proof reads, boot dependencies and safe caching opportunities.
4. Publish measured findings only. Do not claim production-load performance from the current proxy/interception environment.

## Claude — close V3-001, continue V3-011 producer expansion, then V3-002

### V3-001
1. Producer-side implementation/evidence is complete. Do not refetch obsolete/replaced/merged ids merely to make pending tokens disappear.
2. Watch for Codex's final V3-001 cloud checkpoint.
3. If Codex verifies all three remaining resolutions cleanly, mark V3-001 DONE and update Claude status/TASKS/HANDOVERS with producer evidence plus Codex cloud proof.
4. If Codex leaves one case open, address only that exact evidence/identity issue.
5. The proposed exporter improvement to re-emit a previous id once as WITHDRAWN remains a proposal only unless separately ordered.

### V3-011 — continue in parallel; this is now explicit priority supply work
1. Continue verified free-source discovery for **IE, CA, AU and NZ** using seasonal hubs, organisers and council/vendor-call sources.
2. Install and run the first international kit only after Chris installs `29a7c85d…` on the Pi. Measure per-seed yield and remove weak/noisy seeds rather than broadening rules.
3. Continue the new `marketsireland` lane conservatively. Preserve OPEN_NOW/UNKNOWN distinctions; do not infer closure, dates or geography.
4. Feed Codex exact source examples/fixtures needed for ClueMart, MarketsIreland and any source-specific blocker it identifies.
5. When Codex publishes L2 blocker reason codes, fix only producer-side causes demonstrated by that breakdown and rerun the relevant country/source cohort.
6. Report progress as READY gained by country after V3 verification, with producer current counts as secondary diagnostics only.
7. Keep all work free-source only. No paid search and no READY/source-proof weakening.

### V3-002 — after V3-001 closure, without displacing V3-011 momentum
1. Publish the UKCraftFairs Option B recommendation covering expected customer-visible gain, D-012 route quality, operational/security cost, expiry/revalidation behavior and whether the extra custody path is commercially worth it.
2. Keep Option B OFF and unwired unless Chris explicitly approves it after the recommendation.

### Pi housekeeping
1. Off-site backup setup is now complete and proven; no further setup action is required. A spare-hardware restore test remains useful but is not a current launch blocker.
2. When the replacement PSU is available, swap it and re-check the Pi throttling/under-voltage status before treating the old `0x50005` reading as current.

## ChatGPT — V3-010 plus international coordination

1. Continue V3-010 using completed V3-004/V3-005/V3-008 evidence and fold in the final V3-001 checkpoint as soon as Codex publishes it.
2. Keep the three approval gates separate:
   - **controlled V3 launch**;
   - **real-subscriber migration / LIVE billing**;
   - **paid acquisition**.
3. Tighten the controlled-cutover plan to exact routing/domain/publication sequence, pre-flight checks, rollback trigger and monitoring thresholds. Do not execute it.
4. Preserve the real-subscriber NO-GO until canonical LIVE ownership/product/price/period-end evidence, price policy, exception handling, cohort reconciliation and explicit migration approval exist.
5. Preserve paid-acquisition NO-GO until V3-009 paid-client attribution/account protection is complete, launch monitoring is live and Chris separately approves spend.
6. Track V3-011 as a **commercial supply workstream**, not a launch blocker. Review whether Codex/Claude work is increasing customer-ready IE/CA/AU/NZ inventory rather than merely increasing producer totals.
7. As soon as Codex publishes the final V3-001 checkpoint, issue the concise V3-010 GO / CONDITIONAL-GO / NO-GO recommendation for controlled launch with exact remaining release concerns and approvals.

## Priority order from here

1. **Codex:** final V3-001 sign-off on Pop Up Shops, From the Ground and Nashville.
2. **Claude:** on clean sign-off, close V3-001; continue V3-011 producer expansion in IE/CA/AU/NZ.
3. **Codex:** V3-011 L1 ClueMart parser + L2 per-source blocker breakdown for IE/CA/AU/NZ; then support MarketsIreland and the highest-yield conversion fixes.
4. **ChatGPT:** finalise V3-010 once V3-001 closure lands; keep V3-011 tracked as non-gating supply growth.
5. **Claude:** publish V3-002 UKCraftFairs Option B recommendation after V3-001 closure, without stalling the international work.
6. **Codex:** bounded catalogue/boot profiling and safe optimisation recommendation after first V3-011 diagnostics.
7. **Chris/operator:** install Claude's international kit `29a7c85d…` when convenient; replace the Pi PSU when it arrives and re-check under-voltage.

## Standing gates

Do not restart paid acquisition, enable live billing, migrate real subscribers, publish V3, cut over custom domains, alter live V1, delete legacy infrastructure, send unapproved customer messages, enable UKCraftFairs Option B, or merge to protected/live branches until Chris explicitly authorizes that exact gate.
