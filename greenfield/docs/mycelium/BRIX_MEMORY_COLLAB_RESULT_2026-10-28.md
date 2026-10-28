# BRIX memory-design exchange: host evidence, joint result and offline implementation (28 Oct 2026)

Carries out the [approved proposal](BRIX_MEMORY_COLLAB_RUN_PROPOSAL_2026-10-28.md) (revision 2, Codex PASS `88e54244`, Chris's approval recorded in `8062df5a`).

- **Host evidence:** Chris's host report, pasted to Claude; the result hashes are checked against GitHub.
- **The four results are unedited** in `greenfield/mycelium/tasks/MYC-20261028-00{1..4}/result.md`. They are the design record.
- **Recorded by cloud Claude.** The offline implementation below is by cloud Claude, with Codex to review once.

## 1. Host evidence (fpd-prod, 28 Oct 2026, run by Chris; one launcher command)

| Turn | CLI | Claim | Call | Completed | Result sha256 (matches GitHub) |
|---|---|---|---|---|---|
| `MYC-20261028-001` | Claude Code 2.1.308 (sonnet) | `0190b2ae` | 19 s | `a33c9f08` | `f7e55910ac8bbd41…` |
| `MYC-20261028-002` | Codex CLI 0.164.0 | `18aec263` | 40 s | `a8185760` | `0be41f138a6bceef…` |
| `MYC-20261028-003` | Claude Code 2.1.308 (sonnet) | `f7aa7e7d` | 18 s | `b131ce52` | `82ad1a58cf850fe8…` |
| `MYC-20261028-004` | Codex CLI 0.164.0 | `1cd86a17` | 30 s | `986288b6` | `6f4a48d46a3c6967…` |

- **The grant, as computed by the gate before each turn:**
  - claims 0 → 1 → 2 → 3, of max 4;
  - nothing held;
  - window left 3600 → 3440 s.
- **Duration:** under 4 min from the first claim (epoch 1793181840) to the last result. Each turn's sign-in preflight passed before its claim (no model call).
- **Totals:** 4 CLI invocations in all, with no retries and no STOP. The launcher printed `DONE: all four turns completed`.
- **Closed afterwards:** the separate allowlist was archived to `/root/collab-20261028/`, and `/etc/myc-stageb/` holds only the original `allowed`. The notifier was not used (dry run, timer off).
- **Billing:** £0 expected on the subscriptions after Chris's checks. This is Chris's check, not a provider billing audit.
- **No human relayed or edited any answer.** Turns 2–4 received the previous turn's `result.md` through the gate's pinned ref.

## 2. What the exchange produced (judged against the hub's success criteria)

**Both CLIs contributed substantively, with cross-reference.**

- **Claude Code, turn 1,** opened ten points (C1–C10) on what the network cannot yet do: lineage, weighted evidence (including against links), probe lifecycle, revisit triggers, conditions and validity, ageing, rediscovery, embeddings, the frontier, and API integrity. It asked three questions.
- **Codex, turn 2,** answered every point:
  - it refined C1 (no single `branch_id`; lineage lives in edges);
  - it challenged C6 (an access log speeds storage exhaustion, and replacing bodies breaks append-only history);
  - it added X1 (append-only must be enforced by privileges, not convention) and X2 (read-time belief, count correlated evidence once, measured admission);
  - it supplied the `assessments` DDL.
- **Claude Code, turn 3,** conceded C6 and dropped `origin` and the hash index, because of Codex. It answered Codex's questions with four revisit predicates and a supersession rule. It found the weakest part of Codex's DDL: assessor and evidence identity were unconstrained. It fixed that with `independence_key` and a one-successor unique index. It added mutation triggers as defence in depth.
- **Codex, turn 4,** consolidated everything. It recorded the origin and fate of each point, and what changed because of the peer. It gave 8 PGlite scenarios. It also caught a defect in turn 3's fix: the unique index stops forks, not multiple independent heads.

**One gap showed up exactly as predicted (no memory between turns).** Turn 3 did not restate Codex's turn-2 DDL. Turn 4 said so ("Turn 2's assessment DDL is absent; this reconstructs the agreed structure") and rebuilt the table without turn 2's `stance` and `weight`, which both CLIs had agreed. The implementation below follows the agreement of turns 2 and 3 on those two columns, and records this as a deviation. **Fix for any future exchange:** let each turn ref the original turn-2 result as well, or restate any DDL verbatim.

## 3. Offline implementation (cloud Claude; PGlite PostgreSQL 18.6; no Neon, no remote SQL)

**New file** `greenfield/mycelium/memory/sql/002_integrity_assessments.sql`. `001` is byte-unchanged, so its checksum is stable.

| Agreed point | Implemented as |
|---|---|
| C2 / turn 2 / turn 3 / turn 4 assessments | Table `assessments` with exactly one of node or edge; `stance` ∈ supports/contradicts/neutral; `weight` 0–1; `assessor`; `basis_id`; `independence_key`; `supersedes`; validity; partial subject indexes; `basis` index |
| Turn 3/4 supersession | One successor per row (unique partial index). A trigger requires the same subject and assessor. Self-reference is rejected; a cycle is impossible with immutable rows. **Multiple heads are kept and reported** (`belief().conflictingHeads`), never merged |
| X1 / turn 3 append-only | `BEFORE UPDATE/DELETE` row triggers and `BEFORE TRUNCATE` statement triggers on nodes, edges and assessments. The test also shows a SELECT/INSERT-only runtime role is refused UPDATE and DROP |
| X2 / turn 3 read-time belief | View `assessment_heads`. `belief({node|edge})` counts each `independence_key` once per stance (max weight) |
| C5 validity | `valid_from`/`valid_to` on nodes (as C5 and turn 3 put it) **and** on assessments (as turn 4 put it), ordered by CHECK; separate from `recorded_at` |
| X2 bounded payloads | CHECKs: body ≤ 64 KiB, title ≤ 1 KiB, attributes/provenance ≤ 16 KiB |
| X2 / turn 3 admission by capacity | `createMemory(db, {maxDatabaseBytes = 900 MiB})` measures `pg_database_size` before each append. When full it refuses **every kind alike** and never touches history |
| C10 API | `connections(id, {relation, after, limit ≤ 500})` (keyset paging, legacy call unchanged). `neighbourhood(id, {relations, maxDepth ≤ 6, maxResults ≤ 1000})` is breadth-first with a **global visited set** (Codex: a path-array CTE doesn't stop cycles across different paths), per-level and result caps, and a `truncated` flag |
| C10 retries | Supplied ids: an identical retry returns the id; a different payload under the same id is refused. Applies to nodes, edges and assessments |
| C10 secrets | Write-time refusal of credential patterns (application-enforced, as Codex said) |
| Turn 3 revisit triggers | Immutable `revisit_trigger` nodes for the four predicates only (`condition_changed`, `evidence_added`, `contradiction_added`, `not_before`); a `cancels` edge cancels. `dueRevisits(now)` lists unfired (trigger, cause) pairs. `fireRevisit` creates a probe with an id derived from (trigger, cause), so concurrent firing is idempotent; the blocked path is never mutated |
| Deferred, as agreed | Embeddings (C8), frontier (C9), hash/fingerprint index (C7), archive/ageing (C6) |

`schema.mjs` now applies an ordered, checksummed list. Every applied migration must match before any change, an unknown applied version stops everything, and each migration is atomic.

**Tests: 11/11** (`npm test`, stable over 3 runs). There are 2 existing tests plus `test/integrity.test.mjs`, which covers the migration chain and **all 8 turn-4 scenarios**. **Mutation check:** each of the 9 deliberate breaks is caught by at least one failing test. The breaks are:

- no append-only trigger;
- no one-successor index;
- supersession ignoring the assessor;
- traversal without a visited set;
- correlated evidence counted twice;
- a retry ignoring a payload conflict;
- no budget check;
- cancelled triggers still due;
- no secret check.

`npm run build` passes. This is local-fixture evidence only, not a Neon test.

## 4. Unresolved trade-offs for Chris (none blocks the offline work)

1. **No redaction path.** Turning append-only into enforced immutability means a secret or personal datum stored by mistake cannot be removed by any SQL short of dropping the triggers as owner. Write-time refusal reduces the risk but cannot remove it. The exchange did not address this; my preparatory notes (P6/E7) proposed one sanctioned redaction function. **This needs a decision before any Neon write.**
2. **Budget headroom and archive.** The default is 900 MiB of the Free 1 GB. When full, growth stops, by capacity and never by topic. There is no verified archive destination yet (Codex: archival needs one first).
3. **Assessor identity is declared, not authenticated,** and `independence_key` is self-declared. Trusted identity is a later capability.
4. **Multiple heads** for one assessor are reported, not reconciled. A reconciliation rule is open.
5. **Runtime role on Neon.** Roles are cluster-level, so `002` does not create them. Creating a SELECT/INSERT-only runtime role, separate from the migration owner, is part of the later Neon step.
6. **Admission cost.** `pg_database_size` runs on every append. That is fine at this scale; cache it if writes become frequent.
7. **`contradiction_added`** watches only the blocked node itself, not "an upstream path" (turn 3's wording). Widening it needs a traversal budget.

## 5. Comparison with the cloud preparatory notes (written before the exchange, not given to the CLIs)

- **The CLIs reached:**
  - cycle-safe traversal and keyset paging (E5);
  - size bounds (E6);
  - arguing with links (P1, more narrowly: assessments on edges rather than a general edges-about-edges supertable, E1);
  - an append-only evolving-state stream (E2, as assessments and event nodes);
  - `same_as` rediscovery, deferring the fingerprint until canonicalisation is defined (Codex's reason beats E4's).
- **The CLIs improved on the notes:**
  - correlated-evidence keys;
  - one-successor supersession and the multiple-heads caveat;
  - **enforced** immutability (privileges plus triggers);
  - payload-conflict retries;
  - explicit revisit predicates with cancellation;
  - asserted validity versus recording time;
  - admission by capacity, not topic.
- **The CLIs missed:**
  - a redaction path (E7/P6, now trade-off 1);
  - `created_by` on every item (E8);
  - reserved structural relations with a `current_nodes` view (E3/P3). Supersession now exists only for assessments, not for nodes.
- **The notes' strongest unshared idea is a first-class edges-about-edges graph (E1).** The CLIs chose the narrower `assessments` route, which covers contradiction of links but not, for example, a link between two links.

## 6. Minimum next storage step

None on any cloud database yet. Next: **Codex reviews this result and migration `002` once.** Then **Chris decides trade-off 1 (redaction)** before any Neon write; the Neon steps remain the separate approval described in the memory README. No further BRIX calls are authorised. Any new exchange (for example, on E1 or redaction) would be a fresh bounded proposal.
