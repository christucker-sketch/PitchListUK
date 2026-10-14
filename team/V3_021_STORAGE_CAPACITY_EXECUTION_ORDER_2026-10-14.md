# V3-021 — urgent storage-capacity execution order

Authority: Chris, 14 October 2026. This order is P0 because the live V3 D1 database is at approximately 9.626 GB against the provider's fixed 10 GB per-database limit. France/international scale must not continue blindly into a near-full database.

## Objective

Restore safe storage headroom without weakening evidence custody, provenance, lifecycle truth, identity integrity, customer correctness, or PitchList isolation. Do not solve the problem by deleting history first. First prove what consumes the space, then move the right cold data to the right storage tier and reclaim D1 safely.

## Required execution sequence

1. **Profile before changing anything.** Produce a table-by-table capacity report with row counts, logical payload size, index footprint where measurable, largest TEXT/JSON/blob-like columns, average/max payload sizes, and recent growth rate. Identify the top three storage consumers and quantify how much each contributes to the 9.626 GB file.
2. **Classify hot vs cold data.** Explicitly separate current relational/runtime state from immutable historical evidence. Expected cold candidates include raw source/document bodies, repeated source JSON/HTML, immutable receipt payloads, superseded historical payloads and experiment/evidence custody that is not required for low-latency customer reads.
3. **Design an evidence-preserving tiering plan.** Prefer object/archive storage for bulky immutable evidence, with D1 retaining stable keys, content hashes, source clocks, provenance, revision bindings and enough metadata to verify/retrieve the archived object. Do not weaken current proof semantics or make READY depend on unverifiable/offline state.
4. **Do not migrate blindly.** Before any bulk move, publish a measured projection: current D1 size; bytes attributable to candidate cold tables/columns; expected D1 size after migration/reclaim; projected headroom; rollback path; and any read/runtime paths affected.
5. **Implement in a bounded reversible phase.** Migrate a small representative tranche first. Verify hash equality/retrievability, current catalogue/customer outputs, proof evaluation, expiry/revision invalidation, preservation audits and rollback. No destructive source/identity rewrite.
6. **Scale the migration only after proof.** Move the remaining approved cold evidence in bounded batches. Preserve immutable custody. Keep customer/public/proof behavior unchanged. If D1 pages are not physically reclaimed automatically, use the provider-supported safe compaction/rebuild/swap method rather than risky in-place deletion.
7. **Reclaim and verify.** Re-measure physical D1 size after the safe reclaim step. Target is not merely below 10 GB; restore substantial operating headroom suitable for France and multi-country growth. Report actual post-work size and percentage free.
8. **Add permanent capacity controls.** Add telemetry/alerts for D1 file size and growth rate, plus automatic acquisition/ingest throttling well before the hard cap. Proposed warning thresholds should include at least 70%, 80%, 90% and a hard protective stop before provider exhaustion. Capacity alarms must distinguish evidence growth from normal customer/runtime writes.
9. **Plan future sharding if required.** If profiling proves the normalized hot relational working set itself is too large, do not force everything into one D1. Produce a clean sharding recommendation (for example catalogue/evidence/customer separation or country/region partitioning) with ownership and query-boundary implications.

## Acceptance evidence

The checkpoint must answer plainly:

- Which three tables/columns consumed the most space?
- How many GB and what percentage did each account for?
- What exactly was moved, where, and how is it cryptographically/provenance-bound back to D1?
- What was the D1 physical size before and after reclaim?
- What catalogue/customer/proof tests passed before and after?
- Were any source facts, fixed identities, lifecycle decisions, READY outcomes or PitchList/V2 data changed? Expected answer: no, except any separately proven ordinary freshness changes.
- What is the new safe headroom and estimated growth runway?
- What automatic capacity guard now prevents another near-cap incident?

## Operational boundaries

- V3-021 outranks lower-risk polish and routine catalogue expansion until safe headroom is restored or a separately documented stop-gap guarantees ingestion safety.
- The current bounded Pi run may finish if cloud ingestion remains healthy, but do not authorize unconstrained France/international scale into the near-full database.
- No evidence deletion merely to save space without an archived, hash-bound, retrievable replacement.
- No loss of source clocks, provenance, receipt/revision bindings or auditability.
- No customer/provider migrations, billing changes, paid acquisition, PitchList/V2 mutation or unrelated architecture work under this order.
- Keep public FindPitches and LIVE Checkout stable throughout; rollback V3-only if a storage migration affects runtime safety.

## Desired end state

D1 is the hot indexed relational/control layer. Bulky immutable evidence lives in durable object/archive storage with verifiable pointers/hashes in D1. France and later country packs can scale without repeatedly approaching a 10 GB single-database ceiling.
