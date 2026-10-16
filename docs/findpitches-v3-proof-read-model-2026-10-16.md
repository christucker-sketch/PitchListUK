# Current-proof catalogue read model — 16 October 2026

V3-029 continuation. The [first performance release](findpitches-v3-performance-2026-10-16.md) remains the baseline. This checkpoint replaces repeated proof/selection/attribution traversal with bounded disposable summaries. Customer billing code, products, keys, traffic routing and the independent producer are outside this change.

## Safety design

`customer_proof_heads` stores one compact report per entity, tied to the actual latest immutable verification sequence. A source-verification insert updates it atomically; a newer negative report replaces the derived head and the existing readiness invalidation still runs. The original report/document is never rewritten. Guard triggers reject content that does not exactly match the retained report. Address-coordinate bindings are joined live by entity revision and verification sequence because those receipts can arrive later.

`customer_selection_heads` stores current selected fields plus the contributing record IDs (including their original multiplicity). Existing immutable facts, selection audit and authority constraints remain authoritative. Selection changes refresh the summary in the same transaction. Quality holds are joined live against those selected record IDs; they are never cached. `customer_origin_heads` stores exact source membership and earliest accepted non-diagnostic origin, refreshed atomically when a receipt is linked. Source records and links remain immutable. Both summaries reject fabrication. Missing summaries use the original expressions.

Every catalogue read still evaluates current entity/readiness revision, latest verification sequence/status/version, checked/expiry clocks, selected-fact disagreements, unresolved conflicts, current quality holds, producer source-clock/arrival/ID winner, LOW/channel/export holds, application state/deadline, lifecycle and customer proof requirements. This is not a TTL cache of READY. No search query becomes source evidence; no hold or identity rule is relaxed.

The customer snapshot uses two reads: one bounded inventory query plus current structured-producer policy. The existing 20,000-item contract is enforced with a 20,001-row overflow sentinel and an error, never silent truncation. Operator pagination remains unchanged.

## Evidence recorded before switching the API

- Migration0026: 7,365 heads for7,365 verified entities;6,771,511 compact JSON bytes. One database snapshot compares1,818 cached-READY rows with zero missing/extra proof values.
- Migration0027: 7,475 selection/origin heads for7,475 entities;5,734,829 selection JSON bytes and259,271 attribution JSON bytes. One snapshot compares1,817 cached-READY rows with zero missing/extra proof, selected-field, source-attribution and hold/conflict values.
- Existing schema definitions hash-identical after each additive migration. Original evidence and identity writes by this work:0. The physical database increments were8,589,312 and8,347,648 bytes during migration windows, including concurrent activity; these are fixed steps, not daily growth. Account for them in the scheduled storage review.
- Three remote operator traces: four→two queries,237k→102k rows read; D1 duration before1.13–1.23s, after0.35–0.53s. Operator REST wall time before2.59–3.12s, after1.39–1.53s. These are not direct service-binding timings or Worker CPU.

Private `/staging/catalogue` responses now include aggregate `Server-Timing`: source read wall time, summed D1 duration, summed D1 RPC wall time, serialization and query count. Parallel sums can exceed critical-path wall time; D1 duration is not claimed as Worker CPU. No SQL, entity IDs, customer data or source evidence is emitted in the timing header or persisted by instrumentation.

Final release, public timings and test evidence are recorded below after verification. Paid acquisition and source publication remain disabled. V2 and protected PitchList remain untouched.
