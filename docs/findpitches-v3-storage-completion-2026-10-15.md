# V3 storage capacity restored — 15 October 2026

Verified **07:22 Europe/London**. V3-021 is complete. The source/evidence D1 database fell from **9.663 GB to 3.722 GB**, reclaiming **5.941 GB** during concurrent normal operation. It now has **6.278 GB / 62.78% free** against the conservative 10 GB budget. [Machine-readable completion evidence](../operations/findpitches-v3/reports/storage-completion-2026-10-15.json).

## What filled D1

The initial 61-table profile measured 9.627 GB. These are logical text/blob bytes as a share of the physical file, not per-table physical allocations.

| Table | Logical bytes | Decimal GB | Share of original file |
| --- | ---: | ---: | ---: |
| source_documents | 7,910,570,089 | 7.911 | 82.17% |
| source_facts | 476,123,592 | 0.476 | 4.95% |
| producer_records | 272,049,193 | 0.272 | 2.83% |

The largest columns were document_json (7.904 GB), source-fact evidence_json (0.236 GB) and provenance_json (0.185 GB), verification report_json (0.164 GB), and producer raw_json (0.154 GB) / normalized_json (0.112 GB). Native D1 does not expose dbstat/page/freelist/auto-vacuum pragmas; the remaining file overhead cannot be truthfully attributed to individual indexes. [Complete row/column/index report](../operations/findpitches-v3/reports/storage-profile-2026-10-14.json) · [published pre-migration plan](findpitches-v3-storage-plan-2026-10-14.md).

## Hot D1 and cold private R2

**30,497 historical/discovery documents**, retaining **6,212,304,937 exact original serialized bytes**, now use the private V3-owned R2 bucket `findpitches-v3-evidence`, bound to all eight source Workers as `V3_EVIDENCE_BUCKET`. Managed public access is disabled; there are no public custom domains. Historical selection used cutoff `2026-10-14T14:48:57.154Z` and excluded latest proof bodies. The initial latest-proof cohort was 7,276 documents / 1.817 GB. Identities, source facts, immutable producer receipts, source clocks, proof reports, lifecycle/readiness and relational control remain in D1. The separate customer/auth/billing database is unchanged.

Each object is lossless gzip of the exact original UTF-8 serialized JSON under `source-documents/v1/<SHA256>.json.gz`. D1 retains document ID, source URL, original content hash/fetch time, archive SHA-256, original byte length, pointer metadata and immutable archive/event receipts. Existing verification/revision references still target the same document ID. Copy, read and verify happen before each narrow storage transition; a separate read/hash check follows it. Readers validate exact bytes, hash and source clocks and fail closed for missing/corrupt/mismatched objects. There is no archive overwrite/delete endpoint or evidence expiry policy. New body writes use the same verified archive path; ten actual forward proof documents were confirmed R2-backed.

## Reclaim, rollback and faults

D1 physically reclaimed space automatically after the bounded verified representation changes. No full export, unsupported VACUUM, database rebuild/swap, infrastructure deletion or traffic cutover was needed. The published historical-only projection was 3.56–4.1 GB; the actual figure above is authoritative.

The representative native canary covered 20 documents/four source families: 20 matching byte hashes, four idempotent replays and one exact-original-byte restore. Final R2 retrieval/replay sampled 20 archived documents with no rewrites. An existing archived coordinate-cache replay also passed with zero provider requests. A separate pin loss had no current exact-address cache match; one bounded free Census GET restored it, with no Serper usage. Rollback restores exact verified serialized bytes through the bounded private restore route before any reader-code rollback; keep archive objects and receipts. A large rollback cohort must fit the available D1 capacity.

Three opaque native runtime failures stopped the operator automatically. Failed groups passed subsequent bounded sequential verification; the final envelope was reduced to eight documents/request and two concurrent requests. The provider fault's exact cause remains unattributed. Durable receipts make partial completion resumable; final archive counts come from native active receipts, not potentially interrupted operator counters. No integrity failure was observed. A separate inspection found remaining inline-only map-cache and reviewed-identity readers; archiving paused while these were corrected, regression-tested and redeployed across source Workers. Catalogue settlement/adoption also now verifies archived source bytes. Proof replay retains original clocks; expiry/revision changes and missing archive evidence remain guarded.

## Verification and service safety

- Full V3 suite **422/422**; focused custody/capacity nine and reader compatibility 64; standalone frontend three; independence 87 files, build and runtime-boundary checks passed.
- Final public-origin API/security/SEO checks **29/29** passed with existing LIVE Checkout enabled. No emails, Stripe customer/subscription objects or real charges were created. The customer Worker, routes, DNS, secrets and billing settings were unchanged by this storage work.
- Final fixed-corpus audit compared **25,230 original producer receipts, 218,939 source facts and 7,280 identity tuples**: destructive mutations **0**, identity drift **0**, original-build source mutations **0**.
- Current eligible mapped opportunities retain their pins after 22 exact-query cached reattachments with zero provider requests; withdrawn/expired opportunities are counted separately. Common retained customer facts changed **1** through demonstrably newer source proof (location literal formatting); archival-caused customer-fact changes **0**. Current source proof remains authoritative. READY was 1,887 at the canary and is **1,862** at completion; 37 withdrawals and 12 additions are separately classified in the evidence report. The 37 holds are 30 expired/revision-changed proofs, two source HTTP 503 responses, four selected-field/proof disagreements and one cancellation/postponement. Archival grants no READY and extends no proof clock.
- Source customer/publication rows **0/0**; source publication off and API denied. Public FindPitches browsing/LIVE Checkout are the separately authorized customer runtime.
- V3 paid queries today **0** / lifetime **29**; commercial manual pause on, bulk off, existing budgets intact. PitchList deployment and V2 schedules remain unchanged.
- Active core job groups **0**, stale leases **0**. Producer rechecks/contact/freshness are reported separately in the machine evidence; an authenticated poll does not mean the host completed every discovery/recheck task.

| READY country | Opportunities |
| --- | ---: |
| US | 1,693 |
| NZ | 4 |
| GB | 160 |
| AU | 4 |
| CA | 1 |

## Permanent capacity protection and runway

`/status` and the private `/storage/status` report native file size, remaining bytes, growth observations, archive counts and warning state. All eight source Workers have the guard and verified forward archival enabled. Warnings occur at **70%, 80%, 90%**; new source growth pauses at **97% / 9.7 GB**, leaving 300 MB before the conservative cap. Unknown capacity also fails closed. Producers receive retryable HTTP 503 with `Retry-After: 900`; reads, recheck acknowledgements, private archive controls and the separate customer/auth/billing runtime remain available. Guards apply before new ingest/acquisition/proof growth, not after accepting a falsely acknowledged receipt.

Quarter-hour capacity samples are retained. V3-022 records the required follow-up on hot-data growth. While the historical operator was paused overnight for 12.5 hours, native D1 grew by 190.9 MB, equivalent to 366.5 MB/day over that short window. At that rate the current headroom is approximately 17.1 days. This is a provisional burst-sensitive extrapolation, not a guarantee. Logical hot-data growth since the initial profile is separately broken down in the machine report; source facts are the largest contributor. Keep post-tiering growth monitoring a near-term engineering priority before unconstrained expansion. Negative observations during this migration are labelled net reclaim; they cannot establish a steady-state growth forecast. Measure the post-tiering slope over the next 24–72 hours. Bulky future document growth is now directed to R2.

The normalized/control/proof working set fits the current D1 after tiering, so country sharding is unnecessary now. Keep the independent customer database; revisit evidence/report ownership shards only if measured hot-data growth justifies them.

## Team handoff

**V3-021 storage headroom gate is cleared.** Claude can proceed with the existing bounded `011l` France shadow-delivery rollout after its own classifier/install checks; Codex has not enabled `fr-on` or claimed a new French delivery. FR records held on the Pi and the route-candidate switch remain under Claude's ownership. Current real FR READY is 0.

Next Codex priority is V3-020: source-bound French organiser/council HTML and supporting-document/PDF proof. Paid acquisition, alerts, legacy/customer migration, final Free/Pro policy and genuine owned LIVE billing acceptance retain their existing separate gates.
