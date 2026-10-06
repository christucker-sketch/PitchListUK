# V3 shadow validation — 6 October 2026

Implementation branch: `findpitches-v3/greenfield`. Publication, customer cutover and paid city acquisition are disabled. Existing tracked V1/V2 application files are unchanged.

## Completed checks

| Check | Result |
| --- | --- |
| V3 tests | 22 passed: 19 core/API/real-runtime tests and 3 provisioning/credential tests. |
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
| Provisioning guard | Unknown existing resources blocked before writes; new-only manifest/config generation and resumption passed. No real Cloudflare resource mutation. |

The native D1 test exposed trigger-inclusive change totals. Selection and readiness concurrency checks now verify SQL RETURNING rows rather than assuming a change count of one. The native test subsequently passed. Its roughly 136-second local runtime includes interprocess D1 emulation and test startup; it is not a production throughput measurement.

## Preserved evidence and comparison

The [control report](../operations/findpitches-v3/reports/structured-control-2026-10-06.json) and [comparison report](../operations/findpitches-v3/reports/comparison-2026-10-06.json) preserve the local results. At the recorded evaluation time, all 1,106 provided source fields survived exactly. Eligibility was 95 eligible and 5 closed; readiness was 64 ready and 36 blocked. Readiness depends on supplied organiser/location evidence and event timing; zero mutations does not mean every record is ready.

The sample is reconstructed from 100 retained IDs in the immutable 1,599-record artifact, SHA-256 `836eac33e65d3951acb422d2e4b1579f97b12fa74a12d1498a7dd96285cd501f`, at Git ref `d111f9493300b3f4b94075cca46f99583fa8f7b9`. Input hash: `339cb4e72897b3c09d3851d6bafb9fb5db6ec9217005147c05a00ae40c22260d`. The exact historical pilot subset/after-snapshot was unavailable. The control reproduces its destructive-field failure categories on real source data.

An equivalent V2 output snapshot and gold labels are unavailable. The comparison therefore marks comparability false, V2 metrics null, false rejection rate null and superiority claim null. Infra/provider dollar costs are also unavailable; the local control made zero provider queries. No V3 yield/cost superiority is claimed.

## Remaining external inputs

Cloudflare credentials were supplied, but the current environment proxy returns HTTP 403 for the Cloudflare API before authentication. Direct DNS is unavailable; the general network permission grant did not change that proxy restriction. A saved, read-back-verified environment draft adds `api.cloudflare.com`, `*.workers.dev`, and `google.serper.dev` while preserving `api.postcodes.io` and package presets. Review/save and publish that draft to activate egress. No remote provisioning or remote credential verification has occurred.

After egress activation, the guarded deployment and remote 100-row validator in the [runbook](findpitches-v3-runbook.md) can complete the separate V3 shadow deployment. Continuous acquisition additionally needs the independent producer's live export/delivery integration. An aligned V2 snapshot and labels are required for comparison before requesting cutover. Production cutover, publication, infrastructure deletion, V2 changes and protected/live branch merge remain outside this phase.
