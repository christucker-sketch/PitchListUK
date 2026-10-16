# Why READY fell by 102 — 16 October 2026

The exact retained catalogue comparison is **1,862 − 116 withdrawals + 14 additions = 1,760 READY**. The snapshots are 15 October at 07:03 London and 16 October at 08:39 London. Yesterday's later 11:15 aggregate also showed 1,862, but supplied no entity list; the per-record comparison uses the earlier retained snapshot.

| Exclusive withdrawal cause | Records | Finding |
| --- | ---: | --- |
| Failed Eventeny source rechecks | 72 | 64 unspecified fetch exceptions, six HTTP 502 and two HTTP 504 responses. Next checks were scheduled for tonight. |
| Date-boundary handling alone | 16 | 15 date-only deadlines of 16 October became midnight UTC expiries; one UK event occurring today was treated as already ended. |
| Changed, inconsistent or insufficient source proof | 25 | 16 unproved open routes, five changed titles/edition names, three deadline disagreements and one platform-index/parent-binding problem. |
| Closure or cancellation signals | 3 | One cancellation/postponement, one source-closed application with a passed deadline, one producer-selected closure. |
| **Total withdrawn** | **116** | **14 additions offset these to a net loss of 102.** |

Gross country movement: US −114/+11 (net −103), GB −1/+1 (net zero), NZ −1/+2 (net +1). All 116 withdrawn entity IDs remain in V3, with latest proof/readiness revisions matching their entity revisions. This was a read-only trace, not another full-corpus preservation audit.

## Failed renewals are being treated as completed work

All 72 failed renewals previously had Eventeny proof. For 52, the previous positive proof was still within its TTL at the failed attempt; 20 previous proofs had expired. A failed fetch becomes the latest unverified proof. Processing completes normally, and WATCH schedules the next check roughly 24 hours later. Those 72 checks are due between **00:45 and 01:54 London on 17 October**.

Clear queues therefore concealed the commercial failure: completed processing does not mean successful verification. The source-fetch catch discards the underlying exception for 64 failures, so this audit cannot distinguish origin downtime, network/timeout or execution faults for those cases. The eight HTTP 502/504 responses are separately observed. No evidence here establishes that storage or yesterday's customer-language deployment caused them.

Three bounded retries through the deployed source-fetch path now returned HTTP 200 and **all three passed the source verifier**. One also has today's date-only deadline, so it still encounters the separate date policy. This proves recovery potential in the sample, not that all 72 can be restored.

## Date-only values are receiving unsupported midnight precision

Without a source closing instant, the store caps proof expiry at `application_deadline + T00:00:00Z`. The verifier itself can accept an explicitly open route on that deadline date. A newly fetched page can therefore pass verification yet receive an already-expired proof. Separately, eligibility parses a date-only event end as a timestamp, making today's event look past its end at the start of the day.

There are **32 deadline-today cases**, overlapping the table: 15 are solely date-held; 17 also have independent source/state/deadline disagreements and are included in the 25 source-proof holds. Do not add 32 to the table or assume all 32 can safely be promoted.

A fourth direct-source check sampled one of the 15 solely date-held records. It returned HTTP 200, explicitly says OPEN_NOW and passes verification on 16 October. That supports premature withholding in the sample; it does not establish a closing time or lift any other hold.

## Repair priority

1. Add short bounded retries for transport/502/504 failures, with backoff, domain caps and Retry-After handling. Separate failed attempts from active proof. Retain earlier positive proof only within its original TTL and identity/closure safeguards; never extend it to hide failure.
2. Preserve date precision consistently across verification, eligibility and customer projection. Use source-supported closing instants; date-only values must not silently become exact UTC-midnight closing times. Contradictory records stay withheld.
3. Recheck the affected cohort through the append-only evidence path, measure actual recovered READY and alert on failed renewals/READY loss even when queues are clear. Handle title/date/edition disagreements explicitly.

The immediate repair population is 72 fetch failures plus 16 solely date-held records: **88 is a review scope, not a promised READY gain**. The 25 proof holds and three closure signals need separate evidence decisions.

This audit performed four direct source requests, zero Serper queries, zero source writes, zero native promotions, zero deployments and no Pi/V2 changes. Publication, billing, source and paid controls were unchanged. The repair is tracked as V3-025; this report does not claim it is implemented or deployed.

[Aggregate evidence](../operations/findpitches-v3/reports/ready-withdrawals-2026-10-16.json). Per-ID/source traces remain private; the report records snapshot hashes.
