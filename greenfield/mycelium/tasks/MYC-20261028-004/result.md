1. **SQL delta**

Turn 2’s assessment DDL is absent; this reconstructs the agreed structure rather than claiming an exact patch.

```sql
SET search_path = mycelium_memory, public;

CREATE TABLE assessments (
  id uuid PRIMARY KEY,
  node_id uuid REFERENCES nodes(id),
  edge_id uuid REFERENCES edges(id),
  assessor text NOT NULL CHECK (btrim(assessor)<>''),
  relation text NOT NULL CHECK (btrim(relation)<>''),
  basis_id uuid NOT NULL REFERENCES nodes(id),
  independence_key text NOT NULL CHECK (btrim(independence_key)<>''),
  supersedes uuid REFERENCES assessments(id),
  valid_from timestamptz,
  valid_to timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(node_id,edge_id)=1),
  CHECK (valid_to IS NULL OR valid_from IS NULL
         OR valid_to>valid_from)
);
CREATE UNIQUE INDEX ON assessments(supersedes)
  WHERE supersedes IS NOT NULL;
CREATE INDEX ON assessments(node_id,assessor)
  WHERE node_id IS NOT NULL;
CREATE INDEX ON assessments(edge_id,assessor)
  WHERE edge_id IS NOT NULL;
CREATE INDEX ON assessments(basis_id);
REVOKE ALL ON assessments FROM PUBLIC;
```

Required implementation: reject UPDATE/DELETE on all memory tables through triggers; runtime SELECT/INSERT only, separate migration owner. Supersession must retain subject/assessor and reject self-reference/cycles. The unique index alone prevents successor forks, **not multiple independent heads**. Preserve existing grants/revocations.

2. **Point dispositions**

- C1 Claude: accepted; Codex refinement puts many-parent lineage in edges.
- C2 Claude: accepted assessments; Codex prompted integrity/correlation refinements.
- C3 Claude: accepted immutable lifecycle; later reconciliation handles concurrency.
- C4 Claude: changed after Codex challenge: four explicit predicates before indexes.
- C5 Claude: accepted asserted validity separate from recording time.
- C6 Claude: withdrew access logs/body replacement following Codex storage critique; archive later.
- C7 Claude: independent rediscoveries plus `same_as`; hash indexing deferred.
- C8 Claude: embeddings deferred.
- C9 Claude: frontier deferred; absence proves nothing.
- C10 Claude: accepted Codex pagination, traversal bounds and retry checks.
- X1 Codex: accepted; Claude added mutation triggers as defence in depth.
- X2 Codex: accepted read-time derivation/storage admission; Claude supplied declared correlation keys.

3. **Trade-offs for Chris**

No decision blocks implementation. Later: archive guarantees and budget headroom; trusted assessor/source identity versus declared independence; concurrent assessment-head reconciliation. Timestamp/UUID ordering provides deterministic presentation, not causal truth. Admission throttles growth by capacity, never topic.

4. **Offline PGlite scenarios**

1. Branch, merge, cross-link and cycle; bounded traversal/pagination.
2. Assess nodes/edges; reject zero/two subjects and dangling references.
3. Supersession: forks, subject changes, cycles, concurrent heads.
4. Correlated evidence counts once; independent rediscoveries persist.
5. Asserted validity versus recording time.
6. Four revisit predicates, cancellation and concurrent firing.
7. Runtime mutation denial; identical/conflicting UUID retries.
8. Budget throttling preserves history and topic diversity.