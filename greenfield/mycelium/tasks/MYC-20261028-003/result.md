# Claude turn 3 (C-points restated for turn 4)

**C1 lineage: accept refinement.** Lineage lives in edges (`derived_from`, `merges`); no `branch_id`, no `origin`.
**C2 evidence: accept.** Assessments table, with fixes below.
**C3 probe lifecycle: accept.** Immutable event nodes. Order by `(recorded_at, id)`; concurrent reports are reconciled by a later node.
**C4 revisit triggers: accept Codex's block.** Triggers are immutable versions, specified before indexing.
**C5 conditions: accept.** Add `valid_from/valid_to` (asserted) separate from `recorded_at` (known).
**C6 ageing: concede.** Drop access logs and body-replacing summaries. Keep only a budget guard and verified external archive, later.
**C7 rediscovery: accept.** Independent nodes plus `same_as` claims; no hash index yet.
**C8 embeddings: later.**
**C9 frontier: later.** Do not infer unexplored from missing edges.
**C10 API: accept.** Relation filters, keyset pagination, visited-ID cycle checks, depth/result caps, payload-conflict check on retried UUIDs.

## Responses to Codex
- **X1: accept, essential.** Runtime role gets SELECT/INSERT only; migrations use a separate owner role. Add triggers rejecting UPDATE/DELETE as defence in depth, since owners bypass grants.
- **X2: accept.** Read-time derivation first. "Count correlated evidence once" needs a concrete key (see fix 3). Admission control on measured `pg_database_size` is essential, because 1 GB is the hard ceiling.

## Answers to Codex's questions
**Trigger predicates, first set (minimal, indexable):**
1. `condition_changed`: a new node of a named `kind` linked to a named condition node.
2. `evidence_added`: a new assessment on the blocked subject.
3. `contradiction_added`: a `contradicts` assessment or edge against an upstream path.
4. `not_before`: a time threshold.

Defer free-form predicates, because they invite a rule engine. A trigger is an immutable node with `{predicate, target}` attributes. A `cancels` edge from a later node cancels it. Firing creates a probe node linked to the trigger; it never mutates the blocked path.

**Superseding assessments without double-counting:** add `supersedes uuid REFERENCES assessments(id)`. Current = assessments no other row supersedes, per `(subject, assessor)`. Without a rule, a supersession chain forks and counts twice.

## Weakest part of the SQL delta
The identity of an assessor and its evidence is unconstrained. `assessor` is free text, so one source can be counted many times, and `basis_id` doesn't say what is correlated. Fixes:

```sql
ALTER TABLE mycelium_memory.assessments
  ADD COLUMN supersedes uuid REFERENCES mycelium_memory.assessments(id),
  ADD COLUMN independence_key text NOT NULL CHECK (btrim(independence_key)<>'');
CREATE UNIQUE INDEX ON mycelium_memory.assessments(supersedes) WHERE supersedes IS NOT NULL;
```

The unique index permits one successor per row, which prevents forks. Derivation takes the latest per `(subject, assessor)`, then counts once per `(subject, independence_key)`. `independence_key` is a lineage root or source id the assessor declares. Smaller issues: add `FOREIGN KEY` indexes on `basis_id`, and make the two subject indexes partial (`WHERE … IS NOT NULL`) to save space.

## Changes to my turn-1 positions
Dropped: access logs, summary-based ageing, `origin`, and hash indexes. Codex's storage arithmetic was right and I conceded those. Changed: C4 is now a predicate-first design.

## New observation
Append-only is not tamper-proof, and a supersession chain is itself a mutable-looking claim. Both rely on the runtime role, so X1 and the unique index are the true integrity base. Nothing here yet limits exploratory *growth* to the budget: admission control should throttle rate (per the vision) and never reject by topic.
