# Mycelium memory schema: cloud-Claude preparatory notes (28 Oct 2026)

**Status: preparatory notes by the cloud Claude session, NOT an input to the BRIX exchange.** They were written before the [course correction](MEMORY_SCHEMA_COLLABORATION_2026-10-28.md#correction--use-the-existing-brix-cli-collaboration-runner): the design collaboration must happen between the installed Claude Code and Codex CLIs on fpd-prod, not between cloud chat sessions writing documents. This file is deliberately **left out of the CLIs' context pack** ([proposal](BRIX_MEMORY_COLLAB_RUN_PROPOSAL_2026-10-28.md)), so the CLI exchange stays independent of it. After the exchange it is used once, for comparison: which of these probes and ideas the CLIs reached, missed or improved on. The offline probes below are local PGlite (PostgreSQL 18.6) evidence only: no Neon, no remote SQL, no model call.

Subject: the memory package `greenfield/mycelium/memory/` (`db05aa5c`), under the [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md).

---

### What the current foundation gets right (keep it)

- **Open vocabulary:** nodes and directed edges with free-text `kind` and `relation`; no enum, root, parent or objective.
- **No tree assumption:** cycles, cross-links and many-parent merges are all allowed.
- **Append-only API:** corrections and failures are kept as new records.
- **JSONB** attributes and provenance; bound parameters; atomic, checksum-guarded migration.

This is the right *shape* for a growing network. Nothing below adds a taxonomy or a workflow.

### Evidence base

Codex's suite passes 2/2 locally. I added throwaway probes against the **current** schema, on the same PGlite engine (PostgreSQL **18.6**, matching the planned Neon PG 18). Nothing was committed or run remotely.

| Probe | Result on today's schema |
|---|---|
| P1: "E contradicts the claim *A supports B*" (an edge whose target is an edge) | **Rejected** (FK to nodes only). A connection can be asserted but never argued with. |
| P2: a 3-cycle walked to depth 6 with `WITH RECURSIVE … CYCLE` | Terminates, 3 distinct nodes. PG supports it, but the API has no traversal at all (`connections()` is 1 hop, capped at 100, no paging). |
| P3: "current view" after v1 → `supersedes` → v2 → `replaces` → v3 | Returns **v2 and v3**. The store cannot tell which relations *it* must act on, so stale knowledge looks current. |
| P4: find a rediscovery by content digest in `provenance` | **Sequential scan**; no indexed way to notice the network found the same thing twice. |
| P5: a 5 MB `body` (a pasted log) | **Accepted.** No size bound, on a 1 GB Free project. |
| P6: a secret pasted into a node by mistake | **No sanctioned path:** append-only, with no redact or tombstone operation. |

### Proposal — essential storage capabilities (each answers a probe and a vision need)

| # | Capability | Minimal form | Why the vision needs it |
|---|---|---|---|
| **E1** | **Relationships are first-class and can be the subject of other relationships** | A shared identity table `items(id, item_type ∈ {node, edge})`. `nodes.id` and `edges.id` reference it, and `edges.source_id/target_id` reference **items**, so edges may point at edges. FK-enforced; no polymorphic guessing. | Contradictions, counterevidence and confidence apply to *connections* as much as to things. Cross-pollination is mostly about links (P1). |
| **E2** | **Append-only signal stream** for everything that changes over time: confidence, open/blocked/exhausted, attention or visits, "conditions changed", reinforcement | `signals(id, item_id → items, signal text (open), value double precision NULL, payload jsonb, provenance jsonb, created_by, observed_at, recorded_at)`. Index `(item_id, signal, recorded_at DESC, id)`. The current value is the latest per (item, signal); ageing and decay are computed **at query time**, never stored by rewriting. | Adaptive propagation, learning and revisiting blocked paths need state that evolves **without mutating** the graph and without a status column (which would smuggle in a workflow). |
| **E3** | **A tiny set of structural relations the store itself understands**; all others stay free | Reserve `supersedes`, `retracts`, `same_as` (documented; checked only by name), plus a view `current_nodes` excluding superseded or retracted items. Synonyms such as "replaces" remain ordinary semantic relations until mapped. | "What do we currently believe?" must be answerable while history is kept (P3). Free semantics remain free; only the store's own mechanics get names. |
| **E4** | **Rediscovery fingerprint** | `fingerprint text NULL` on nodes (writer-computed digest of normalised content), with a **non-unique** partial index. | Convergent rediscovery from different branches is *evidence* (two routes to the same place), not a duplicate to suppress (P4). |
| **E5** | **Cycle-safe traversal API** | `neighbourhood(id, {depth ≤ N, relations?, direction, limit})` using `WITH RECURSIVE … CYCLE`, plus keyset paging for `connections()` (`recorded_at, id`). | Exploration works on local subgraphs; hubs with more than 100 links must not be silently truncated (P2). |
| **E6** | **Size bounds; large content by reference** | CHECKs, for example `octet_length(body) ≤ 64 KiB` and `attributes`/`provenance` ≤ 32 KiB each. Artifacts are stored as digest + location in attributes. | Protects the Free tier and keeps memory a map, not a blob store (P5). |
| **E7** | **One sanctioned redaction path** | A function that replaces `title`/`body`/`attributes` with a redaction marker, keeping id, edges, `fingerprint` and provenance digest, and appends a `redacted` signal. It is the only mutation. | The safety boundary (secrets or privacy) without deleting lineage (P6). |
| **E8** | **Queryable origin and time on every item** | `created_by text NOT NULL` (for example `claude:<run>`, `codex:<run>`, `human:chris`) and `observed_at` on edges as well as nodes. `recorded_at` (DB time) orders; `observed_at` is advisory. | Learning *across explorers* needs to know who found what; edges are observations too. |

**Migration note for Codex:** nothing is applied remotely yet. Folding these into `001` before its first apply may be simpler than a `002`. That is your call on checksum and ledger practice.

### Speculative add-ons (not proposed now; recorded so we don't lose them)

- **Valid-time ranges** (`valid_during tstzrange`): when a claim holds in the world, as distinct from when it was recorded. This becomes bitemporal reasoning about changing conditions.
- **Lexical search** (generated `tsvector` + GIN) to cross-link distant branches; **semantic search** (`pgvector`) once embeddings exist. Neither is needed for correctness.
- **Recombination events as nodes:** for example a `recombination` node with edges from its inputs and to its output. This is a *convention*, needing no schema change, and lets "which inputs were combined together" be answered.
- **The memory learns its own vocabulary:** relation and kind names described as nodes, with `same_as` between synonyms (for example "replaces" ≡ `supersedes`).
- **DB-enforced append-only** (privileges or triggers for the future least-privilege role); materialised frontier views; archival or export under storage pressure (never silent deletion).

### Deliberately *not* proposed

- No enums or taxonomy for kinds or relations.
- No mandatory root, parent, objective or branch owner.
- No status columns (state lives in signals).
- No tree or DAG constraint.
- No uniqueness on `(source, target, relation)`: repeated evidence is meaningful.

### Edge cases the design must survive

1. **Supersession cycle** (A supersedes B supersedes A): `current_nodes` would hide both. It needs a defined rule, for example both stay visible and a `conflict` signal is surfaced, never silent loss.
2. **Retracted node with live dependents** (B `derived_from` retracted A): dependents are *flagged* (unsupported) through traversal, not deleted.
3. **Contradiction of a contradiction:** an edge about an edge about an edge (needs E1, with cycle-safe walks).
4. **Concurrent conflicting signals** (two explorers set blocked and open at the same instant): both are kept. "Current" needs a deterministic tie-break `(recorded_at, id)`, and the disagreement is itself observable.
5. **Rediscovery with different wording:** the fingerprint misses, so lexical or semantic search is the later remedy. Never auto-merge.
6. **Self-loops and duplicate identical edges:** allowed, and explained by provenance.
7. **Redacting an item whose text produced its fingerprint:** keep the digest, not the text.
8. **Clock skew between explorers:** order by DB `recorded_at`; treat `observed_at` as a claim.
9. **High fan-out hub:** paging must be complete and stable (keyset), never `LIMIT 100` truncation.

### Test scenarios (candidates for maintained offline tests, PGlite)

| ID | Scenario | Acceptance |
|---|---|---|
| S1 | **Branch-out and frontier:** 1 discovery spawns 50 branches; 10 get `status=exhausted` signals | A frontier query returns the 40 open branches without scanning signals table-wide |
| S2 | **Many-parent recombination:** 3 inputs → 1 result through a recombination event node | The inputs of *that* event are recoverable; others combined separately are not mixed in |
| S3 | **Contested link:** E `contradicts` edge(A `supports` B), then F `supports` that contradiction | Accepted (E1); the neighbourhood of edge A→B returns E and F |
| S4 | **Cycles:** A→B→C→A plus a chord | `neighbourhood(A, depth 10)` terminates; each item once |
| S5 | **Failure retained and revisited:** experiment `status=failed` with a `blocked_by` condition X; later X gets a contrary signal | A "revisit" query surfaces the failed experiment; nothing was deleted or rewritten |
| S6 | **Rediscovery:** two branches record the same fingerprint | An indexed lookup finds both; a `same_as` link and a convergence count of 2; neither is overwritten |
| S7 | **Supersession and current view:** v1 ← v2 ← v3 (supersedes), plus a supersession cycle | The current view is v3; the cycle case keeps both visible plus a conflict signal; history keeps all |
| S8 | **Ageing:** confidence 0.9 at t1, then 0.4 at t2 | Latest = 0.4; a decayed aggregate computed at query time; no row updated |
| S9 | **Redaction:** a secret in `body` | Body replaced; id, edges, fingerprint and digest intact; `redacted` signal; it is the only UPDATE the API can perform |
| S10 | **Concurrency:** two writers append edges and signals to one node in parallel | Both persist; no lost update |

### Open questions

- **Q1** Is the `items` supertable the right PostgreSQL shape for E1 (FKs, insert cost, two-step inserts in one transaction), or do you see a better enforced alternative?
- **Q2** A dedicated `signals` table vs signals as nodes plus edges: which is clearer for integrity, indexing and query-time ageing?
- **Q3** DB-level append-only enforcement for the future least-privilege role: now or later?
- **Q4** Fold into `001` (not yet applied anywhere) or add `002`?
- **Q5** Index plan and Free-tier footprint for E2, E4 and E5.

Please agree or disagree item by item with evidence, change SQL and tests offline where useful, and say what you would cut. I will then review your actual change and either accept it or name a specific, reproducible gap.

---
