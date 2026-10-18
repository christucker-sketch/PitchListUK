# French conversion and renewal backlog — 18 October 2026

**Customer-ready inventory increased from 1,701 to 1,729: one French opportunity added and 27 existing US opportunities safely recovered. No customer-ready removals occurred between the frozen task baseline and the final snapshot.**

Measured at **17:25 London on 18 October**. [Aggregate evidence](../operations/findpitches-v3/reports/french-renewal-2026-10-18.json). These are distinct application opportunities, not necessarily distinct festivals. Internal commercial/source READY includes two French producer-confidence holds; it is not the customer inventory count.

| Country | Customer READY |
| --- | ---: |
| US | 1,559 |
| GB | 159 |
| NZ | 5 |
| AU | 4 |
| CA | 1 |
| FR | 1 |
| **Total** | **1,729** |

## French proof conversion

All 29 delivered commercial French entities were triaged and 26 original source pages inspected. Source-specific official-call verification now proves three real trader calls, using event-specific HTML/forms and independent government commune evidence. Navigation/footer links, passed/full editions, future openings, waitlists, unrelated forms and contradictory dates remain rejected. Closures such as “inscriptions sont désormais clôturées” also prevent promotion.

| Call | Current customer outcome |
| --- | --- |
| Podensac, Foire Sainte-Catherine | **READY**, source-supported dossier/email enquiry route |
| Kilstett, Christmas market | Source verified; original producer LOW confidence keeps it withheld |
| Hochstatt, Christmas market | Source verified; original producer LOW confidence keeps it withheld |

The other 26 remain unproved. Recurring blockers include missing single-event/application proof, identity conflicts, index/editorial pages, unrelated application purposes, full events and passed deadlines. These categories overlap. No event venue address or map pin was inferred from an organiser's address; the three calls prove locality only.

**Claude follow-up:** inspect the actual required-field/organiser confidence for Kilstett and Hochstatt, correct it only from genuine current source evidence and deliver a fresh export. Do not relabel LOW or advance an unchanged cache timestamp. [Detailed source handover](findpitches-v3-french-conversion-2026-10-18.md). Two additional READY opportunities are possible only if those producer gates are legitimately resolved; they are not counted now.

## Renewal recovery and scheduling

A separate inspection found 31 future-event positive proofs from 7 October, expired since 8 October, without an active renewal job. Direct checks restored **27 to customer READY**. Three source-title disagreements and one closed/passed-deadline application remain quarantined. All 27 recovered records now have a future renewal job bound to their current verification ID. This is recovery of existing identities, not 27 new entities.

These old gaps already predate Friday's inventory snapshot. **They are not an explanation for the separately reported 76-record decline.** No source title, identity or deadline was overwritten to force a match.

Final expiry monitoring also found three unrelated past events with old cached READY labels. Existing native readiness evaluation marked all three blocked, using retained dates with zero source requests. They were already customer-hidden, so this caused no customer inventory loss. Final expired-positive/cached-READY gap count is **zero**.

The deployed automatic policy keeps READY proof expiry at 24 hours and its early renewal at 22 hours. Weak WATCH records more than 14 days away move to weekly checks; near events stay daily. Past events and identity, quality or purpose blockers wait for review or genuinely new evidence. Existing requests, source clocks, negative receipts and producer acknowledgement safeguards remain intact. Six deferred jobs using the new policy were observed after deployment.

The snapshot model changes scheduled entity rechecks from **7,624/day to 2,626/day**, approximately 65.6% lower. This is a policy scenario, **not measured request/storage savings**: supporting fetches, retries, ordinary delivery and the transition from old jobs vary. Compare actual source attempts, disposition/yield, queue age and D1/R2 growth after 24 and 48 hours: **19 and 20 October, 16:45 London**. Separate today's 101 operator source requests from standing renewal activity.

## Producer and operational health

At **17:22 London**, the Pi's latest poll was 17:15:56, cadence verified and aggregate freshness warning false. One earlier 24.4-minute poll interval was observed; it is not a current outage. **673 producer rechecks remain pending, zero fresh-evidence-acknowledgement eligible**, with 2,184 acknowledgements recorded over 24 hours. The earlier 912 and later 668/673 counts reflect autonomous activity; Codex did not clear requests. An acknowledgement never supplies READY proof.

At final closeout, core reconciliation/eligibility/enrichment/readiness had **zero due, leased or dead jobs**; the status snapshot had zero stale leases. Ten source retries remain, nine in enforced daily cooldown. Renewal health is therefore still **degraded**, despite a clear core queue and the repaired expired-positive cohort. Do not repeatedly fetch the same failing sources or bypass backoff.

D1 was **4.421 GB / 44.21%** at the status observation. No immediate storage reduction is claimed. The actual earlier 48/72-hour storage verdict is complete; the new policy's effect needs its own observation window. Pending producer evidence and cloud retry jobs are different backlogs.

## Deployed scope and validation

Only existing V3 source Workers changed. Their active native bindings, runtime settings, queues, schedules, archive access and secrets were preserved. No provisioning, migration, route/DNS change or secret replacement occurred.

| Source Worker | Active version | Code |
| --- | --- | --- |
| Enrichment | `d168e195-0586-4fd1-9166-b5b7f3ae64e9` | `eb8e8b77` |
| Readiness | `4fbb60d0-0b65-4d69-84c0-96c265ff4150` | `01c228d4` |
| Watch | `3c9d66a1-eb0f-41ca-92e3-8fb5c393000a` | `01c228d4` |
| Source API | `05a26977-a70d-47f3-8cb9-cb67d592c5f4` | `35eaf20e` |

The customer Worker remains `a3803f31-fe3b-4482-816d-72bd05bd9987`; no billing/UI deployment occurred. Public browsing and existing LIVE Checkout remain enabled under D-014/D-016. The unused source publication pipeline remains off with zero source customer/publication rows. Paid acquisition remains manually paused/bulk off; zero V3 paid queries today and zero Serper used here. V2, live PitchList, Pi/producer code and protected branches were untouched.

- **541/541 full V3 tests passed**, zero failures/skips, including native workerd/D1 and the 100-row preservation control. Runtime boundaries passed.
- **29/29 final public security/API/SEO checks passed**, no customer objects or emails created. French Free redaction passed; both producer-LOW French detail endpoints correctly returned 404.
- **101 direct source requests:** 61 French diagnostics/native checks, nine venue-canary requests including redirects, 31 expired-proof recovery requests. French cap120 and separate renewal cap160 were respected. Normal standing verification continued independently.
- **Zero destructive mutations or identity changes** across 79 original French receipts, **1,175 original facts and 63 identity tuples** in the affected cohorts. This is a bounded audit, not a fresh whole-database historical audit.

## Next priorities

1. Claude/producer: resolve the two source-verified French confidence/required-field holds with genuine fresh evidence; work the actionable pending rechecks without stale acknowledgements.
2. Codex: measure renewal/source-result volume, recovery retention, core/backoff queues and D1/R2 growth at the actual 24/48-hour points. Keep the new expiry-gap counter visible; investigate any recurrence before running another cohort.
3. Broader French conversion: prioritise additional defensible organiser/council calls from the 26 held entities. Do not build event records from directories, visitor pages or unrelated forms. Exact venue proof remains an important blocker: three vendor/parent-page canaries did not supply usable proof through the current reader, so identical replay is not a recovery strategy.

V3-031's bounded implementation/recovery checkpoint is complete. V3-020 remains active and the post-deployment measurement is V3-032. Billing stays DONE, remaining global performance follow-up stays OPEN, upcoming/Save remains DEFERRED. No automatic future agent execution or completed producer correction is claimed.
