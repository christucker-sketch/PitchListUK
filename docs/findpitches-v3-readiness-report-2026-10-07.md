# FindPitches V3 readiness report — 7 October 2026

**Remain shadow-only and keep paid acquisition disabled.** The ingestion, reconciliation, immutable-evidence and budget controls passed their checks. Practical legacy quality and the live paid pilot's ready yield do not justify a standing 250/day allowance or increasing acquisition. V2, production traffic and protected/live branches remain untouched; customer publication is disabled.

The paid pilot used the **7 October Europe/London budget day** (6 October after 23:00 UTC), following the local-midnight reset. It ran from approximately 00:00 to 00:16 BST. The architecture and original recovery accounting continue from `54aebfb9`.

## Legacy practical quality

The audit covered 120 distinct canonical entities from the historical 5,597 recovered records / 5,336 linked entities: 29 retained-evidence recoveries, 91 source re-fetch recoveries, 15 matches to existing V3 entities and 105 new entities. All eight countries and seven platform groups were represented. Selection used seeded ordering and explicit diversity quotas. **These are sample percentages, not unbiased population estimates or independently labelled human ground truth.**

| Practical judgment | Records | Sample percentage |
| --- | ---: | ---: |
| Clearly usable | 10 | 8.33% |
| Usable with minor missing fields | 8 | 6.67% |
| Questionable | 77 | 64.17% |
| Wrong/unsafe | 25 | 20.83% |

Fifteen of 29 retained-evidence samples were usable or usable with minor gaps, compared with three of 91 re-fetch samples. Existing-entity samples had eight of 15 usable/minor; new-entity samples had ten of 105. Small, deliberately diverse strata limit generalisation.

Reviews checked title, organiser, venue/location, event date, application/vendor route, state/deadline and selected-fact evidence. Titles and states were populated in all 120, but presence did not establish correctness. Organiser was missing in 94, location and start date in 90 each, application URL in 79, and deadline in 105. Recurrence or a defensible canonical vendor route sometimes supplied useful context despite an absent dedicated field.

Recurring failures included historical search-country assumptions (84 flagged), social posts used as event titles (21), directories treated as individual opportunities (nine), explicit country contradictions (eight), editorial content (three), unrelated event/application links (two), waitlists described as open availability (two), and a source date/state contradiction. Missing dates, venues, organisers and unverified availability were also common. An unrelated vendor footer link and a source-backed but contradictory date are not repaired by guessing a replacement.

Retained proofs and 133 original source/application routes were examined without Serper. Of those fresh fetches, 102 returned parsed evidence and 31 remained uncertain; parser recognition alone does not prove a useful current opportunity. The 25 wrong/unsafe sampled entities now have immutable quality holds on their selected source receipts and all 25 are verified blocked in current shadow readiness. No questionable record was overwritten, no evidence was deleted, and no source-backed field was changed. The completed recovery's 5,597 / 878 / 4,458 / 261 identity accounting remains the historical baseline; the new holds are subsequent audit dispositions.

## Continuous structured-producer health

The cloud ingestion endpoint is ready for the existing ingest-only runner, with a 900-second expected cadence and append-only contact telemetry. Unchanged checkpoint replay skipped delivery, forced server replay inserted zero receipts and created zero entities, changed evidence advanced the same test entity to CLOSED, and a genuinely new test record created a distinct entity. The deployed automatic pipeline completed these diagnostic checks in 206 seconds. Diagnostic fixtures remained in test scope.

Stale source exports acknowledged zero rechecks at both client and server, and the pending real producer request remained pending. Original raw receipts and facts stayed immutable. The original live baseline's 887 receipts / 10,743 source fields and the 100-row structured control passed again with zero destructive mutations.

**The Windows host cadence is not verified.** No authenticated host recheck polls reached the cloud during the instrumented observation window; diagnostic polls are excluded. There are 888 shadow receipts for 887 independent producer IDs. The newest source check remains 5 October 11:49:36 UTC, so freshness is explicitly flagged despite successful historical delivery. The remaining delivery dependency is the existing Windows scheduled task actually running successfully with access to its export directory and ingest-only token. Inspect its last run result and local `state/status.json`; the cloud cannot activate that PC's task. Successful transport must not clear old source rechecks.

## Controlled paid acquisition

All eight shadow Workers were deployed with the new protections and their D1/queue/route boundaries audited. Global hard limits remain **4 queries/run, 100/hour and 1,000/day**, with corresponding conservative credit limits. This explicit pilot additionally granted a fixed plan of at most 240 queries under an overall daily V3 pilot ceiling of 250. Bulk configuration and policy stayed disabled, and the previous one-shot canary grant stayed revoked. The ingest-only token was verified unable to start a paid pilot.

One two-query run at a time was admitted, with reconciliation/current readiness settling before the next run. Atomic reservations enforce both global and lower pilot limits. Grants expire, cannot reopen after stopping, and cannot rebill uncertain outcomes. Automatic stops cover poor ready/entity yield, high duplication, old/growing queues, failed paid runs, preservation failure and customer/publication leakage. Immutable receipt/fact digests were checked between settled runs.

| City | Market | Queries | Candidates | New entities | New ready | Observed credits |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Bristol | GB | 2 | 1 | 1 | 0 | 2 |
| Ottawa | CA | 2 | 3 | 3 | 0 | 2 |
| Geelong | AU | 2 | 2 | 2 | 0 | 2 |
| Norwich | GB | 2 | 1 | 1 | 0 | 2 |
| Halifax | CA | 2 | 2 | 2 | 0 | 2 |
| Hobart | AU | 2 | 1 | 1 | 0 | 2 |
| **Total** | **3 markets** | **12** | **10** | **10** | **0** | **12** |

All ten candidates are distinct producer IDs with ten immutable receipts and ten `NEW_ENTITY` identity decisions; none are pending, matched or in identity review. Candidate repetition and entity duplicate rates were both **0%**. New-entity yield was 0.833/query; ready yield was zero. Queries and observed credits per candidate were **1.2**. Queries/credits per ready opportunity are **undefined because none became ready**. Monetary cost fields remain null because the account's unit credit price is unavailable; null does not mean acquisition was free.

After the 12-query warm-up, the system automatically paused with **`poor_ready_yield`** and refused a seventh run. The 250 ceiling was an upper bound, not a spending target. The pause has not been reopened. `/status.serper` exposes per-run lane/producer, region/market, timestamps, query/credit usage, candidate/entity/usable/ready yield, duplication and cost fields; `/status.controlled_pilot` exposes the separate experiment budget, session state and stop reason. The rolling hour and London day each recorded 12 query reservations and 12 observed response credits.

Search snippets retain UNKNOWN availability and do not infer a venue from the query city. Query geography is labelled acquisition scope, not verified source country. Direct original-source checks of all ten candidate routes produced nine responses that did not establish specific trading-event evidence through the guarded parser and one HTTP 429. They used zero additional paid searches, changed zero source fields and promoted zero records. These results establish unresolved proof, not that the sources contain no real opportunities. No unsupported facts were added to inflate readiness.

## Integrity, queue health and recommendation

| Final check | Result |
| --- | ---: |
| Immutable receipts fingerprinted | 8,143 |
| Immutable source facts fingerprinted | 63,662 |
| Original legacy receipts / fields reverified against recovery evidence | 5,788 / 38,926 |
| Original live producer receipts / fields reverified | 887 / 10,743 |
| Destructive source mutations | **0** |
| Due core pipeline / acquisition jobs | **0 / 0** |
| Pending pilot identity/readiness records | **0** |
| Stale leases | **0** |
| Customer rows / publication rows / customer-eligible entities | **0 / 0 / 0** |
| Publication / continuous bulk paid acquisition | **Disabled / disabled** |

There are 6,102 future watch jobs, with the next availability at 8 October 00:00 UTC. These are scheduled follow-ups, not currently due backlog; the pilot did not demonstrate sustained high-volume capacity. Native workerd/D1, concurrency, replay, provenance, identity, budgets, automatic stops and boundary checks passed: **76/76 tests**. All eight Worker bundles and deployed resource boundaries passed inspection.

Keep paid acquisition disabled rather than adopting or increasing a 250/day standing allowance. Next useful engineering work is source-specific verification of real event identity, geography, dates/venue and current application availability, followed by independently labelled quality calibration and another explicitly bounded trial. Prioritise the independent structured producer's active delivery and fresh exports. Keep every recovered/acquired record shadow-only until practical quality is audited; no publication or production cutover is authorised by these checks.

The associated aggregate JSON reports are under `operations/findpitches-v3/reports/`. Raw source caches, private samples, working review files, complete evidence snapshots and all credentials remain outside Git.
