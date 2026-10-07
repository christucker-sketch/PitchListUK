# Source verification quality — 7 October 2026

**Remain shadow-only. Keep paid acquisition and publication disabled. Another paid pilot is not justified by these results.**

The new verification layer requires current source proof independently of discovery classification. All 120 original legacy audit entities, all 10 original paid-pilot entities and 20 existing source-family controls were reprocessed. Verification used direct original-source requests and zero additional Serper queries. An extra live recheck confirmed the waitlist correction, giving 151 retained verification/source-document receipts for 150 distinct entities.

## Comparable legacy quality

| Classification | Original audit | After source proof |
|---|---:|---:|
| Clearly usable | 10 / 120 — 8.33% | 11 / 120 — 9.17% |
| Usable with minor gaps | 8 / 120 — 6.67% | 0 / 120 — 0% |
| Clearly usable or minor gaps | 18 / 120 — 15% | 11 / 120 — 9.17% |
| Questionable | 77 / 120 — 64.17% | 84 / 120 — 70% |
| Wrong/unsafe retained discoveries | 25 / 120 — 20.83% | 25 / 120 — 20.83% |

Eleven legacy entities now have current, complete vendor proof and are READY. One previously minor-gap record became clearly usable. The lower combined usable rate reflects stronger verification requirements: an unproved current vendor route is a material gap, even when event metadata is real. Earlier labels used retained evidence and less complete live source checks. These are descriptive Codex reviews of the same diversity sample, not independent human gold labels or a population estimate.

The 25 known unsafe discoveries were not relabelled as repaired merely because they were quarantined. All remain withheld from readiness. Fifty legacy records carrying the targeted risk patterns or an unsafe prior label have zero READY promotions in the final run. Immutable legacy holds were retained.

During the live audit, one Eventeny application titled **“WAITLIST - Youth Vendor, Non Profits, & other”** exposed a false promotion from an in-stock offer and a Start Application control. The verifier now gives the application heading precedence, retains WATCH evidence, and blocks the conflicting selected OPEN claim. A regression test covers this exact pattern. All 21 initially verified/partial source snapshots were re-inspected; the affected record was fetched and verified again. Conditional terms such as “if you are waitlisted” do not by themselves classify a route as waitlist-only. No customer/publication record was created.

## Pilot and platform results

The paid pilot remains **12 queries → 10 entities → 0 ready opportunities**. All 10 entities resolve to social pages, not proved trader opportunities. Their new disposition is quarantine; direct fetching added no Serper usage. Queries per ready opportunity remains undefined because readiness yield is zero.

| Additional source-family controls | Checked | READY |
|---|---:|---:|
| Eventeny | 4 | 4 |
| LocalStalls | 4 | 1 |
| UKCraftFairs | 4 | 0 |
| Eventbrite | 4 | 0 |
| Marketspread | 4 | 0 |
| Total | 20 | 5 — 25% |

Eventeny vendor-ID-scoped proof performs best in this small control set. LocalStalls can prove a current route when its specific application UUID/event UUID, explicit open state, dated event and country are present. Footer vendor registration does not qualify. UKCraftFairs returned HTTP 520 for the controls and remains unverified. Eventbrite visitor offers and vendor-themed titles do not prove trader availability; Marketspread login shells do not prove event details. These controls were not previously scored, so their rate is not a before/after improvement claim.

Across the 150 entities, **30 selected field values were repaired through stronger additive evidence**: 14 locations, six end dates, three start dates, three organisers, three application states and one application URL. Original source facts and receipts stayed intact. Discovery fields that disagree with current direct proof, but cannot be replaced under the existing authority rules, remain held.

## Safety and operating state

- All **92 V3 tests** pass, including native workerd/D1, queue delivery, the 100-row preservation control, source verification, deadline/state contradictions, waitlist handling and proof-scoring safeguards.
- All eight owned V3 shadow Workers and migration 0010 are deployed. Resource checks retain the owned shadow D1/queue bindings and no publication transport binding.
- **8,143 original receipts and 63,662 original facts checked; zero destructive mutations.** Verification created no entities; the entity count remains 5,565 across shadow and test scopes.
- Zero customer rows, zero publication rows, zero due core/acquisition jobs, zero dead jobs and zero stale leases. Future watch jobs are scheduled work, not a current backlog.
- Serper completed queries remain **12 before → 12 after** for the current London budget day. Bulk is disabled; limits remain **4/run, 100/hour, 1,000/day** and the previous poor-yield pilot remains paused.
- Old derived READY claims require proof now. The pre-change cache held 1,445 READY rows; the verified result holds 16 across the checked corpus. Unverified existing entities remain watch/blocked until directly verified. This is deliberate invalidation of derived claims, not destruction of their source evidence.
- V2 code, infrastructure and data were not modified. Production traffic, publication and protected branches were untouched.

Use free structured delivery and direct-source verification to improve coverage before another paid trial. Resolve blocked UKCraftFairs retrieval, unproved application routes and structured-producer contradictions first. A future small pilot should deliberately target verifiable official/platform event routes and require measured ready yield before expanding. The current social-heavy city queries do not justify further spend.

See the [machine-readable quality report](../operations/findpitches-v3/reports/source-verification-quality-2026-10-07.json) and [verification design](findpitches-v3-source-verification.md).
