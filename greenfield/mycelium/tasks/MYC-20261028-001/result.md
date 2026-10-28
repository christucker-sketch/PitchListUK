# Claude turn 1: gaps in nodes/edges for a growing network

The current schema is a sound append-only substrate. Its weakness is that everything that makes the vision *grow* lives in untyped JSON, so the network can't query, weigh, or revisit anything.

**C1. Lineage and branch identity (essential-now).** Spawn-from, merge, and "why this branch exists" are only implicit in edges. Many-parent merges and rediscovery need first-class treatment.
```sql
ALTER TABLE nodes ADD COLUMN branch_id uuid, ADD COLUMN origin text; -- observation|hypothesis|probe|merge
-- lineage = edges with relation in ('spawned_from','merged_from','rediscovered_as'); partial index on those
CREATE INDEX edges_lineage_idx ON edges(target_id) WHERE relation IN ('spawned_from','merged_from');
```

**C2. Evidence as weighted, revisable stance (essential-now).** Edges carry no strength, polarity, or confidence. Reinforce/contradict are just strings. Append-only means belief must be *derived*, not stored in place.
```sql
CREATE TABLE assessments(id uuid PK, subject_node uuid, subject_edge uuid, -- one is null
  stance text CHECK (stance IN ('supports','contradicts','neutral')),
  weight real, assessor text, basis_id uuid REFERENCES nodes, recorded_at timestamptz);
```
Contradicting a *link* needs `subject_edge`; today edges can't be targets.

**C3. Probe lifecycle and failure retention (essential-now).** A probe has states (proposed, running, succeeded, failed, blocked), and failures must record *why* and *under what conditions* so they can be revisited.
```sql
CREATE TABLE probe_events(id uuid PK, probe_id uuid REFERENCES nodes, status text,
  blocked_by text, conditions jsonb, cost jsonb, recorded_at timestamptz);
```
Current state is the latest event, via a view.

**C4. Revisit triggers (essential-now).** "Revisit blocked paths when conditions change" needs a queryable condition, not prose.
```sql
CREATE TABLE revisit_when(node_id uuid, condition_key text, condition_value jsonb, PRIMARY KEY(node_id,condition_key));
```
A changed environment fact matches against these.

**C5. Environment and capacity facts (essential-now).** Resource budgets set the *rate* of exploration. Store capacity and conditions as observations (`kind='condition'`) with validity intervals (`valid_from`, `valid_until`), distinct from `observed_at`/`recorded_at`, which gives bitemporal reads.

**C6. Ageing and salience without deletion (essential-now, given 1 GB).** Add `touched_at`/`use_count` via a separate append-only `access_log`, rolled up periodically. Tiering: cold nodes get `body` compacted to a summary node linked by `summarises`; the original is archived, never deleted.

**C7. Dedup and rediscovery (essential-now).** Independent probes reach the same thing. Add `content_hash` (normalised title+body) with a non-unique index, plus `same_as` edges with a confidence, rather than merging rows.

**C8. Semantic neighbourhood (speculative).** pgvector embeddings for finding unspecified links between unrelated branches; the main engine of cross-pollination. Check Neon's extension support and storage cost first.

**C9. Frontier and diversity queries (speculative).** Materialised view of "open frontier": nodes with no outgoing probe, scored by novelty (low similarity to explored areas) × evidence. This preserves diversity instead of exploiting the top branch.

**C10. Integrity of the API (essential-now).** `connections` limits to 100 with no pagination or relation filter. It needs a recursive traversal, cycle-safe (`UNION` with a path array or depth cap), plus an idempotency key on inserts so parallel writers don't duplicate. Also a secrets-scrubbing check at write time, since provenance is free-form JSON.

## Questions for Codex
1. Should edges become nodes (reification) so that contradicting or weighing a link is uniform, or is a separate `assessments` table cleaner?
2. Is derived belief computed at read time or in a rolled-up table, and what is the append-only-safe rule for recomputation?
3. What is the cheapest storage budget model under 1 GB that retains failures in full but compacts successes?
