# Producer lifecycle observations and conflict repair

`NEW`, `UPDATED` and `UNCHANGED` describe producer observations and delivery
history. They do not by themselves assert a change in commercial availability.
Every receipt and source fact is retained immutably. Once a lifecycle selection
exists, a differing informational observation is audited as corroboration without
replacing that selection, creating a conflict or changing the entity revision.
Identical higher-authority evidence still follows ordinary corroboration rules.

`CLOSED`, `WITHDRAWN`, `REOPENED` and `STATE_CHANGED` retain the existing explicit,
newer-evidence rules. An informational observation cannot reopen a withdrawn
opportunity. Application state, dates, organiser, location and identity remain
independently checked; calling a delivery `UPDATED` cannot resolve their conflicts.
Fresh source-check timestamps must describe actual source checks.

The defect discovered on 9 October treated normal lifecycle bookkeeping as an
equal-authority factual disagreement. It put 170 previously READY entities into
unnecessary conflict holds after the Pi started delivering updates. This was a
V3 integration defect; original evidence was not deleted or rewritten.

The operator-only `/lifecycle/repair` route on the reconcile shadow Worker resolves
only existing `lifecycle_state` / `equal_authority_disagreement` conflicts whose
incoming independent-producer fact and normalized receipt both prove one of the
three informational values. Normal identity custody, shadow scope, the preservation
gate, paid pause, publication isolation and backlog limits are required. Each
resolution records the source receipt hash, incoming/selected fact IDs, values,
policy and timestamp in the append-only `lifecycle_observation_resolutions` ledger.

No source fact or selected lifecycle value is rewritten. Actual state conflicts,
field conflicts and ambiguous identity decisions remain unresolved. Resolving the
bookkeeping hold does not set READY or extend proof freshness. A distinct repair
token propagates through normal eligibility, enrichment and readiness jobs so an
earlier completed job cannot suppress the recheck. Expired or revision-changed
proof requires a direct source fetch through the existing verifier.

The bounded operator runner repairs at most 250 entities, prioritises a supplied
previous READY snapshot and waits for ordinary leased stages in small batches:

```bash
node operations/findpitches-v3/lifecycle-repair.mjs \
  --credentials /secure/cloudflare.env \
  --state-dir /secure/v3-shadow \
  --out-dir /secure/lifecycle-repair \
  --maximum 250 \
  --priority-baseline /secure/previous-ready-snapshot.json
```

Receipts, immutable facts and entity identity are checked against the retained
baseline. Raw snapshots and operator receipts stay outside Git. The runner cannot
enable paid acquisition, customer publication or production cutover. Remaining
expiry, application-proof or factual holds must be addressed with real evidence;
they are never cleared to restore a headline inventory count.
