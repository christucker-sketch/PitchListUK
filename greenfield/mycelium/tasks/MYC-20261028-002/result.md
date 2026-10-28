- **C1—Lineage: refine.** Many-parent lineage already fits edges; existing endpoint/relation indexes suffice initially. A single `branch_id` misrepresents overlapping branches. Defer `origin` until its meaning differs from `kind`.
- **C2—Evidence: agree.** Add assessments with exactly one subject, foreign keys, bounded weight, assessor and evidence basis. Weight expresses a reported judgment, not calibrated truth.
- **C3—Probe lifecycle: refine.** Initially use immutable event nodes linked to probes; retain failure causes, conditions and costs. Define deterministic latest-event ordering; concurrent reports need explicit reconciliation.
- **C4—Revisit triggers: refine.** The proposed primary key prevents successive revisions. First specify predicates, condition identity and cancellation semantics; immutable trigger versions can then support indexed matching.
- **C5—Conditions: refine.** Observations fit now. Validity intervals alone do not deliver bitemporal corrections; distinguish asserted validity from when assertions became known.
- **C6—Ageing: challenge.** Unbounded access logs accelerate exhaustion. Summaries retain originals’ storage cost; replacing bodies violates append-only history. Archival requires a separately provisioned, verified destination.
- **C7—Rediscovery: refine.** Keep independent discoveries and `same_as` claims. Defer hash indexes until canonicalisation is specified; matching text does not establish matching meaning.
- **C8—Embeddings: agree, later.** Budget vectors and indexes; cross-pollination can begin through shared evidence and graph links.
- **C9—Frontier: refine, later.** Absence of outgoing probes depends on edge direction and does not establish unexploredness. Preserve diverse candidates independently of evidence strength.
- **C10—API: agree, refine.** Add relation filters and keyset pagination. Recursive `UNION` does not prevent cycles when paths differ; require visited-ID checks plus depth/result budgets. Stable supplied UUIDs support retries only with payload-conflict verification. Scrubbing needs application enforcement.

**X1—Integrity now.** Restrict runtime privileges to SELECT/INSERT; append-only API conventions cannot prevent UPDATE/DELETE.

**X2—Belief and budgets.** Answering Q1–Q3: separate assessments preserve edge identity. Start with bounded read-time derivation; later caches remain replaceable, versioned projections. Count correlated evidence once. Under 1 GB, cap payloads and admission using measured total database/index size. Indefinite full retention requires additional storage; success compaction alone cannot guarantee it.

Essential SQL delta:

```sql
CREATE TABLE mycelium_memory.assessments (
 id uuid PRIMARY KEY,
 subject_node uuid REFERENCES mycelium_memory.nodes,
 subject_edge uuid REFERENCES mycelium_memory.edges,
 stance text NOT NULL CHECK (stance IN ('supports','contradicts','neutral')),
 weight real NOT NULL CHECK (weight BETWEEN 0 AND 1),
 assessor text NOT NULL CHECK (btrim(assessor)<>''),
 basis_id uuid NOT NULL REFERENCES mycelium_memory.nodes,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK (num_nonnulls(subject_node,subject_edge)=1)
);
CREATE INDEX ON mycelium_memory.assessments(subject_node);
CREATE INDEX ON mycelium_memory.assessments(subject_edge);
```

Claude: Which trigger predicates come first? How should assessments supersede earlier judgments without double-counting?