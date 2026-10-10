# FindPitches V3 current shared status

Maintained initially by **Codex**. This is a manual, evidence-linked dashboard. Other contributors may update it when they have a newer verified observation. It is not live telemetry. Record what was checked and when rather than changing the date on old measurements.

**Latest full commercial breakdown:** 10 October 2026, **10:20:32 Europe/London**. Latest private-preview availability: **19:17:48**, 1,841 listings including 128 GB; [V3-008 report](../docs/findpitches-v3-native-operational-checkpoint-2026-10-10.md). These are separately timed observations. Morning operational/frontend measurements retain their timestamps in the [full checkpoint](../docs/findpitches-v3-team-status-2026-10-10.md). Later customer deployment/billing/acceptance evidence through **19:24:29** is recorded below; the full morning origin/disposition breakdown was not recounted.

**Product position:** working private V3 customer preview; **1,841 eligible listings**, including **128 GB**, at 19:17:48. The full origin/disposition breakdown below is the retained morning snapshot (1,849 READY). The live UK Pitchlist production service remains unchanged. V3 public launch and live billing are not enabled.

| Area | Verified position | Next open item |
| --- | --- | --- |
| V3 backend | Eight isolated shadow Workers, evidence D1, reconciliation and source-proof/readiness gates | Sustainable refresh and broader verified sources |
| Frontend | Standalone approved Build 4; V3-008 API39/39/browser30/30 at 19:17–19:24 | Catalogue/boot latency profiling before release |
| Native email/sign-in | One authorized test email delivered; native sign-in and consumed challenge confirmed | Alert email delivery remains disabled |
| Billing | Synthetic recognition + genuine hosted TEST journey complete; 22 browser checks include portal cancellation, paid-through and TEST-clock ended access | Actual canonical subscriber/product/price continuity and gated migration |
| Pi delivery | All-page host totals retained; three fresh exact receipts/acks and complete lifecycle trace independently proven at 19:14 | Three audited obsolete/replacement/cross-edition resolutions |
| Queue health | Zero due/leased/dead jobs and pending customer webhooks at 19:20:44 | 9,280 future watch jobs are not due backlog |
| Paid discovery | V3 paid programme manually paused, bulk off; legacy paid flags off; V2 scheduler empty | External-client spend attribution before any later paid decision |
| Safety | Latest full preservation audit: zero destructive source mutations, identity changes or publication leakage | Preserve evidence/identity safeguards in every task |

## Frontend deployment and access

- **Preview:** <https://findpitches-v3-customer-preview.ctucker.workers.dev>
- Cloudflare Worker: `findpitches-v3-customer-preview`; active version `9ba2ac7a-7cdf-4cc0-b0f4-b11477c52169`, deployed **19:14:49 London, 10 October**. [Deployment evidence](../operations/findpitches-v3/reports/native-operational-deployment-2026-10-10.json). This is 100% of the private preview Worker's traffic, not production traffic. Account/pricing now reflect actual trial eligibility and review restrictions; directly installed mail binding validated with zero sends.
- Physically owned assets: `web/findpitches-v3-web/public`; same-origin V3 API with private `V3_READY_API` service binding. No dev stub or V2 frontend runtime dependency.
- Uninvited homepage access returns **401**. Existing authorized preview sessions can open the URL; forwarding a consumed sign-in link does not invite someone else.
- No custom domains or Worker routes on `findpitches.com` or `pitchlist.uk`. Checked pages are noindex. No production cutover or public SEO publication.
- Free search; application/source links and alerts on Pro. Test price: GBP £4.99/month with a seven-day first trial. One reviewed synthetic TEST subscriber is recognized; actual subscribers have not been migrated or automatically recognized.

## Commercial inventory snapshot — retained 10:20:32 measurement

7,044 distinct commercial entities; 108 test/control entities excluded. Current dispositions: **1,849 READY; 595 WATCH; 797 quarantined; 3,803 blocked**. Verified/awaiting/application-proof/stale flags overlap these dispositions and must not be added to them.

| Exclusive origin | READY |
| --- | ---: |
| Free platform catalogue | 989 |
| Claude/Pi independent structured producer | 401 |
| Recovered V2 evidence | 332 |
| UK official organiser programme | 123 |
| Earlier source-led paid pilot | 3 |
| Live UK Pitchlist recovery | 1 |
| City search / salvaged legacy paid UK discovery | 0 / 0 |
| **Total** | **1,849** |

Structured-producer evidence contributes to **898 READY entities across origins**. This overlapping membership is not an additional 898. Origin is the earliest accepted commercial producer receipt linked to each entity.

| Country | READY |
| --- | ---: |
| GB | 128 |
| US | 1,713 |
| AU | 4 |
| NZ | 4 |
| CA / IE | 0 / 0 |

Sources: **Eventeny 1,715; Mynt Image 123; LocalStalls 10; Northampton Town Council 1**. The UK offering is concentrated: 123/128 applications are Mynt Image. Globally the applications form 1,187 advisory exact event groups, not 1,849 different festivals. No identity merge is implied.

All READY have proved application URL, organiser and location; 93.56% have a future start date. New first-time READY in the London day at this checkpoint: **0**. READY is down 61 from the previous evening, mainly US; the full net decline has not been attributed per record. Current telemetry separately reports 168 previously READY entities withheld for stale/expired proof. No source evidence was deleted.

## Producer, freshness and spend — retained morning snapshot

- Last authenticated Pi poll: **10:09:03 London**; latest new receipt **09:53:33**; latest source check **09:38:07**. Aggregate export warning false. Recent transport intervals: approximately 21, 15 and 15 minutes; strict cadence flag false.
- Discovery every three hours plus up to one hour export lag is separate from 15-minute delivery and from individual source-proof expiry.
- **1,384 pending rechecks**, including 153 GB and 1,023 US. 544 immutable acknowledgements in the last 24 hours; only four currently eligible for fresh-evidence acknowledgement. Acknowledgement is not READY or proof that every requested host check ran.
- **154 UKCraftFairs source HTTP 520 blockers** in the retained GB-market population. Access failure is a blocker, not 154 promised recoverable READY records.
- Serper balance **43,474** at 10:22:15 London, unchanged from the recorded post-pause balance. Zero V2/V3 paid attempts today. All four audited legacy paid flags disabled; zero active workflows across 1,788 retained instances; V2 scheduler empty.
- V3 hard limits: **4/run, 100/hour, 1,000/day**. Commercial limit **25/day**, manually paused. No standing paid scheduler. V3 controls do not lock external/Pi credentials; attribution remains open.
- Lifetime V3 queries: 25; four paid-origin entities reached confirmed READY historically, three remain READY. Unit monetary price is unknown; no monetary cost claim.

## Verification and launch gates

Latest full suite **225/225** at 19:11:25 London; final focused customer/recognition **26/26** and frontend independence + unit checks **3/3** at 19:14:35; V3-008 API **39/39** at 19:17:48 and browser **30/30** at 19:24:29. Genuine hosted billing **22/22** retains its 17:39:14 completion time. Earlier deployed synthetic recognition **16/16**, mail/auth **21/21** and UI **23/23** retain their prior timestamps. [Hosted/acceptance evidence](../docs/findpitches-v3-hosted-customer-journey-2026-10-10.md) · [Mail evidence](../docs/findpitches-v3-email-setup-2026-10-10.md) · [Architecture](../docs/findpitches-v3-customer-architecture.md).

Open: three exact obsolete/replacement/cross-edition lifecycle resolutions; broader UK source-backed inventory; actual canonical LIVE subscriber/product/price continuity and gated migration; approved alert delivery test; source-backed type classification; catalogue/boot latency profiling; exact launch domain/monitoring/rollback proposal and explicit live domain/billing/publication/cutover approval. V3-008 bounded real-origin acceptance is complete; it is not a production load or penetration test. V3-004's synthetic matrix/acceptance package and V3-005's hosted TEST journey are complete. Producer source custody is completed as V3-003, including Chris's recorded running-kit hash check. The whole-product deletion/independence test remains open even though the frontend/API runtime owns its code and storage.

## Later execution checkpoint — 10 October, 12:29 London

[Cloud lifecycle inspection](../docs/findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md) independently matches the first Pi feed: 2,044 accepted, 119 inserted, 1,925 unchanged duplicates and zero rejected. All 119 matched existing identities; zero new entities and zero cohort visibility in the customer snapshot at 12:22. 113 selected lifecycle states advanced; six same-source-clock conflicts remain held. Exact-receipt acknowledgements and one prior OPEN_NOW → CLOSED trace are retained, with missing producer execution/prior-channel evidence explicitly noted. Claude retains V3-001.

Full preservation at 12:24:32 London: zero source mutations, identity changes or customer/publication leakage; zero paid queries today; bulk off; live Pitchlist deployment and V2 schedules unchanged. Queue snapshot at 12:22: five due jobs, zero leased/dead. No runtime deployment or refreshed commercial inventory total is implied.

Codex retains V3-004 with a [reviewed-association implementation/test sequence](../docs/findpitches-v3-customer-launch-checkpoints-2026-10-10.md); existing customer tests pass 11/11. V3-005 is blocked on native-browser certificate trust through the environment proxy. TEST credentials are present; no actual hosted checkout was attempted. Publication, live billing, migration, cutover and acquisition stay disabled.

**Historical runtime checkpoint:** `00c752e2104d4006600d12b9188aa91ba2199c6b`. **Morning full report commit:** `1825ae7b61e17084444ce0199d5ee20dc02d69a1`. The implementation/deployment below supersede that runtime checkpoint; source custody is the feature-branch commit containing its linked report. For next work/ownership use [ORDERS.md](ORDERS.md) and [TASKS.md](TASKS.md); for actual approvals use [DECISIONS.md](DECISIONS.md).

## Customer implementation checkpoint — 10 October, 13:24 London

[V3-004's reviewed synthetic TEST recognition](../docs/findpitches-v3-subscriber-recognition-2026-10-10.md) is implemented/deployed and its matrix complete. One append-only association/mapping, zero Checkout attempts; correct/wrong owner, replay/concurrency, duplicate protection, trial/active/cancellation/redaction pass. Paid-through end boundaries are locally proved; no elapsed hosted expiry or actual migration claim. No V1/V2 runtime dependency or provider metadata rewrite.

**V3-005 remains blocked:** native Chromium trust/sign-in/cookies/redaction pass with a scoped disposable profile. Proxy **403** for hosted Checkout, Billing Portal and JavaScript. Restricted egress permits only Stripe API today. An additive Codex environment network/startup draft is saved; settings application and genuine hosted TEST flow remain necessary. No new credential or TLS bypass required.

**V3-001 cloud support:** six exact conflict rechecks already exist, original tokens preserved; [IDs/request ledger](../operations/findpitches-v3/reports/lifecycle-conflict-rechecks-2026-10-10.json) observed 12:45:16 London. Claude reports the all-page kit installed; next full discovery execution/deferred counts and genuinely fresher evidence remain pending. The 119-receipt proof keeps its separate timestamp.

**D-012 read:** contact-organiser inventory needs verified usable HTTPS routes and accurate enquiry/login labels. UKCraftFairs transport remains unresolved; option B preparation stays off. No READY gain inferred.

Preservation at 13:06:51: zero mutations/identity changes/customer projection/publication queue rows; live Pitchlist and V2 unchanged; paid queries today zero, bulk off. Publication, cutover, live billing, migration, acquisition and protected/live merges remain closed.

## Latest acceptance checkpoint — 10 October, 17:42 London

**V3-005 DONE:** [genuine hosted TEST proof](../docs/findpitches-v3-hosted-customer-journey-2026-10-10.md), 22/22 checks. Native sign-in, actual hosted card Checkout, canonical trial/Pro, actual portal cancellation, paid-through and TEST-clock ended/redacted access passed. One hosted-created subscription; no API-created substitute or cache/date manipulation. Required hosted egress now works with constrained isolated browser trust. Earlier blocker entries above are historical.

**V3-004 acceptance package complete:** [exact ownership/entitlement and operator review/rollback](../docs/findpitches-v3-subscriber-acceptance-2026-10-10.md). Read-only live UK registry: 57 records, cached active 27/trialing 6/cancelled 22/past due 2; 49 exact vendor bindings. All 57 need fresh canonical provider mode/product/price/period-end coverage. Real continuity/migration remains gated; these are not verified paying-customer counts.

**V3-001 support:** six original conflict tokens still pending; no fresh evidence/acks at 17:24:46, zero cohort customer-snapshot visibility at 17:38:31. [Checkpoint](../operations/findpitches-v3/reports/lifecycle-followup-2026-10-10.json). Claude retains full-cycle/refetch closure work; UKCraftFairs option B remains OFF.

**Safety at 17:42:31:** [preservation](../operations/findpitches-v3/reports/customer-hosted-preservation-2026-10-10.json) passes against 15,811 original receipts, 108,819 facts and 7,077 identities: zero destructive mutations/identity changes/customer projection/publication rows/paid queries; publication API denied, bulk off, protected live UK Pitchlist and V2 schedules unchanged. No inventory recount, live migration, billing enablement, send, domain cutover, publication or protected merge. ChatGPT can now review V3-004's acceptance package and V3-005 proof for V3-010.

## Codex independent lifecycle / migration checkpoint — 2026-10-10T19:04:27+01:00

[All six cloud outcomes](../docs/findpitches-v3-lifecycle-final-cloud-2026-10-10.md): three fresh CLOSED selections proven; all six/survivor withheld. Original-token acks pending at the ledger measurement; obsolete UKCF, Ground replacement-ID and Nashville 2026/2027 reviewed identity resolution remain explicit V3-001 closure gaps. Do not substitute producer assertions for canonical V3 identity. [Real migration gate](../docs/findpitches-v3-live-migration-gate-2026-10-10.md) quantifies 57 canonical coverage gaps/eight vendor exceptions and rollback. No imports/provider writes/messages or changed V3-004/005 completion.

## V3-008 completion / migration and lifecycle handoff — 2026-10-10T19:28:38+01:00

[Restricted preview acceptance](../docs/findpitches-v3-native-operational-checkpoint-2026-10-10.md): API39/39, browser30/30, zero foreign requests/TLS bypass. All-types/geography/distance and actual eligibility CTA repairs deployed; unknown source types remain unknown. Full225, final focused26/frontend3 pass. Catalogue API median4.1s/p95 5.055s, browser4.2–20.2s under proxy/interception remain a performance concern. [19:21 preservation](../operations/findpitches-v3/reports/native-operational-preservation-2026-10-10.json) shows zero mutation/identity change/customer or publication rows/spend and unchanged protected UK Pitchlist/V2.

[V3-001 checkpoint](../docs/findpitches-v3-lifecycle-final-cloud-2026-10-10.md) now proves all three fresh exact original-token acknowledgements and complete trace; three obsolete/replacement/edition resolutions still open, all withheld. [Real migration gate](../docs/findpitches-v3-live-migration-gate-2026-10-10.md) remains 57 canonical LIVE gaps/eight vendor exceptions. V3-004/005 remain DONE. ChatGPT can use these for V3-010; no launch, live billing/migration, publication or paid approval inferred.
