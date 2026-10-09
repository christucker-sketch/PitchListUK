# V3 commercial application preparation — 9 October 2026

Historical 16:38 checkpoint, retained unchanged below. For the subsequently supplied handover and implemented native preview, see [the current report](findpitches-v3-customer-preview-2026-10-09.md).

Management checkpoint, **16:38 Europe/London**. V3 has real shadow inventory and a working independent producer path. It is **not yet ready for controlled subscriber testing**: the authoritative Build 4 handoff is absent, and native subscriber/auth/billing services have not yet been implemented. Frontend copying or integration has not begun.

## Verified current commercial state

| Measure | Count |
| --- | ---: |
| Distinct commercial shadow entities | 6,973 |
| Current source-verified | 1,897 |
| Current READY | **1,890** |
| WATCH | 625 |
| Quarantined | 692 |
| Blocked | 3,766 |
| READY: US / GB / AU / NZ / CA / IE | 1,753 / 128 / 5 / 4 / 0 / 0 |
| V3 customer-visible opportunities | **0** |
| V3 customer/publication rows | **0 / 0** |
| Paid queries today / added by this work | **0 / 0** |

READY means current source/revision proof and supported application state/route, not an old cached flag. It remains shadow-only. The exclusive origin breakdown is 1,026 platform catalogue, 391 independent structured, 346 retained V2 recovery, 123 UK official, 3 source-led paid search, 1 live UK Mk1 recovery; city search and legacy global recovery contribute zero current READY. These sum to 1,890.

Producer membership overlaps: 907 current READY entities have independent producer evidence, including entities originally acquired by other lanes. That is **not** 907 additional opportunities or 907 producer-origin READY. UK inventory remains concentrated: 123 of 128 READY come from Mynt Image; the remainder come from Eventeny/LocalStalls/Northampton source proof.

## What has been verified and changed

1. **V3/V1 architecture audit completed.** Read-only inspection covers deployed V3 services/schema/secrets/monitoring and V1 signup/access/Checkout/webhooks/canonical entitlement/persistence. Relevant V1 reference code matches the deployed build commit. V1 production deployment is unchanged; no V1/V2 database writes, customer changes or Stripe production calls were made.
2. **V3-native product architecture prepared.** [Architecture and implementation contract](findpitches-v3-customer-architecture.md) defines a separate V3 customer store, native passwordless auth/sessions, independent Stripe mapping/webhooks/entitlement, customer projection/API, restricted preview, one-way subscriber recognition, dependency audit and rollback. It preserves scheduled-cancellation paid-through behaviour and prevents a second charge path. This is a prepared design, not a completed subscriber service.
3. **Recheck delivery fault fixed and deployed.** The previous API exposed only the oldest 100 requests. Cursor pagination now reaches the backlog; the delivery client follows all pages, rejects loops and includes exact producer ID in acknowledgements. Existing pending work timestamps are no longer advanced by repeated watch ticks. Acknowledgements atomically retain immutable custody of the accepted fresh source revision; future/stale/unlinked evidence cannot clear work.
4. **Live bookkeeping reconciliation completed.** The deployed endpoint fetched all 1,403 pending requests at 16:36 London. Exactly 67 had fresh accepted linked evidence and were acknowledged through the guarded API: 63 US, 2 AU, 2 GB. **1,336 remained**, with zero fresh-ack-eligible requests at that check. No unsupported timestamps or READY promotions were manufactured. Producer execution of these requests remains a separate evidence requirement.
5. **Known legacy paid-controller gap stopped.** Under the brief's instruction to fix spend-control gaps, only the separate legacy global acquisition Worker's execution/US/UK/CA controller gates were set false. Its code SHA, unrelated bindings/secrets/DO state and schedules were preserved. A complete retained scan of **1,987 workflow instances** found **zero active**. V2's already-empty scheduler was inspected and left unchanged. The branch's legacy configuration now defaults all gates false and its automatic deploy/proof job is disabled, preventing that branch's redeployment from restoring enabled policy.
6. **Truthful application monitoring added.** `/status.customer_application` identifies missing Build 4/native auth/subscription/Stripe capability, zero customer-visible inventory and existing private READY feed. `/status.structured_delivery.rechecks` exposes backlog, acknowledgement eligibility/completion and countries. New repeatable operator audit scripts report the commercial/preparation funnel without creating a legacy runtime dependency.

The live spend stop is narrower than an account-wide provider lock. External/Pi Serper clients and older protected-main deployment jobs remain outside V3's query budget. Paid work must stay disabled until every key/client is accounted for and the deployment-reenable risk is closed. No protected/live merge was performed.

## Producer, updates and count reconciliation

Pi transport was active with confirmed recent 15-minute contacts. Latest authenticated poll: **16:25:27 London**; latest accepted new receipt: **15:39:49**; latest source check: **15:29:49**. An earlier 21.5-minute interval coincided with delivery activity; later observed intervals returned to approximately 15 minutes. Aggregate one-hour freshness warning is separate from transport failure; the known discovery cycle is three hours with export lag. It should be aligned with that cadence without extending individual source-proof expiry.

| Country | Latest accepted producer units | Linked | READY units | WATCH | Quarantined | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GB | 223 | 223 | 2 | 164 | 33 | 24 |
| US | 1,430 | 1,427 | 893 | 229 | 215 | 90 |
| AU | 199 | 199 | 5 | 16 | 66 | 112 |
| CA | 29 | 29 | 0 | 9 | 6 | 14 |
| NZ | 90 | 90 | 4 | 5 | 77 | 4 |
| IE | 2 | 2 | 0 | 0 | 0 | 2 |

Units use the most recent accepted source-check revision per producer ID/country. Unit and origin/membership entity totals are deliberately different denominators. Three US units are held without an entity link rather than force-reconciled. Two rejected malformed receipts are reported separately, not counted as accepted units.

For GB, **delivery/acceptance is not dropping those 223 accepted units**. The largest proof blocker is HTTP 520, affecting **150 IDs**. Other overlapping blockers include missing single-event proof (25), ambiguous application/current-open proof (17), selected date disagreement (12), and scoped event content gaps (9). This does not establish that all 150 inaccessible records are usable or recoverable READY.

The producer's usable count, latest complete export manifest, source-fetch custody and per-request execution logs are still needed from Claude to complete `producer usable → delivered → accepted → READY → customer-visible`. Current customer-visible is zero by design. No quality gate was relaxed to increase this count.

Five producer IDs historically linked to two V3 IDs after source-route changes: four changed Eventeny application IDs, one changed LocalStalls route. Original records, reconciliation decisions and entity IDs remain preserved. Distinct application routes may be legitimate offers; no automatic merging or destructive relinking was attempted. Stable producer/application identity and explicit supersession/alias handling must be settled with Claude before claiming lifecycle completion.

Updated [delivery runner package](/workspace/outputs/findpitches-v3-producer-delivery-rechecks-v2.zip) contains code/templates/documentation only, **no credentials**. If Pi runs the original delivery client, install the two updated modules while retaining its config/token/checkpoints; another client must implement equivalent cursor/exact-ID acknowledgement support. Cloud deployment does not install host code. The independent source engine must act on `rechecks.json`; fetching it alone is insufficient.

## Subscriber journey and legacy independence

Build 4 repository/branch/commit/project/build/mock/API/SEO mapping has **not been supplied**. No frontend has been selected, copied, redesigned or connected. The older V2/YeeHaw frontend remains reference-only and is not a V3 runtime base.

The V3 native subscriber API/auth/Stripe service and real browse→detail→application journey are **planned, not proved**. Safe V1 Stripe test bindings were identified by mode only; no V3 webhook was registered, no live webhook redirected, no price/subscription/customer changed and no charge created. Existing customer import/recognition is designed as a controlled one-way verified import, not ongoing V1 calls or copied bearer sessions.

Normal V3 data processing has zero required V1/V2 runtime dependencies. Its optional fixed anonymous UK live-catalogue audit is operator reference tooling. The complete-application decommissioning answer is **not yet demonstrated**, because there is no complete subscriber application to exercise. The planned runtime depends only on owned V3 services, producer, Stripe, email and original source infrastructure. Final proof requires running the subscriber journeys with every legacy/old frontend host denied, without actually switching any live service off.

## Launch issue classification

| Class | Current issue | Next launch-critical action |
| --- | --- | --- |
| BLOCKER | Authoritative Build 4 handoff absent | Claude supplies source custody and exact API/SEO/build mapping; positively verify before copying |
| BLOCKER | V3 native subscriber API/auth/entitlement/Stripe absent | Implement isolated customer service and prove signed-out/registered/active/cancelled-paid-through/expired states using safe test mode |
| BLOCKER | Producer recheck/count/identity reconciliation incomplete | Pi pagination update/equivalent, execution logs, UK usable manifest and five identity-route reviews |
| BLOCKER before paid expansion | Full account/client attribution and old-main reenable gap unresolved | Keep paid disabled; verify external/Pi keys and deploy controls before any allowance |
| BLOCKER before customer movement | Migration/canonical entitlement/production Stripe/rollback proof absent | Controlled import manifest and explicit production approval later |
| SHOULD FIX | 150 GB HTTP 520 holds; narrow UK source breadth | Diagnose legitimate source access/evidence with producer, preserving proof requirements |
| SHOULD FIX | Aggregate freshness warning assumes one hour | Align health expectation with known discovery/export cadence; retain source-proof TTL gates |
| SHOULD FIX | Old protected-main deployment workflow can restore legacy enabling config | Preserve external deployment freeze until an approved safe promotion; no protected merge in this work |
| LATER | Wider acquisition, richer facets/personalisation and performance polish | Follow subscriber journey proof and actual commercial demand |

## Validation and rollback

- **186/186 full V3 tests passed**, zero failures/skips, including native D1/queue and 100-row preservation control.
- **54/54 legacy controller/safety tests passed**; **30/30 auth/email/controller reference tests passed**. Reference tests do not establish live customer behaviour.
- Eight owned V3 shadow Workers deployed with one additive acknowledgement migration; no live routes, publication grants or paid grants enabled.
- Deployed all-page/67-ack exercise passed; an invalid exact work token was refused. No Serper queries were used.
- Preservation comparison covered **15,811 existing receipts and 108,819 source facts**: **zero destructive source mutations and zero existing identity changes/missing entities**. V1 deployment remained unchanged, publication API returned 403, customer/publication rows stayed zero and no V3 paid query was added. Changed files and the runner package passed credential scanning.

Current rollback restores the preceding V3 code bundle while preserving the additive acknowledgement ledger and all source evidence. Existing runner remains compatible with the first-page contract. Legacy paid flags stay disabled; re-enabling spend is a separately reviewed action. Future preview rollback revokes/disables only V3 preview sessions/service, preserving V1, Stripe and retained evidence. No table deletion or infrastructure removal is part of rollback.

**Recommendation:** proceed with the exact Build 4 handoff and the already prepared V3-native customer service contract. Keep V1 operating, V2 read-only, publication/cutover disabled and paid acquisition disabled. This checkpoint completes the authorised work possible before handoff; it does not declare the subscriber product complete.

Machine evidence: [preparation snapshot](../operations/findpitches-v3/reports/customer-preparation-2026-10-09.json). Private per-record evidence, code/binding preservation records and credentials remain outside Git.
