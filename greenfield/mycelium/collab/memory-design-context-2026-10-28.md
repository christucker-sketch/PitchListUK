# Mycelium memory design exchange: shared context (prepared 28 Oct 2026)

You are one of two AI CLIs (Claude Code and Codex) taking turns on fpd-prod to design Mycelium's persistent memory.
Each turn is one answer. The other CLI reads your answer as its input on the next turn. A human only launches the run;
nobody edits or relays your answers. Work from the material below. You have no tools, files or network beyond this text.

## How to take your turn

- Think freely. There are no assigned lanes, no required taxonomy and no preset objective; challenge, cross-connect,
  or propose something neither of you has said yet.
- Number your points (Claude: C1, C2, ...; Codex: X1, X2, ...) and answer the other CLI's points by number.
- The next CLI sees only this context file and YOUR answer, so briefly restate anything from earlier turns it needs.
- Separate what storage must support now (essential) from ideas for later (speculative).
- Stay within the runner's limit of about 400 words. Prefer compact SQL or precise prose to long prose.
- Do NOT use the decision-request envelope. These turns produce design text, not decisions for Chris.

## 1. Founding vision (owner directive, verbatim)

# MYCELIUM — FOUNDING VISION / OWNER DIRECTIVE
**27 October 2026 — Chris's explicit, non-negotiable project intent.**

## The inspiration
The expanding fungal network visualised in the opening of *The Last of Us*: growth spreads outward in every available direction, continually probes and tests routes, discovers pathways, connects branches, adapts to local evidence and keeps expanding.

## What Mycelium IS
**An open-ended, decentralised, exploratory and self-improving intelligence network.** Its defining behaviour is **branching expansion in all directions**, with potentially exponential growth in explored pathways where evidence and available resources support it. New discoveries produce new branches, intersections, hypotheses and experiments. Branches can reinforce, contradict, cross-pollinate and learn from one another. Failed exploration generates useful memory rather than being discarded. Mycelium develops a shared persistent map of the explored environment and autonomously identifies routes no human had specified in advance.

It is *not* a fixed objective broken into narrow lanes, a prescribed workflow, a central planner issuing sequential tickets, a conventional task scheduler, or a Jira board with two AIs.

Growth is not artificially limited to the directions anticipated by Chris, Quinn, Claude or Codex. Objectives may serve as contexts or nutrients, **not rails that predefine what can be discovered**. Exploration is intrinsic, not an exception requiring a bespoke human instruction for each branch.

## Relationship to the work already completed
The GitHub hub, HubSync, BRIX CLI proofs, notifier and owner-decision mechanism are the **communications/control infrastructure through which AIs collaborate to DEVELOP AND BUILD Mycelium**. They are not Mycelium itself. Passing the communications proof is not delivery of the organism.

Do not replace the vision with another iteration of communication plumbing, approval-email refinements or sequential handoff diagrams. Next conceptual focus: how a branching exploratory network actually grows, measures evidence, remembers, recombines and adapts.

## Engineering interpretation that preserves the vision
- Support spontaneous branching in many directions from observations and discoveries, not only from centrally assigned objectives.
- Shared persistent graph/memory of paths, evidence, contradictions, causal relationships and branch lineage.
- Parallel, distributed probing and local evaluation; discoveries can spawn new probes and link previously unrelated branches.
- Adaptive propagation based on findings, environmental conditions and available capacity; preserve diversity, revisit blocked paths when conditions change.
- Seek **scalable growth of exploration**; don't falsely promise infinite physical compute or unlimited subscriptions. Resource budgets control *rate and real-world effects*, not censor the conceptual search space.
- Safety boundaries remain for external actions, cost, secrets, identity, production changes and destructive activity. These constraints do not turn exploration into a centrally pre-scripted checklist.
- General-purpose architecture; FindPitches is an optional proving ground, not the definition of Mycelium.

## Direction to all three assistants
**Quinn, Claude and Codex:** treat this as the governing product vision. Do not revert to a narrow "defined objective → prescribed lanes → sequential approvals" mental model. When proposing work, explicitly explain how it enables multidirectional branching, learning, network effects or adaptive expansion. If it merely adds governance or conventional workflow machinery, challenge its relevance.

This directive defines purpose, **not approval for deployment, spending, automatic AI execution, unsafe actions or bypassing existing controls**. The present operational safety gates remain in force until Chris separately authorises changes.

**Owner's bottom line: Mycelium must grow and discover like an expanding mycelial network. Nothing else will do.**

## 2. Current schema (greenfield/mycelium/memory/sql/001_memory.sql, verbatim; tested locally, not yet applied to any cloud database)

```sql
CREATE SCHEMA mycelium_memory;
-- statement
REVOKE ALL ON SCHEMA mycelium_memory FROM PUBLIC;
-- statement
CREATE TABLE mycelium_memory.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE mycelium_memory.nodes (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (length(btrim(kind)) > 0),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  observed_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE mycelium_memory.edges (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES mycelium_memory.nodes(id),
  target_id uuid NOT NULL REFERENCES mycelium_memory.nodes(id),
  relation text NOT NULL CHECK (length(btrim(relation)) > 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX nodes_kind_recorded_idx ON mycelium_memory.nodes (kind, recorded_at DESC);
-- statement
CREATE INDEX edges_source_relation_idx ON mycelium_memory.edges (source_id, relation);
-- statement
CREATE INDEX edges_target_relation_idx ON mycelium_memory.edges (target_id, relation);
-- statement
REVOKE ALL ON ALL TABLES IN SCHEMA mycelium_memory FROM PUBLIC;
```

## 3. Current memory API (greenfield/mycelium/memory/src/memory.mjs, verbatim)

```js
import { randomUUID } from 'node:crypto';

function object(value) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('Metadata must be a JSON object.');
  return JSON.stringify(value);
}

// Append-only API: evolution, contradictions and corrections are new nodes/edges, not overwritten history.
export function nodeInsert({ id = randomUUID(), kind, title = '', body = '', attributes = {}, provenance = {}, observedAt = null }) {
  return { text: `INSERT INTO mycelium_memory.nodes
    (id,kind,title,body,attributes,provenance,observed_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id`,
    values: [id, kind, title, body, object(attributes), object(provenance), observedAt] };
}

export function edgeInsert({ id = randomUUID(), source, target, relation, attributes = {}, provenance = {} }) {
  return { text: `INSERT INTO mycelium_memory.edges
    (id,source_id,target_id,relation,attributes,provenance) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id`,
    values: [id, source, target, relation, object(attributes), object(provenance)] };
}

export function createMemory(db) {
  return {
    async appendNode(node) { const q = nodeInsert(node); return (await db.query(q.text, q.values))[0].id; },
    async appendEdge(edge) { const q = edgeInsert(edge); return (await db.query(q.text, q.values))[0].id; },
    async getNode(id) { return (await db.query('SELECT * FROM mycelium_memory.nodes WHERE id=$1', [id]))[0] ?? null; },
    async connections(id) {
      return db.query('SELECT * FROM mycelium_memory.edges WHERE source_id=$1 OR target_id=$1 ORDER BY recorded_at,id LIMIT 100', [id]);
    }
  };
}
```

## 4. Facts about the environment

- Target database: PostgreSQL 18 on Neon's Free plan (1 GB storage per project). Not connected yet; out of scope here.
- Local tests use PGlite (PostgreSQL 18.6). The current package passes its 2 offline tests.
- Design goal: memory for an open-ended, multidirectional exploration network: branching, cross-links, many-parent
  merges, contradictions (including against links), cycles, failure retention, revisiting, rediscovery, learning, ageing.
- Safety boundaries that remain: no secrets in memory, bounded cost and storage, no destructive deletion of history.
