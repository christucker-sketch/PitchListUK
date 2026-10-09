# FindPitches V3 morning audit and lifecycle repair — 9 October 2026

V3 had **1,730 READY** at 9 Oct 2026, 08:36 London time, down from yesterday afternoon’s **2,016**. The main cause was a **V3 integration defect**, not loss of stored source evidence. Routine producer lifecycle observations were treated as factual conflicts. The fix is now deployed to all eight owned shadow Workers and the bounded repair has completed. Current commercial READY is **1,882** at 9 Oct 2026, 09:25 London time.

## Why READY dropped

The record audit at 9 Oct 2026, 08:38 found **287 previously READY entities withheld and two gains**, giving **1,731 READY** at that slightly later snapshot. These exclusive categories account for every lost entity:

| Cause | Previously READY entities |
| --- | ---: |
| False conflicts on NEW / UPDATED / UNCHANGED producer bookkeeping | 170 |
| Genuine ambiguous identity | 1 |
| Conservative start-of-deadline-day expiry | 51 |
| Verification TTL expired | 34 |
| Current proof disagrees with selected source-backed fields | 29 |
| Other eligibility holds | 2 |
| **Gross losses** | **287** |

The 170 lifecycle holds were a V3 integration bug. NEW → UNCHANGED and similar observations describe delivery history; they are not contradictions about trading availability. Original facts and entity identity were retained, but these derived conflicts blocked readiness.

The 51 deadline-day holds must not be called confirmed closures. The retained application timestamps lack timezone offsets, while the current policy conservatively expires proof at the date boundary. Source-specific timezone evidence is required before extending availability. The other 34 TTL cases need genuine source renewals. Organiser, date, application-state and identity disagreements remain real holds until stronger evidence settles them.

Before repair, **zero source mutations** were found across 13,758 receipts and 83,606 facts; **zero identity/scope mutations and zero missing original entities**. The commercial entity count grew from 6,762 to 6,806 during the original comparison period. READY is a live qualification, not the number of stored records.

## What was fixed and recovered

Informational lifecycle differences are now retained as observations without replacing an existing selected lifecycle or creating evidence conflicts. Genuine CLOSED/WITHDRAWN/REOPENED/STATE_CHANGED handling, actual field disagreements, identity safeguards and expiry gates remain intact. Identical stronger corroboration remains supported so held legacy evidence cannot block qualification by better evidence merely because its value matches.

Existing metadata-only conflicts were resolved through an immutable audit ledger that references the original receipt hash and incoming/selected facts. Source facts and selected lifecycle values were not rewritten. A distinct repair token travels through normal eligibility, enrichment and readiness, preventing completed job IDs from suppressing the recheck. Clearing a conflict never directly sets READY or renews source proof.

The bounded run rechecked **230 entities**, including **170 that were previously READY**, and resolved **255 informational conflicts**. Of the repaired cohort, **162 are currently READY**, 28 WATCH, 39 quarantined and 1 blocked. Relative to the immediate pre-repair baseline, **164 became READY**, 11 are currently withheld, for a net change of **153**. These are distinct entity outcomes; resolving multiple conflicts is not multiple new opportunities. Of the 170 previously READY entities affected by the bug, 158 passed the full gate again; six are WATCH, five quarantined and one blocked for other reasons. The repair runner’s row snapshot contained 1,884 READY; its preceding status read contained 1,883 because ordinary source verification continued during the reads. The final inventory below uses the later 9 Oct 2026, 09:25 status snapshot.

The post-repair integrity audit checked 14,995 baseline receipts and 99,169 facts: **0 source mutations**, **0 identity/scope mutations**, **0 missing original entities**. No Serper queries were added.

## Current commercial inventory

| Country | READY |
| --- | ---: |
| US | 1,746 |
| GB | 127 |
| NZ | 4 |
| AU | 5 |

| Exclusive origin producer | READY |
| --- | ---: |
| independent-structured | 386 |
| legacy_v2 | 346 |
| city-search | 0 |
| source-led-search | 3 |
| platform-catalogue | 1,024 |
| uk-official | 123 |

Origin is exclusive; source membership overlaps. Test/control scopes are excluded. Application entities and exact event groups remain separate concepts. GB’s Mynt Image source remains independently attributed to uk-official, while the Pi keeps its independent-structured attribution.

## Pi and overnight delivery

Authenticated delivery cadence remained approximately 15 minutes. Overnight the cloud accepted **511 new immutable receipt versions**, replayed **7,903 duplicates** idempotently and rejected **zero records**. Identity outcomes were 469 matched receipts, 39 new entities and three probable-match receipts retained for review. They are not 511 new opportunities.

At the morning snapshot, **246 producer IDs had source checks since the previous evening**, while **1,530 were older than 24 hours**. The latest source check was 9 Oct 2026, 06:40. Discovery runs every three hours according to the host configuration; delivery runs every 15 minutes. Transport cadence and individual source freshness are reported separately.

**1,488 producer-linked rechecks** were pending at the morning snapshot. The producer fetches requests but has not yet implemented execution, as confirmed by the user. Older exports correctly do not acknowledge newer requests. The original comparison showed 44 newly created independent-origin entities with none READY before this repair; candidate/entity growth alone was not commercial yield.

## Validation and boundaries

All **160 V3 tests passed**, including explicit closure/withdrawal protection, genuine field/identity conflicts, expired proof, immutable source/repair evidence, idempotence and the automatic repaired-job path. Resource/runtime boundary checks passed; all eight owned shadow Workers were deployed. The initial morning snapshot had 23 recently due core jobs, no dead jobs and no expired leases; ordinary stage execution continued during repair. The final check at 9 Oct 2026, 09:25 found 6 due core jobs, 0 dead jobs and 0 remaining metadata conflicts. Latest producer source-check evidence advanced to 9 Oct 2026, 08:47; this does not imply all older producer IDs were refreshed.

Publication, production cutover and paid acquisition remain disabled. Customer rows and publication rows are zero. V2 was not modified, no infrastructure was deleted, and no protected/live branch was merged. All raw evidence, snapshots and detailed repair receipts remain outside Git.

The highest immediate maintenance priorities are source-proved deadline timezone handling, direct renewals for expired proof, and independent-producer recheck execution. Genuine factual or identity holds must remain blocked. Official UK source-family expansion can then continue from a stable, accurately qualified inventory.
