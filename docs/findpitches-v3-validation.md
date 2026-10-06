# V3 shadow validation — 6 October 2026

Implementation branch: `findpitches-v3/greenfield`. Publication, customer cutover and paid city acquisition are disabled. Existing tracked V1/V2 application files are unchanged.

## Completed checks

| Check | Result |
| --- | --- |
| V3 tests | 26 passed after producer delivery and recheck freshness work, including the real workerd/D1 control. |
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

An equivalent V2 output snapshot and gold labels are unavailable. The comparison therefore marks comparability false, V2 metrics null, false rejection rate null and superiority claim null. Infra/provider dollar costs are also unavailable; the local control made zero provider queries. No V3 yield/cost superiority is claimed.

## Deployed validation

The user published the environment policy and authorized remote provisioning. Cloudflare token verification and inventory succeeded. A new D1 database, eight new queues and eight shadow Workers were created; the 81-command schema migration applied successfully. Every Worker has only the new V3 D1 binding, and all six stage consumers have the expected V3 script, three transport retries and the new dead-letter queue. The publication queue has zero producers/consumers; city acquisition is disabled with a zero daily budget. See the [live resource audit](../operations/findpitches-v3/reports/remote-resource-audit-2026-10-06.json).

The [deployed control](../operations/findpitches-v3/reports/remote-control-2026-10-06.json) passed all 100 real records through the pipeline and adverse extraction proposals, with zero destructive mutations, zero customer/publication rows and 100 duplicate receipts on replay. A [final control](../operations/findpitches-v3/reports/remote-final-control-2026-10-06.json) after the follow-up work again passed. The [deployed comparison](../operations/findpitches-v3/reports/remote-comparison-2026-10-06.json) retained all 1,106 source fields and matched the 64 ready / 36 blocked local result.

All [18 remote operational checks](../operations/findpitches-v3/reports/remote-operations-2026-10-06.json) passed: authentication, role boundaries, publication refusal, disabled city acquisition, immutable evidence no-op guards, atomic claims, heartbeat, stale-owner rejection, lease expiry, dead-letter/requeue and bounded failure. Two clearly named acquisition-stage diagnostic jobs were retained and completed after the probes. They made zero provider requests and are not acquired opportunities.

The standalone producer client delivered the full 100-record fixture to the real ingest API in a count/byte-bounded request: 100 accepted, zero rejected, zero inserted and 100 duplicates. Its unit tests cover uncertain delivery/replay, byte limits, checkpoint resume, wrong scope and stale recheck acknowledgment.

One unchanged real source record was then delivered in **shadow** scope as a [producer roundtrip canary](../operations/findpitches-v3/reports/producer-roundtrip-2026-10-06.json). It reached readiness automatically in about 28 seconds without core-stage operator ticks, appeared in the authenticated shadow API with promotion/publication false, and preserved every source field. The watch probe returned its original producer ID; both client and deployed ingest API refused to acknowledge the request using stale evidence. This demonstrates delivery/recheck transport, not a new source crawl. Its request remains pending fresh producer evidence. The database therefore contains the 100 test entities and one separate shadow canary, with zero customer/publication rows.

## Remaining external inputs

Continuous acquisition needs the independent producer's current export location and cadence. A live bounded Austin search canary needs a securely supplied Serper credential; no paid query has been run. An aligned V2 snapshot and labels are required for comparison before requesting cutover. V2 was not modified or queried during remote provisioning/validation. Production cutover, publication, infrastructure deletion and protected/live branch merge remain outside this phase.
