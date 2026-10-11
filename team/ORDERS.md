# FindPitches V3 — current execution orders

Updated: 2026-10-11T15:18:00+01:00
Authority: Chris has asked the team to assess whether FindPitches can go **live and public today with a working subscription option**, and to report readiness/blockers before any launch action. This is a review request only. It does **not** authorize public routing, publication, LIVE Stripe changes, customer charges, real-subscriber migration, paid acquisition, customer messages, UKCraftFairs Option B, destructive V1/V2 changes or protected/live branch merges.

## Current position

- V3-004 remains DONE for synthetic subscriber-recognition/acceptance scope.
- V3-005 remains DONE with the genuine hosted Stripe TEST journey complete 22/22.
- V3-008 remains DONE: bounded real-origin API/browser checks passed; catalogue/boot latency is a measured release concern rather than a demonstrated correctness failure.
- Codex's latest assigned checkpoint is complete. Its 2026-10-11 15:10 status reports:
  - V3-001 is narrowed to **one remaining lifecycle case only: Nashville old native 2026 versus survivor 2027**. Pop Up Shops and From the Ground now have audited append-only resolutions; all reviewed identities remain withheld from preview.
  - V3-011 first L1/L2 increment is complete: conservative ClueMart/MarketsIreland proof work and international blocker analysis are published. It produced **0 new READY** this pass and retained all existing cohort READY.
  - AU LocalStalls is now the highest-value international conversion lever: 32 OPEN_NOW entities, 2 READY, 23 organiser disagreements and 22 entities with unresolved equal-authority conflicts.
  - Catalogue profiling measured operator snapshots around 3.2–4.8s with D1 execution around 0.8–0.9s; repeated inventory/proof reads dominate. Safe optimisation remains desirable.
- Current READY/private-eligible recount from Codex at 14:57:26 London: **1,812** total — GB 127 / US 1,679 / AU 2 / NZ 4 / CA 0 / IE 0. This is a READY/country recount, not a refreshed full commercial disposition table.
- V3-011 remains a non-gating supply programme for IE/CA/AU/NZ.
- PitchList V1 is a **separate existing site/product**, not the same service being replaced by FindPitches. A FindPitches public launch does not require routing PitchList customers away from PitchList, and PitchList should remain untouched unless separately approved.

## Immediate team question — REVIEW AND REPORT ONLY

Chris is considering making **FindPitches public today, with new-customer subscriptions enabled at launch**. A browse-only public launch is not the target. The team must review its own area and report back before any implementation or configuration change.

Assumptions for this readiness review:

1. **PitchList remains live and separate.** Do not treat PitchList as FindPitches' rollback route and do not assume legacy PitchList subscribers must be migrated today.
2. The target is a genuine public FindPitches service: public browsing/search, real sign-in, and an operational subscription path for **new FindPitches customers**.
3. Existing PitchList subscribers may remain on PitchList. Real legacy migration can remain a later project unless an agent finds a hard technical coupling that proves otherwise.
4. Alerts may remain disabled, paid acquisition may remain paused, UKCraftFairs Option B may remain OFF, and V3-011 supply expansion may continue independently.
5. No agent is authorized by this review to remove shadow/private restrictions, add production domains, remove `noindex`, enable LIVE Stripe, create/charge a LIVE subscription, change webhooks, publish inventory, send email, alter PitchList, or perform any other launch action.

Each agent must report **GO / CONDITIONAL-GO / NO-GO for its own area**, with:

- exact blockers that would prevent a public launch today;
- which items are true safety/correctness blockers versus nice-to-have polish;
- what must be changed or verified for **new-customer LIVE subscriptions** specifically;
- whether the remaining Nashville lifecycle case is a launch blocker and why;
- rollback/recovery expectations for the agent's area;
- any operator approvals or credentials required;
- an estimated smallest safe same-day sequence, but **do not execute it**.

## Codex — readiness report requested

1. Review the current V3 customer/auth/billing/publication/runtime stack for a **same-day public FindPitches launch with new-customer LIVE Stripe subscriptions**.
2. Explicitly separate **new FindPitches billing** from **legacy PitchList subscriber migration**. State whether the existing 57-row legacy migration gate has any technical reason to block brand-new FindPitches LIVE Checkout; do not assume that it does.
3. Identify the exact LIVE Stripe requirements: product/price/mode, webhook configuration, entitlement path, Checkout/Portal behaviour, duplicate-trial/duplicate-charge controls, return URLs/domain assumptions and the minimum safe production proof needed before approval.
4. Review what must change to make the private preview genuinely public: access restriction, production/custom domain routing, same-origin API/service binding, `noindex`/SEO state, sign-in access and publication/customer projection controls.
5. State whether Nashville alone should block public launch or can remain safely withheld while lifecycle review continues.
6. Include current catalogue performance in the recommendation and distinguish launch-blocking latency from post-launch optimisation.
7. Do **not** change LIVE provider state, production routing, public access, publication or customer data while preparing this report.
8. Existing V3-011 LocalStalls conversion work may continue in shadow after the readiness report; it is not a launch gate.

## Claude — readiness report requested

1. Review the producer/Pi side for a same-day public FindPitches launch.
2. State whether current delivery cadence, lifecycle feed, recheck backlog, source freshness, Pi health and off-site backup are sufficient for public operation today.
3. Give the exact Nashville evidence/custody position and state whether it can safely remain withheld without blocking the rest of the catalogue.
4. Identify any producer-side condition that could make a public catalogue unsafe today versus normal post-launch improvement work.
5. Confirm what, if anything, a public launch changes for the Pi producer. Do not install/change anything solely for launch readiness unless Chris separately approves it.
6. V3-011 international producer work may continue in shadow; report READY impact separately from launch readiness.

## ChatGPT — readiness review owner

1. Reconcile Codex and Claude readiness reports into a single V3-010 recommendation for **public FindPitches + new-customer subscriptions**, not a PitchList replacement/migration event.
2. Correct earlier cutover assumptions that treated V1/PitchList as the direct rollback target. PitchList remains an independent protected product.
3. Define the smallest safe launch sequence and rollback for FindPitches itself, including public routing/access, publication state, SEO/noindex, auth, LIVE billing and monitoring.
4. Keep legacy PitchList subscriber migration as a separate gate unless evidence shows an unavoidable coupling.
5. Do not authorize or execute launch actions. Final recommendation must still require Chris's explicit approval.

## Strategic horizon — Europe after the current international wave

This is a **future-direction note, not a current task or launch gate**.

Once IE/CA/AU/NZ and launch work are stable, Chris wants the next major expansion wave to target **France, Germany, the Netherlands and Spain**. Europe is considered too commercially important to ignore.

Expected shape of that later programme:

- native-language discovery/source vocabulary and country-specific organiser/platform/council research;
- first-language customer pages/search terminology/SEO rather than English-only country variants;
- country-specific geography, date, event and application-route handling;
- source-specific proof parsers where generic proof is insufficient;
- success measured as **customer-ready/READY inventory by country**, not candidate volume;
- capacity planning for producer acquisition/revalidation as European source volume grows, while Cloudflare/D1 catalogue efficiency and caching/indexing are improved.

Likely future workstream name: **V3-012 European expansion**. Do not claim or start it yet unless Chris separately orders it.

## Existing non-launch work after readiness reports

- Claude: continue V3-011 producer expansion/fixes and V3-002 recommendation according to existing ownership, subject to any launch-priority reprioritisation Chris gives later.
- Codex: continue reviewed AU LocalStalls conversion work and safe catalogue optimisation after the readiness report, unless Chris explicitly pivots the team to launch execution.
- ChatGPT: maintain V3-010 and coordinate readiness evidence.

## Standing gates

Until Chris explicitly approves an exact launch plan, do not make FindPitches public, remove private access controls, remove `noindex`, enable LIVE billing, create/charge real customers, migrate legacy subscribers, publish customer inventory, change production/custom domains, restart paid acquisition, send unapproved messages, enable UKCraftFairs Option B, alter live PitchList, delete legacy infrastructure or merge to protected/live branches.
