# V3 shadow validation — 6 October 2026

Implementation branch: `findpitches-v3/greenfield`. Publication, customer cutover and paid city acquisition are disabled. Existing tracked V1/V2 application files are unchanged.

## Completed checks

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

The user published the environment policy and authorized remote provisioning. Cloudflare token verification and inventory succeeded. A new D1 database, eight new queues and eight shadow Workers were created; the 81-command schema migration applied successfully. Every Worker has only the new V3 D1 binding, and all six stage consumers have the expected V3 script, three transport retries and the new dead-letter queue. The publication queue has zero producers/consumers; city acquisition is disabled with a zero daily budget. See the [live resource audit](../operations/findpitches-v3/reports/remote-resource-audit-2026-10-06.json).

The [deployed control](../operations/findpitches-v3/reports/remote-control-2026-10-06.json) passed all 100 real records through the pipeline and adverse extraction proposals, with zero destructive mutations, zero customer/publication rows and 100 duplicate receipts on replay. A [final control](../operations/findpitches-v3/reports/remote-final-control-2026-10-06.json) after the follow-up work again passed. The [deployed comparison](../operations/findpitches-v3/reports/remote-comparison-2026-10-06.json) retained all 1,106 source fields and matched the 64 ready / 36 blocked local result.

All [18 remote operational checks](../operations/findpitches-v3/reports/remote-operations-2026-10-06.json) passed: authentication, role boundaries, publication refusal, disabled city acquisition, immutable evidence no-op guards, atomic claims, heartbeat, stale-owner rejection, lease expiry, dead-letter/requeue and bounded failure. Two clearly named acquisition-stage diagnostic jobs were retained and completed after the probes. They made zero provider requests and are not acquired opportunities.

The standalone producer client delivered the full 100-record fixture to the real ingest API in a count/byte-bounded request: 100 accepted, zero rejected, zero inserted and 100 duplicates. Its unit tests cover uncertain delivery/replay, byte limits, checkpoint resume, wrong scope and stale recheck acknowledgment.

One unchanged real source record was then delivered in **shadow** scope as a [producer roundtrip canary](../operations/findpitches-v3/reports/producer-roundtrip-2026-10-06.json). It reached readiness automatically in about 28 seconds without core-stage operator ticks, appeared in the authenticated shadow API with promotion/publication false, and preserved every source field. The watch probe returned its original producer ID; both client and deployed ingest API refused to acknowledge the request using stale evidence. This demonstrates delivery/recheck transport, not a new source crawl. Its request remains pending fresh producer evidence. At that transport-validation point the database contained 100 test entities and one separate shadow canary, with zero customer/publication rows.

## Remaining external inputs

The [continuous delivery runner](findpitches-v3-continuous-delivery.md) supports the supplied Windows export directory and a 15-minute push cadence, using only the ingest token. Its Windows installer/service template are ready; this Linux workspace cannot register a task on the producer's Windows host. A test-scope two-cycle probe verifies deployed duplicate replay and unchanged-file checkpointing. It is not continuous fresh acquisition.

The [aligned historical evaluation](findpitches-v3-comparison.md) uses the actual 100 pilot IDs at `2026-10-05T19:36:44.000Z`, verified against immutable source revisions. V2 retained 12/100 titles, 4/90 supplied organisers and 7/100 application URLs. V3 retained all 1,250 provided source fields, produced 80 ready/20 blocked and replayed 100 duplicates with zero new entities. The actual pilot also passes zero-mutation adverse proposals. V2's other historical fields/readiness/replay/cost stay unavailable; independently labelled false rejection and field truth are not fabricated.

The [live city canary](../operations/findpitches-v3/reports/live-city-canary-2026-10-06.json) completed exactly one Serper query and accepted all 10 returned results. Every record reconciled to a new shadow entity and WATCH readiness. The [source evidence audit](../operations/findpitches-v3/reports/live-city-evidence-2026-10-06.json) verified immutable raw content hashes, snippet authority 50 and all 70 provided selected fields unchanged; application state remains UNKNOWN. The temporary run grant was revoked, and the [post-canary resource audit](../operations/findpitches-v3/reports/post-city-resource-audit-2026-10-06.json) confirms bulk enablement false, budget zero and no active grant. The [post-canary control](../operations/findpitches-v3/reports/post-city-control-2026-10-06.json) again reports zero mutations/leakage. Current D1 contains 100 test entities and 11 shadow entities, with zero customer/publication rows and stale leases.

Continuous delivery requires installing the prepared task on the producer host and securely transferring its ingest-only credential. The Serper credential was subsequently installed only on V3 acquisition. The live one-query Austin canary returned 10 results, all accepted and reconciled into WATCH readiness. Its five-minute run grant was revoked; city enablement remains false and bulk budget zero. Post-canary controls still show zero destructive mutations and customer/publication rows. V2 was not changed; only fixed SELECT reference queries were used for the later historical comparison. Independent truth/duplicate labels and equivalent readiness/cost measurements remain prerequisites before cutover. Publication, cutover, infrastructure deletion and protected/live branch merge remain outside this phase.
