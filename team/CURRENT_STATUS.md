# FindPitches V3 current shared status

Maintained initially by **Codex**. This is a manual, evidence-linked dashboard. Other contributors may update it when they have a newer verified observation. It is not live telemetry. Record what was checked and when rather than changing the date on old measurements.

**Latest inventory observation:** 10 October 2026, **10:20:32 Europe/London**. Operational/safety checks through **10:25:35**; frontend checks through **10:35**. [Full checkpoint](../docs/findpitches-v3-team-status-2026-10-10.md).

**Product position:** working private V3 customer preview; **1,849 source-proved READY application opportunities**, including **128 GB**. The live UK Pitchlist production service remains unchanged. V3 public launch and live billing are not enabled.

| Area | Verified position | Next open item |
| --- | --- | --- |
| V3 backend | Eight isolated shadow Workers, evidence D1, reconciliation and source-proof/readiness gates | Sustainable refresh and broader verified sources |
| Frontend | Standalone approved Build 4 deployed on owned customer Worker; seven pages and three sampled assets returned 200 | Performance/security and completed commercial journeys |
| Native email/sign-in | One authorized test email delivered; native sign-in and consumed challenge confirmed | Alert email delivery remains disabled |
| Billing | Stripe TEST Checkout/entitlements/portal/signed webhook; zero pending receipts | Hosted TEST checkout and existing-subscriber recognition |
| Pi delivery | First lifecycle delivery now cloud-checked; all 119 new receipts linked to existing entities and withheld (12:22 London) | All-page host execution, explicit prior current-channel trace and six equal-clock holds |
| Queue health | Zero due, leased or dead jobs at 10:22 | Distinguish producer rechecks from pipeline queue jobs |
| Paid discovery | V3 paid programme manually paused, bulk off; legacy paid flags off; V2 scheduler empty | External-client spend attribution before any later paid decision |
| Safety | Latest full preservation audit: zero destructive source mutations, identity changes or publication leakage | Preserve evidence/identity safeguards in every task |

## Frontend deployment and access

- **Preview:** <https://findpitches-v3-customer-preview.ctucker.workers.dev>
- Cloudflare Worker: `findpitches-v3-customer-preview`; active version `b218bfcf-1f5f-4395-893e-be9ce4d81d8d`, deployed **10:06 London, 10 October**. This is 100% of the private preview Worker's traffic, not production traffic.
- Physically owned assets: `web/findpitches-v3-web/public`; same-origin V3 API with private `V3_READY_API` service binding. No dev stub or V2 frontend runtime dependency.
- Uninvited homepage access returns **401**. Existing authorized preview sessions can open the URL; forwarding a consumed sign-in link does not invite someone else.
- No custom domains or Worker routes on `findpitches.com` or `pitchlist.uk`. Checked pages are noindex. No production cutover or public SEO publication.
- Free search; application/source links and alerts on Pro. Test price: GBP £4.99/month with a seven-day first trial. Existing subscribers have not been migrated or automatically recognized.

## Commercial inventory snapshot

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

## Producer, freshness and spend

- Last authenticated Pi poll: **10:09:03 London**; latest new receipt **09:53:33**; latest source check **09:38:07**. Aggregate export warning false. Recent transport intervals: approximately 21, 15 and 15 minutes; strict cadence flag false.
- Discovery every three hours plus up to one hour export lag is separate from 15-minute delivery and from individual source-proof expiry.
- **1,384 pending rechecks**, including 153 GB and 1,023 US. 544 immutable acknowledgements in the last 24 hours; only four currently eligible for fresh-evidence acknowledgement. Acknowledgement is not READY or proof that every requested host check ran.
- **154 UKCraftFairs source HTTP 520 blockers** in the retained GB-market population. Access failure is a blocker, not 154 promised recoverable READY records.
- Serper balance **43,474** at 10:22:15 London, unchanged from the recorded post-pause balance. Zero V2/V3 paid attempts today. All four audited legacy paid flags disabled; zero active workflows across 1,788 retained instances; V2 scheduler empty.
- V3 hard limits: **4/run, 100/hour, 1,000/day**. Commercial limit **25/day**, manually paused. No standing paid scheduler. V3 controls do not lock external/Pi credentials; attribution remains open.
- Lifetime V3 queries: 25; four paid-origin entities reached confirmed READY historically, three remain READY. Unit monetary price is unknown; no monetary cost claim.

## Verification and launch gates

Latest full suite **210/210**, focused mail/auth **21/21**, prior deployed UI browser checks **23/23**. The status/coordination update did not rerun the full suite. Latest full preservation audit compared 15,811 original receipts, 108,819 source facts and 7,077 identities: zero destructive mutations/identity changes/customer projection/publication queue rows. [Mail evidence](../docs/findpitches-v3-email-setup-2026-10-10.md) · [Architecture](../docs/findpitches-v3-customer-architecture.md).

Open: all-page producer recheck execution and remaining lifecycle trace gaps; broader UK source-backed inventory; existing-subscriber recognition; hosted TEST payment journey; approved alert delivery test; source-backed facets/geography; real-origin performance/security review; explicit live domain/billing/publication/cutover approval. Producer source custody is completed as V3-003, including Chris's recorded running-kit hash check. The whole-product deletion/independence test remains open even though the frontend/API runtime owns its code and storage.

## Later execution checkpoint — 10 October, 12:29 London

[Cloud lifecycle inspection](../docs/findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md) independently matches the first Pi feed: 2,044 accepted, 119 inserted, 1,925 unchanged duplicates and zero rejected. All 119 matched existing identities; zero new entities and zero cohort visibility in the customer snapshot at 12:22. 113 selected lifecycle states advanced; six same-source-clock conflicts remain held. Exact-receipt acknowledgements and one prior OPEN_NOW → CLOSED trace are retained, with missing producer execution/prior-channel evidence explicitly noted. Claude retains V3-001.

Full preservation at 12:24:32 London: zero source mutations, identity changes or customer/publication leakage; zero paid queries today; bulk off; live Pitchlist deployment and V2 schedules unchanged. Queue snapshot at 12:22: five due jobs, zero leased/dead. No runtime deployment or refreshed commercial inventory total is implied.

Codex retains V3-004 with a [reviewed-association implementation/test sequence](../docs/findpitches-v3-customer-launch-checkpoints-2026-10-10.md); existing customer tests pass 11/11. V3-005 is blocked on native-browser certificate trust through the environment proxy. TEST credentials are present; no actual hosted checkout was attempted. Publication, live billing, migration, cutover and acquisition stay disabled.

**Runtime code checkpoint:** `00c752e2104d4006600d12b9188aa91ba2199c6b`. **Full report commit:** `1825ae7b61e17084444ce0199d5ee20dc02d69a1`. Later coordination-only commits are not new runtime deployments. For next work and ownership use [TASKS.md](TASKS.md); for actual approvals use [DECISIONS.md](DECISIONS.md).
