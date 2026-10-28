# Codex review — BRIX memory results and offline implementation, 28 October 2026

Reviewed `466766febcbd397eccebf826c54e21d969115906`. **The bounded CLI exchange is accepted as completed on recorded host evidence plus verified Git artifacts. Offline implementation needs the targeted corrections below before cloud readiness. No repeat BRIX calls are needed or authorized.**

## Exchange evidence and cross-pollination

Independently read all four pinned descriptors, claim events, completion events and unedited results. For each task, descriptor blob matches the approved pin, completion points to the actual claim-event blob and same run, and SHA256 of result bytes matches output_sha256. Durations are 19/40/18/30 seconds; claim/completion times are sequential, first claim 10:04:00 UTC through final completion 10:07:27 UTC.

Results substantively reference peer findings: Claude drops branch_id/origin/access logs/hash indexing after Codex's objections; Codex retains assessments, adds source-correlation/budget/integrity constraints; Claude supplies supersession/correlation refinements; Codex identifies multiple-head limitations. This is actual peer contribution in the stored exchange, not two isolated cloud reports. Turn-4 loss of turn-2 stance/weight is openly documented; retaining those agreed fields in implementation is reasonable.

Host execution, archived allowlist, actual CLI environment, billing settings and notifier state remain Chris/Claude's reported host observations, not a fresh Codex host/provider audit. Grant is consumed/closed per that report. No more model runs.

## Independent offline validation

- Build/syntax: PASS.
- Both maintained test files run directly: **9 integrity + 2 original = 11 checks PASS**. npm test also exits successfully but this workspace's node --test reports file-level counts, so direct execution establishes the actual 11.
- Six additional isolated PGlite probes reproduce the cases below; no remote database or network needed.
- Claude's 9 mutation tests were reported, not independently rerun.
- Existing 001 migration remains unchanged by the reviewed commit.

## R1 — high: multi-row INSERT bypasses supersession integrity

`sql/002_integrity_assessments.sql`, check_supersession(): when the referenced row is not yet visible, BEFORE INSERT returns and expects the foreign key to reject it. PostgreSQL checks an immediate FK at statement end: a later row in the SAME INSERT can satisfy it.

Reproduced both:
1. Insert A supersedes B, then B supersedes A in one VALUES statement, same subject/assessor. Accepted. Both disappear from assessment_heads; belief reports no stances.
2. Insert A supersedes later B where B has a different subject AND assessor. Accepted; B's legitimate head is hidden.

Minimal shape (bind existing subject/basis UUIDs and fresh a/b):

```sql
INSERT INTO mycelium_memory.assessments
(id,node_id,stance,weight,assessor,basis_id,independence_key,supersedes)
VALUES
(:a,:subject,'supports',0.5,'same',:basis,'k',:b),
(:b,:subject,'supports',0.5,'same',:basis,'k',:a);
```

**Required:** enforce the stated predecessor-existing-before-insert invariant (reject a non-visible superseded row immediately), or validate full statement integrity/cycles with an appropriate constraint mechanism. Cover direct INSERT under the least-privilege runtime role, not only sequential appendAssessment calls. Add both regressions. Keep allowed independent heads unchanged.

## R2 — high: revisit creation/firing is not atomic

`src/memory.mjs`, appendRevisitTrigger/fireRevisit(): each logical operation is multiple independently committed append calls.

Reproductions:
- appendRevisitTrigger with a missing target rejects its edge FK, but leaves one persisted revisit_trigger node. dueRevisits can then schedule an invalid target.
- Inject a transient failure on fireRevisit's final revisits edge INSERT. The probe and fired_from edge already exist; the operation rejects, yet dueRevisits suppresses this trigger/cause permanently because it sees fired_from. No complete target link exists.

**Required:** make each logical multi-record operation atomic through the database adapter transaction contract, preserving admission checks, stable UUIDs and conflict verification. Alternatively implement an explicit durable completion/repair protocol, but a transaction is the smaller solution. Verify invalid-target rollback and injected failures at each statement; maintain concurrent/idempotent firing behavior. Do not rely on callers retrying after a failure that has already removed the item from the due list.

## R3 — medium: keyset cursor loses PostgreSQL microseconds

`connections()` returns recorded_at as a JavaScript Date, then accepts it unchanged as the next cursor. PostgreSQL timestamps retain microseconds; Date retains milliseconds.

Reproduced two edges at `2026-10-28T12:00:00.000123Z` and `.000456Z`, limit 1. Passing page1's row as after makes page2 return page1 again, because cursor is rounded down to .000Z. A client can loop indefinitely or duplicate results.

**Required:** return/use an exact timestamp cursor representation (for example database-formatted text with full precision and UUID, separate from presentation Date). Tests must include >millisecond precision, same-timestamp UUID tie-breaking and complete traversal with no repeats/skips. Do not change recorded timestamps to eliminate precision after the fact.

## R4 — small: depth truncation signal is inconsistent

A simple 4-node chain, neighbourhood(root,{maxDepth:1}), returns only the first neighbour and truncated=false despite the deeper graph. At depth 6 the code sets truncated based merely on a nonempty frontier, even if that frontier has no unseen continuation.

Define whether truncated means any budget cutoff or only row/result caps. Expose an accurate depth-limit indicator (a conservative “boundary reached” is acceptable if named/documented), so callers do not mistake the returned subgraph for complete coverage. Test both an actual continuation and a dead-end at the boundary.

## Retained limitations, not extra requirements

- pg_database_size-before-write is a soft admission threshold, not a strict concurrent storage reservation; one write or concurrent writes may overshoot. Keep headroom and describe it honestly.
- Asserted validity is stored, but belief currently does not filter by it. Do not present belief as an as-of/current-valid-time projection.
- The declared independence/assessor identity and the redaction issue are already documented trade-offs. Do not ask Chris to decide on cloud writes before code corrections are reviewable. No new call grant is needed to fix these locally.

## Handoff

**Claude:** make the narrow source/test corrections R1–R3 and clarify R4, publish one delta with maintained tests plus those regressions. Source/offline scope already authorized; no repeat project permission, BRIX/model test, host change, Neon access or new framework. Codex checks that delta once. Preserve unedited CLI results and migration 001. Migration 002 has not been deployed; any edit changes its local checksum and must be documented.

After corrections, report a short consolidated design/outcome and the smallest separate Neon/redaction decision. This review requests no approval to deploy or execute SQL remotely.
