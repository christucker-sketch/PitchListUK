# V3 storage profile and tiering plan — 14 October 2026

Measured physical size: **9,626,914,816 bytes (9.627 decimal GB)**. The fixed provider cap is10GB; safety controls will use a conservative10,000,000,000-byte budget.61 tables were profiled through read-only bounded scans. [Full row/column report](../operations/findpitches-v3/reports/storage-profile-2026-10-14.json).

| Consumer | Logical text/blob bytes | Share of physical file |
| --- | ---: | ---: |
| source_documents | 7,910,570,089 | 82.17% |
| source_facts | 476,123,592 | 4.95% |
| producer_records | 272,049,193 | 2.83% |

Other logical data totals approximately0.43GB, including0.171GB verification/proof rows. The difference between total measured logical bytes and file size is page/index/integer/free-page overhead, not a measured index footprint. D1 rejects native dbstat/page_count/freelist_count/auto_vacuum access; physical per-table/index attribution is unavailable. Payload scans are bounded because a whole-document-table aggregation exceeded the native query timeout. No payload/data was changed during profiling.

## Hot and cold

Keep identities, selected/source facts, lifecycle/readiness, current proof reports, jobs/control, receipt clocks/provenance and customer reads in D1. Producer receipts and facts stay untouched in this first phase. Large original document_json bodies are the first archive target. Keep latest proof bodies inline for the initial historical canary; archive older/discovery bodies only after exact current-proof exclusion. New document bodies can use the proven archive path after round-trip verification.

## Bounded tiering design

Create one private V3-owned R2 bucket with content-addressed object keys. Store the exact UTF-8 serialized source document (optionally lossless gzip), with SHA-256 and byte length; preserve original URL/content hash/source clocks, document ID and all verification/revision references in D1. GET and verify the complete object before a storage representation transition. Archived reads validate hashes/length/clock identity, decode the original format and fail closed on missing/corrupt objects. No public R2 access, object delete endpoint, TTL, producer credentials or source form submits.

The first tranche is at most20 representative historical documents, copied/verified before any D1 transition. Publish actual bytes, retrievability, proof/custody tests and rollback. D1 immutability remains absolute for source facts/receipts and identities; only a narrow, provenance-bound reversible document storage representation transition is allowed after a verified archival receipt. Original bytes remain retrievable. Restore the exact original serialized bytes before rolling back archive-aware code.

## Projection before bulk

All-document archival upper bound saves approximately7.9GB of payload less roughly16–35MB of pointers/receipts, suggesting a compact D1 around1.75–2.25GB (estimated, not measured). Historical-only savings will be measured separately before any bulk tranche; current proof bodies remain inline in the first tranche. Physical reclaim is not assumed: compare native file size after the canary. If pages do not shrink, do not run an unsupported VACUUM or assume deletion freed physical capacity; use an independently validated provider-supported rebuild method, preserving the original database until verification/rollback is proved. Native full exports make D1 unavailable while running, so no live full-export operation is authorized by this plan without maintaining the public read service.

## Capacity guard / stop-gap

Expose native file size, growth observations, provider cap, warning states70/80/90%, and a protective source-growth pause at97% (9.7GB), leaving300MB before the conservative cap. Unknown/failed capacity observations fail closed for new source growth; allow reads, private archive/restore controls, acknowledgements and separate customer/auth/billing runtime. Retain failed producer deliveries for retry; no false source-clock acknowledgement. Route new bulky evidence to R2 once proved. This stop-gap is separate from an actual physical-headroom restoration claim.

Scale only after the20-document custody/proof/public checks pass and the remaining cold-byte projection is published. V2/PitchList/customer/provider/billing/paid/publication settings remain untouched; no database/infrastructure deletion. If the normalized hot set approaches capacity later, shard evidence/document ownership separately from catalogue/control; country sharding is unnecessary while measured non-document logical data is only~1.18GB.
