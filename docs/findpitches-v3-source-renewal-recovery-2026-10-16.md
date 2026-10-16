# Source renewal repair and recovery — 16 October 2026

**V3-025 is deployed. READY increased from 1,760 to 1,842: 82 recovered opportunities, with no losses during the bounded recovery.** We checked all 105 targeted existing entities using 117 of 160 permitted source/supporting-evidence requests and zero Serper queries. No new entities were acquired or created by this operation.

| Recovery group | Checked | Restored READY | Held |
| --- | ---: | ---: | ---: |
| Previously failed source fetches | 72 | 66 | 6 |
| Deadline-today records | 32 | 15 | 17 |
| Event occurring today | 1 | 1 | 0 |
| **Total** | **105** | **82** | **23** |

The 23 remaining holds are 22 applications now closed according to current source evidence and one source/selected-deadline disagreement. Original facts were not overwritten to make them pass. The other 11 withdrawals outside this target retain their existing holds. Of the original 116 withdrawals, 82 are restored and 34 remain withheld; with the 14 earlier additions, inventory is now only 20 below yesterday's 1,862.

## Current customer-ready inventory

| Country | READY |
| --- | ---: |
| US | 1,671 |
| GB | 161 |
| NZ | 5 |
| AU | 4 |
| CA | 1 |
| **Total** | **1,842** |

Observed at 09:38 London on 16 October. Gains: 81 Eventeny and 1 Little Hummingbird. Source-ready records with coordinate evidence increased 1,068→1,102 through retained proof/cache rebinding. This was recovery of existing identities, not a paid acquisition pilot.

## What changed

Failed transport attempts now have their own immutable document/attempt custody and cannot replace positive proof. An earlier positive remains valid only within its original revision, closure, comparison and expiry rules. Retries run after 5/15/60 minutes, with a daily cooldown after four consecutive failures and an exact-host limit of 16 entity retries per 15 minutes. Stale retry pointers skip after newer evidence. Request budgets and Retry-After remain enforced; cached readiness is reevaluated at the original proof expiry.

Eventeny often already publishes an explicit local closing clock and GMT offset next to the deadline. The old parser kept only the calendar date. The new parser binds the visible clock/offset to the same vendor offer, retains its exact source-supported closing instant and rejects contradictory clocks. Unzoned clocks are not guessed. Genuinely date-only values retain calendar precision and a labelled operational horizon. Today's event is not treated as ended at midnight. CLOSED, cancellation, edition/identity and conflicting-field holds remain enforced.

Complete vendor-application proof now avoids unnecessary contact/signup expansion. The initial canary correctly stopped at supporting-request limits; recovery resumed from the same frozen 1,760 baseline with every request already used still counted in the 160 ceiling. The final stop was `bounded_cohort_complete`, with 43 requests unused.

## Verification and custody

- Full V3 suite: **451 passed**, zero failures/skips; focused renewal checks and runtime boundaries pass.
- Actual public security/API/SEO checks: **29/29 passed**, with public browsing/account recovery/LIVE Checkout retained. No test customer, email or payment objects created.
- Two naturally occurring HTTP429 failures exercised the deployed retry path: both waited for their 15-minute retry time, then obtained source results. No outstanding new retry failure remains at the final checkpoint.
- Original-build row-digest audit: 15,811 receipts, 108,819 facts and 7,077 entity identities; **zero destructive mutations/identity changes**. This broad check finished at 09:29 London; the final affected-cohort check separately covered 487 receipts, 6,567 facts, 116 prior proofs, 116 documents and 116 identities after recovery, all unchanged.
- Core due/leased/dead processing jobs and stale leases:zero. Pi contact/cadence/freshness healthy; 385 producer rechecks remain distinct from V3 source verification and are not falsely acknowledged.

Migration 0024 is additive attempt/admission storage. All eight source Workers were released with native bindings/secrets/schedules preserved; a final fetch-only optimisation updated enrichment. The customer Worker/version, customer storage/provider configuration, routes/DNS, V2 and live PitchList were untouched. An initial candidate missing the R2 binding was rejected before activation. The corrected release reads bindings from the active deployment version, not the settings view of an unactivated upload. Retained active versions provide rollback without deleting evidence or infrastructure.

## Remaining work and honest health state

**Renewal status remains degraded because it now exposes 113 older latest failed-proof receipts outside this incident's 105-record cohort.** These were already excluded from READY; they are not 113 additional new withdrawals. Recoverability and future eligibility are unmeasured. V3-026 tracks a separately bounded, source-led audit/recheck of that older population; do not assume all 113 are useful or publishable.

D1 is 3.947 GB with 6.053 GB free, normal capacity state and the existing guards. V3-022 growth monitoring remains open; current measured samples are included in the aggregate evidence. French official HTML/PDF proof V3-020 remains open. Claude retains Pi ownership and the France export soak gate; French READY remains zero, and German language support does not activate DE intake. Paid acquisition, source publication, customer alerts and unrelated migration gates remain closed.

[Aggregate evidence](../operations/findpitches-v3/reports/source-renewal-recovery-2026-10-16.json) · [Implementation policy](findpitches-v3-source-renewal-policy.md) · [Original withdrawal diagnosis](findpitches-v3-ready-withdrawals-2026-10-16.md).
