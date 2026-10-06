# V3 shadow validation — 6 October 2026

Implementation branch: `findpitches-v3/greenfield`. Publication, customer cutover and paid city acquisition are disabled. Existing tracked V1/V2 application files are unchanged.

The current recovery and Serper safeguards are documented in the final validation section below. The earlier sections preserve the initial validation snapshots.

## Initial checks

| Check | Result |
| --- | --- |
| V3 tests | Full 38-test suite passed, including workerd/D1 and both 100-row controls. Additional receipt/coverage regressions and the relevant focused client/comparison/canary checks passed after the final changes. |
| Early 100-row woodchipper control | 100 real structured records; 100 entities; zero destructive raw/fact/selected-field mutations. |
| Native workerd/D1 control | Same real 100, all migrations, adverse proposals, readiness and replay passed; zero mutations/customer/publication rows. |
| Replay | 100 duplicate receipts; zero inserted records and zero new entities. |
| Historical failure example | Eventeny vendor route `id=52126` retained exactly. |
| Native Queues | Delivery completed reconciliation → eligibility → enrichment → readiness; authenticated shadow API returned the resulting shadow record. |
| SQL safety | Destructive edits, replacement bypasses, weaker selected facts, cross-scope links, test customer projection and publication writes rejected. |
| Job behavior | Atomic claim, expired lease recovery, stale owner rejection, heartbeat, bounded dead-letter attempts, explicit requeue and time-based watch closure passed. |
| City producer | Recorded Serper results only; disabled/gate/budget checks, UNKNOWN state, authority 50 and uncertain billing retry protection passed. No paid requests. |
| Worker bundles | All eight role configs passed Wrangler 4.127.1 dry-run deployment. |
| Boundaries | Runtime imports stay inside V3; D1/queues are V3-only; no live routes or publication queue binding; acquisition disabled by default. |
| Fixture provenance | All 100 reconstructed export records matched every field in the pinned reference artifact, verified offline in an in-memory reference database. |
| Provisioning guard | Unknown existing resources blocked before writes; new-only manifest/config generation and resumption passed. Remote mutation was restricted to the newly created V3 resources. |

The native D1 test exposed trigger-inclusive change totals. Selection and readiness concurrency checks now verify SQL RETURNING rows rather than assuming a change count of one. The native test subsequently passed. Its roughly 136-second local runtime includes interprocess D1 emulation and test startup; it is not a production throughput measurement.

## Preserved evidence and comparison

The [control report](../operations/findpitches-v3/reports/structured-control-2026-10-06.json) and [comparison report](../operations/findpitches-v3/reports/comparison-2026-10-06.json) preserve the local results. At the recorded evaluation time, all 1,106 provided source fields survived exactly. Eligibility was 95 eligible and 5 closed; readiness was 64 ready and 36 blocked. Readiness depends on supplied organiser/location evidence and event timing; zero mutations does not mean every record is ready.

The sample is reconstructed from 100 retained IDs in the immutable 1,599-record artifact, SHA-256 `836eac33e65d3951acb422d2e4b1579f97b12fa74a12d1498a7dd96285cd501f`, at Git ref `d111f9493300b3f4b94075cca46f99583fa8f7b9`. Input hash: `339cb4e72897b3c09d3851d6bafb9fb5db6ec9217005147c05a00ae40c22260d`. The exact historical pilot subset/after-snapshot was unavailable. The control reproduces its destructive-field failure categories on real source data.

The earlier substitute-sample comparison lacks equivalent V2 output and gold, so its archived report keeps comparability false and unavailable metrics null. A later SELECT-only capture recovered the actual historical pilot for a separate aligned evaluation described below. Provider/infra costs and independent truth remain unavailable; no overall yield/cost superiority is claimed.

## Deployed validation

The user published the environment policy and authorized remote provisioning. Cloudflare token verification and inventory succeeded. A new D1 database, eight new queues and eight shadow Workers were created; the initial 81-command schema migration applied successfully. Every Worker has only the new V3 D1 binding, and all six stage consumers have the expected V3 script, three transport retries and the new dead-letter queue. At this initial snapshot, the publication queue had zero producers/consumers; city acquisition was disabled with a zero daily budget. See the [initial live resource audit](../operations/findpitches-v3/reports/remote-resource-audit-2026-10-06.json).

The [deployed control](../operations/findpitches-v3/reports/remote-control-2026-10-06.json) passed all 100 real records through the pipeline and adverse extraction proposals, with zero destructive mutations, zero customer/publication rows and 100 duplicate receipts on replay. A [final control](../operations/findpitches-v3/reports/remote-final-control-2026-10-06.json) after the follow-up work again passed. The [deployed comparison](../operations/findpitches-v3/reports/remote-comparison-2026-10-06.json) retained all 1,106 source fields and matched the 64 ready / 36 blocked local result.

All [18 remote operational checks](../operations/findpitches-v3/reports/remote-operations-2026-10-06.json) passed: authentication, role boundaries, publication refusal, disabled city acquisition, immutable evidence no-op guards, atomic claims, heartbeat, stale-owner rejection, lease expiry, dead-letter/requeue and bounded failure. Two clearly named acquisition-stage diagnostic jobs were retained and completed after the probes. They made zero provider requests and are not acquired opportunities.

The standalone producer client delivered the full 100-record fixture to the real ingest API in a count/byte-bounded request: 100 accepted, zero rejected, zero inserted and 100 duplicates. Its unit tests cover uncertain delivery/replay, byte limits, checkpoint resume, wrong scope and stale recheck acknowledgment.

One unchanged real source record was then delivered in **shadow** scope as a [producer roundtrip canary](../operations/findpitches-v3/reports/producer-roundtrip-2026-10-06.json). It reached readiness automatically in about 28 seconds without core-stage operator ticks, appeared in the authenticated shadow API with promotion/publication false, and preserved every source field. The watch probe returned its original producer ID; both client and deployed ingest API refused to acknowledge the request using stale evidence. This demonstrates delivery/recheck transport, not a new source crawl. Its request remains pending fresh producer evidence. At that transport-validation point the database contained 100 test entities and one separate shadow canary, with zero customer/publication rows.

## Delivery and acquisition follow-up

The [continuous delivery runner](findpitches-v3-continuous-delivery.md) supports the supplied Windows export directory and a 15-minute push cadence, using only the ingest token. Its Windows installer/service template are ready; this Linux workspace cannot register a task on the producer's Windows host. A test-scope two-cycle probe verifies deployed duplicate replay and unchanged-file checkpointing. It is not continuous fresh acquisition.

The [aligned historical evaluation](findpitches-v3-comparison.md) uses the actual 100 pilot IDs at `2026-10-05T19:36:44.000Z`, verified against immutable source revisions. V2 retained 12/100 titles, 4/90 supplied organisers and 7/100 application URLs. V3 retained all 1,250 provided source fields, produced 80 ready/20 blocked and replayed 100 duplicates with zero new entities. The actual pilot also passes zero-mutation adverse proposals. V2's other historical fields/readiness/replay/cost stay unavailable; independently labelled false rejection and field truth are not fabricated.

The [live city canary](../operations/findpitches-v3/reports/live-city-canary-2026-10-06.json) completed exactly one Serper query and accepted all 10 returned results. Every record reconciled to a new shadow entity and WATCH readiness. The [source evidence audit](../operations/findpitches-v3/reports/live-city-evidence-2026-10-06.json) verified immutable raw content hashes, snippet authority 50 and all 70 provided selected fields unchanged; application state remains UNKNOWN. The temporary run grant was revoked, and the [post-canary resource audit](../operations/findpitches-v3/reports/post-city-resource-audit-2026-10-06.json) confirms bulk enablement false, the then-zero budget and no active grant. The [post-canary control](../operations/findpitches-v3/reports/post-city-control-2026-10-06.json) again reports zero mutations/leakage. At that snapshot D1 contained 100 test entities and 11 shadow entities, with zero customer/publication rows and stale leases.

The producer host installation and ingest-only credential transfer were subsequently confirmed by the user. The [live feed report](../operations/findpitches-v3/reports/home-pc-live-feed-2026-10-06.json) records 887 delivered producer records. The Serper credential was installed only on V3 acquisition. The one-query Austin grant remains revoked and city enablement remains false. V2 was not changed; only fixed SELECT reference queries were used for the historical comparison and recovery. Independent truth/duplicate labels and equivalent readiness/cost measurements remain prerequisites before cutover. Publication, cutover, infrastructure deletion and protected/live branch merge remain outside this phase.

## Final legacy recovery and safeguards validation

The complete 63-test suite passed with no failures or skips, including native workerd/D1 with all seven migrations, concurrent budget reservations, immutable source protections, legacy route authentication, source parsing and the 100-row replay/adverse-proposal controls. After the final API aggregate adjustment, all 17 relevant legacy/Worker tests passed again. V3 boundary verification passed.

The [recovery report](findpitches-v3-legacy-recovery-report-2026-10-06.md) covers all 34,507 opportunity-bearing V2 rows in 31,203 recovery units. All identity decisions and downstream reconciliation/eligibility/enrichment/readiness jobs completed. Scheduled future watch jobs remain available for rechecks. No recovery search used Serper.

The [preservation audit](../operations/findpitches-v3/reports/legacy-preservation-2026-10-06.json) verified every original live receipt and all 10,743 source fields across 887 independent producer records unchanged. The deployed 100-row control again passed with zero destructive mutations, customer rows or publication rows. Recovery receipt/fact verification independently reports zero mutations across 5,788 retained receipts and 38,926 source fields, including quality-held evidence.

The [source qualification audit](../operations/findpitches-v3/reports/legacy-source-qualification-2026-10-06.json) holds 148 tentative receipts without deleting evidence. All 95 entities whose selected fields still use held evidence are blocked. The [corroboration audit](../operations/findpitches-v3/reports/legacy-corroboration-2026-10-06.json) upgraded 11 selected authorities across six entities with identical values and zero source changes; no stronger unheld identical facts remain unselected. Identity holds and source holds are deduplicated in final report categories.

The [final resource audit](../operations/findpitches-v3/reports/legacy-resource-audit-2026-10-06.json) confirms eight healthy shadow Workers, the separate V3 D1, resumed stage delivery with consumer concurrency one, no publication producers/consumers and disabled paid bulk acquisition. `/status` exposes Serper telemetry and hard limits of four queries/credit units per run, 100 per rolling hour and 1,000 per London budget day, with automatic budget pauses. The [read-only usage audit](../operations/findpitches-v3/reports/serper-usage-audit-2026-10-06.json) attributes 1,504 retained V2 attempts and one earlier V3 canary query on the UTC audit day; exact billed-credit allocation remains unavailable.
