# Post-tiering storage growth — 16 October 2026

The first measured **24.5-hour** post-tiering window grew **239.44 MB**, approximately **234.55 MB/day**. D1 was **3.963 GB / 39.63%** used at 10:16 London, leaving 6.037 GB. Current state is normal, with 70/80/90/97% safeguards retained. This is bounded headroom, not sustainable unrestricted growth. 48/72-hour observations are not yet available.

[Repeatable read-only report](../operations/findpitches-v3/storage-growth-report.mjs) · [Measured evidence](../operations/findpitches-v3/reports/storage-growth-2026-10-16.json).

## Actual window and planning limits

99 samples run from 15 October 09:45 to 16 October 10:15 London. No large reclaim occurs inside this interval. At exactly this sampled rate, the 70% warning is about 12.95 days away and 97% protective stop 24.46 days away. These are linear scenarios; producer volume, source-body sizes, retention and reclaim can change them. The current native size and sampled window have separate observation times. The 10 GB single-database cap remains fixed.

## Hot growth and cause

Logical payload since 15 October 07:10 London increased 74.31 MB in source facts, 25.68 MB in proof receipts, 24.98 MB in producer receipts and 8.90 MB in jobs. These deltas include a different interval from the physical 24.5h window and do not attribute physical B-tree/index growth.

Current source facts contain 293.85 MB of evidence JSON and 250.77 MB of provenance JSON: 544.62 MB, about 88.3% of their 616.58 MB logical payload. Producer raw/normalised JSON contributes 313.95 MB; proof reports 207.88 MB; job payload/deduplication keys 31.75 MB. Source-document JSON remains 1.731 GB, including historical representations and current inline originals; it is not all new growth. No originals were discarded or weakened to reduce these totals.

## Sustainable storage priorities

1. **Share new immutable evidence/provenance objects across a receipt’s field facts.** Preserve exact bytes in hash-addressed private R2 and retain typed indexed fact values, authority, source URL, source clock, receipt relationship and an immutable evidence reference in D1. Historical facts remain unchanged. Reader compatibility, original digest checks, missing/corrupt-object failure and replay/identity tests must precede enabling a versioned writer. 544.62 MB is current duplicated payload, not a guaranteed saving or permission to rewrite it.
2. **Tier older receipt/proof bodies using the same verified-original custody.** Keep current indexed/read-model projections available and all original clocks. Inventory/identity/readiness rules and source negative evidence must not depend on fetching an unbound wrapper or a silently shortened quote. Existing JSON SQL readers must be migrated explicitly before any payload-format change.
3. **Separate durable job outcomes from hot queue pointers.** Retain idempotency, retry, exact acknowledgement and audit history. Do not remove current/future/leased jobs or dedupe keys while replay can depend on them. Define an evidenced retention horizon first.
4. **Measure 48/72h before setting an expansion ceiling.** Repeat this report after 17 October 09:45 London and 18 October 09:45 London against the same post-tiering anchor, using the prior output as the logical baseline. Quarter-hour native samples continue automatically when source mutations are admitted. Missing observations must remain labelled missing.

The linked-report tool executes only SELECT/PRAGMA against the owned source D1, exports aggregate counts/byte sizes only and never changes customer/auth/billing data. Pass secure credential/state paths, an explicit `--since`, an `--output` path and optionally a previous report with `--baseline`.

## Delivered small custody repair

A 2.389 MB scanned council PDF cannot compress below the old 1 MB inline D1 threshold. Archive-enabled writers now send the bounded exact original straight to verified private R2, while retaining the 4 MiB serialized-original cap. The real 3.284 MB multi-document bundle round-tripped exactly as a 2.395 MB compressed object and 596-byte D1 pointer. Existing inline/gzip/R2 representations remain readable; no existing evidence or infrastructure was deleted or rewritten. Archive-disabled paths retain the previous safe limits.

V3-022’s initial measurement/profile/design checkpoint is complete. 48/72-hour monitoring and implementation of shared new fact evidence remain follow-ups. No claim of completed 72h soak, permanent storage resolution, customer deployment, Pi change or paid enablement is made.
