// The eight offline scenarios agreed in the BRIX exchange (MYC-20261028-004 section 4), on PGlite (PostgreSQL 18.6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrate, versions } from '../src/schema.mjs';
import { createMemory } from '../src/memory.mjs';

function adapter(pg) {
  return { query: async (s, p = []) => (await pg.query(s, p)).rows,
    transaction: statements => pg.transaction(async tx => {
      const out = []; for (const s of statements) out.push((await tx.query(s.text, s.values ?? [])).rows); return out;
    }) };
}
async function fresh(opts) { const pg = new PGlite(); const db = adapter(pg); await migrate(db); return { pg, db, m: createMemory(db, opts) }; }
const count = async (db, t) => (await db.query(`SELECT count(*)::int AS n FROM mycelium_memory.${t}`))[0].n;

test('migrations: 001 then 002 in order, checksummed, idempotent; a changed or unknown applied migration stops all', async () => {
  const pg = new PGlite(); const db = adapter(pg);
  assert.equal(await migrate(db), 'applied');
  assert.deepEqual((await db.query('SELECT version FROM mycelium_memory.schema_migrations ORDER BY version')).map(r => r.version), versions);
  assert.equal(await migrate(db), 'already applied');
  await db.query("INSERT INTO mycelium_memory.schema_migrations VALUES ('999_future','x')");
  await assert.rejects(migrate(db), /Unknown applied migration/);
  await db.query("DELETE FROM mycelium_memory.schema_migrations WHERE version='999_future'");
  await db.query("UPDATE mycelium_memory.schema_migrations SET checksum='changed' WHERE version='002_integrity_assessments'");
  await assert.rejects(migrate(db), /checksum/);
  await pg.close();
});

test('1. branch, merge, cross-link and cycle: bounded, cycle-safe traversal and keyset paging', async () => {
  const { pg, m } = await fresh();
  const [root, a, b, merged, far] = await Promise.all(['root', 'branch', 'branch', 'merge', 'far'].map(kind => m.appendNode({ kind })));
  for (const [s, t, r] of [[root, a, 'spawns'], [root, b, 'spawns'], [a, merged, 'merged_into'], [b, merged, 'merged_into'],
    [merged, root, 'revisits'], [a, b, 'cross_link'], [merged, far, 'spawns']]) await m.appendEdge({ source: s, target: t, relation: r });
  const all = await m.neighbourhood(root, { maxDepth: 6 });
  assert.equal(all.nodes.length, 4); assert.equal(new Set(all.nodes.map(n => n.id)).size, 4);   // cycle visited once
  assert.equal(all.nodes.find(n => n.id === far).depth, 2);                                     // via the merge-root cycle
  assert.equal(all.truncated, false);
  const shallow = await m.neighbourhood(root, { maxDepth: 1 });
  assert.deepEqual(shallow.nodes.map(n => n.id).sort(), [a, b, merged].sort());
  const onlySpawns = await m.neighbourhood(root, { relations: ['spawns'], maxDepth: 6 });
  assert.deepEqual(onlySpawns.nodes.map(n => n.id).sort(), [a, b].sort());
  const capped = await m.neighbourhood(root, { maxResults: 2 });
  assert.equal(capped.nodes.length, 2); assert.equal(capped.truncated, true);
  // dense cycle: 30 nodes all linked to each other, traversal stays bounded by the visited set
  const ring = []; for (let i = 0; i < 30; i++) ring.push(await m.appendNode({ kind: 'ring' }));
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) if (i !== j) await m.appendEdge({ source: ring[i], target: ring[j], relation: 'links' });
  const dense = await m.neighbourhood(ring[0], { maxDepth: 6, maxResults: 1000 });
  assert.equal(dense.nodes.length, 29);
  const page1 = await m.connections(ring[0], { relation: 'links', limit: 25 });
  const page2 = await m.connections(ring[0], { relation: 'links', limit: 25, after: page1.at(-1) });
  const rest = await m.connections(ring[0], { relation: 'links', limit: 25, after: page2.at(-1) });
  assert.equal(page1.length + page2.length + rest.length, 58);
  assert.equal(new Set([...page1, ...page2, ...rest].map(e => e.id)).size, 58);
  assert.equal((await m.connections(root)).length, 3);   // legacy call unchanged
  await pg.close();
});

test('2. assess nodes and edges; zero or two subjects, bad stance/weight and dangling references are rejected', async () => {
  const { pg, db, m } = await fresh();
  const x = await m.appendNode({ kind: 'claim' }), y = await m.appendNode({ kind: 'claim' }), basis = await m.appendNode({ kind: 'evidence' });
  const link = await m.appendEdge({ source: x, target: y, relation: 'causes' });
  const base = { stance: 'supports', weight: 0.7, assessor: 'claude-cli', basis, independenceKey: 'probe:alpha' };
  await m.appendAssessment({ ...base, node: x });
  await m.appendAssessment({ ...base, edge: link, stance: 'contradicts' });   // contradicting a LINK
  assert.equal((await m.belief({ edge: link })).stances[0].stance, 'contradicts');
  await assert.rejects(m.appendAssessment({ ...base }), /check/i);                          // zero subjects
  await assert.rejects(m.appendAssessment({ ...base, node: x, edge: link }), /check/i);     // two subjects
  await assert.rejects(m.appendAssessment({ ...base, node: x, stance: 'maybe' }), /check/i);
  await assert.rejects(m.appendAssessment({ ...base, node: x, weight: 1.5 }), /check/i);
  await assert.rejects(m.appendAssessment({ ...base, node: randomUUID() }), /foreign key/i);
  await assert.rejects(m.appendAssessment({ ...base, node: x, basis: randomUUID() }), /foreign key/i);
  await assert.rejects(m.appendAssessment({ ...base, node: x, independenceKey: '  ' }), /check/i);
  assert.equal(await count(db, 'assessments'), 2);
  await pg.close();
});

test('3. supersession: one successor, same subject and assessor, no self-reference; concurrent heads are reported', async () => {
  const { pg, db, m } = await fresh();
  const x = await m.appendNode({ kind: 'claim' }), y = await m.appendNode({ kind: 'claim' }), basis = await m.appendNode({ kind: 'evidence' });
  const base = { node: x, stance: 'supports', weight: 0.4, assessor: 'codex-cli', basis, independenceKey: 'k1' };
  const a1 = await m.appendAssessment(base);
  const a2 = await m.appendAssessment({ ...base, weight: 0.9, supersedes: a1 });
  let b = await m.belief({ node: x });
  assert.deepEqual(b.stances, [{ stance: 'supports', independent_sources: 1, weight: 0.8999999761581421 }]);   // head only
  await assert.rejects(m.appendAssessment({ ...base, supersedes: a1 }), /unique|duplicate/i);                   // fork
  await assert.rejects(m.appendAssessment({ ...base, node: y, supersedes: a2 }), /same subject and assessor/);  // subject change
  await assert.rejects(m.appendAssessment({ ...base, assessor: 'claude-cli', supersedes: a2 }), /same subject and assessor/);
  const self = randomUUID();
  await assert.rejects(m.appendAssessment({ ...base, id: self, supersedes: self }), /check/i);
  await assert.rejects(m.appendAssessment({ ...base, supersedes: randomUUID() }), /foreign key/i);
  await m.appendAssessment({ ...base, weight: 0.2 });   // a second, independent head from the same assessor
  b = await m.belief({ node: x });
  assert.deepEqual(b.conflictingHeads, [{ assessor: 'codex-cli', heads: 2 }]);   // kept and reported, never merged
  assert.equal(await count(db, 'assessments'), 3);
  await pg.close();
});

test('4. correlated evidence counts once; independent rediscoveries persist as separate nodes with same_as claims', async () => {
  const { pg, db, m } = await fresh();
  const claim = await m.appendNode({ kind: 'claim' }), e1 = await m.appendNode({ kind: 'evidence' }), e2 = await m.appendNode({ kind: 'evidence' });
  await m.appendAssessment({ node: claim, stance: 'supports', weight: 0.6, assessor: 'claude-cli', basis: e1, independenceKey: 'source:report-17' });
  await m.appendAssessment({ node: claim, stance: 'supports', weight: 0.8, assessor: 'codex-cli', basis: e1, independenceKey: 'source:report-17' });
  await m.appendAssessment({ node: claim, stance: 'supports', weight: 0.5, assessor: 'codex-cli', basis: e2, independenceKey: 'source:field-probe' });
  await m.appendAssessment({ node: claim, stance: 'contradicts', weight: 0.3, assessor: 'claude-cli', basis: e2, independenceKey: 'source:field-probe' });
  const { stances } = await m.belief({ node: claim });
  const s = Object.fromEntries(stances.map(r => [r.stance, r]));
  assert.equal(s.supports.independent_sources, 2);                    // report-17 once (max 0.8) + field-probe
  assert.ok(Math.abs(s.supports.weight - 1.3) < 1e-6);
  assert.equal(s.contradicts.independent_sources, 1);                 // a contradiction is never cancelled out
  const r1 = await m.appendNode({ kind: 'discovery', title: 'shared supplier', provenance: { branch: 'A' } });
  const r2 = await m.appendNode({ kind: 'discovery', title: 'shared supplier', provenance: { branch: 'B' } });
  const same = await m.appendEdge({ source: r2, target: r1, relation: 'same_as', attributes: { confidence: 0.7 } });
  await m.appendAssessment({ edge: same, stance: 'contradicts', weight: 0.4, assessor: 'claude-cli', basis: r2, independenceKey: 'probe:dedupe' });
  assert.notEqual(r1, r2); assert.equal(await count(db, 'nodes'), 5);
  assert.equal((await m.belief({ edge: same })).stances[0].stance, 'contradicts');   // the same_as claim itself is contestable
  await pg.close();
});

test('5. asserted validity is separate from recording time, and ordered', async () => {
  const { pg, m } = await fresh();
  const c = await m.appendNode({ kind: 'condition', title: 'supplier API open', validFrom: '2026-01-01T00:00:00Z', validTo: '2026-06-01T00:00:00Z' });
  const row = await m.getNode(c);
  assert.equal(row.valid_from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.ok(row.recorded_at > row.valid_to);   // learned later than it was true: both kept
  await assert.rejects(m.appendNode({ kind: 'condition', validFrom: '2026-06-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' }), /check/i);
  const basis = await m.appendNode({ kind: 'evidence' });
  await assert.rejects(m.appendAssessment({ node: c, stance: 'neutral', weight: 0.1, assessor: 'x', basis, independenceKey: 'k',
    validFrom: '2026-02-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' }), /check/i);
  await pg.close();
});

test('6. the four revisit predicates, cancellation, and idempotent concurrent firing', async () => {
  const { pg, db, m } = await fresh();
  const blocked = await m.appendNode({ kind: 'probe', attributes: { outcome: 'blocked' } });
  const cond = await m.appendNode({ kind: 'condition', title: 'rate limit' }), basis = await m.appendNode({ kind: 'evidence' });
  const tCond = await m.appendRevisitTrigger({ target: blocked, predicate: 'condition_changed', params: { condition: cond, kind: 'capacity' } });
  const tEv = await m.appendRevisitTrigger({ target: blocked, predicate: 'evidence_added' });
  const tCon = await m.appendRevisitTrigger({ target: blocked, predicate: 'contradiction_added' });
  const tTime = await m.appendRevisitTrigger({ target: blocked, predicate: 'not_before', params: { at: '2026-11-01T00:00:00Z' } });
  await assert.rejects(m.appendRevisitTrigger({ target: blocked, predicate: 'whenever' }), /Unknown revisit predicate/);
  await assert.rejects(m.appendRevisitTrigger({ target: blocked, predicate: 'not_before', params: {} }), /params.at/);
  assert.deepEqual(await m.dueRevisits('2026-10-28T00:00:00Z'), []);   // nothing has happened yet
  const cap = await m.appendNode({ kind: 'capacity', title: 'limit raised' }); await m.appendEdge({ source: cap, target: cond, relation: 'updates' });
  const unrelated = await m.appendNode({ kind: 'note' }); await m.appendEdge({ source: unrelated, target: cond, relation: 'mentions' });
  const ev = await m.appendAssessment({ node: blocked, stance: 'contradicts', weight: 0.5, assessor: 'codex-cli', basis, independenceKey: 'k' });
  const due = await m.dueRevisits('2026-11-02T00:00:00Z');
  const byTrigger = Object.fromEntries(due.map(d => [d.trigger, d.cause]));
  assert.equal(due.length, 4);
  assert.equal(byTrigger[tCond], cap); assert.equal(byTrigger[tEv], ev); assert.equal(byTrigger[tCon], ev);
  assert.equal(byTrigger[tTime], 'time:2026-11-01T00:00:00Z');
  const p = due.find(d => d.trigger === tEv);
  const [f1, f2] = await Promise.all([m.fireRevisit(p), m.fireRevisit(p)]);   // two concurrent firers
  assert.equal(f1, f2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM mycelium_memory.nodes WHERE kind='probe' AND id<>$1", [blocked]))[0].n, 1);
  assert.equal((await m.getNode(blocked)).attributes.outcome, 'blocked');   // the blocked path itself is never mutated
  const canceller = await m.appendNode({ kind: 'decision' }); await m.cancelRevisitTrigger(tTime, { by: canceller });
  const left = await m.dueRevisits('2026-11-02T00:00:00Z');
  assert.deepEqual(left.map(d => d.trigger).sort(), [tCond, tCon].sort());   // fired one and cancelled one are gone
  await pg.close();
});

test('7. mutation is denied (owner triggers and runtime grants); identical retries succeed, conflicting retries are refused', async () => {
  const { pg, db, m } = await fresh();
  const n = await m.appendNode({ kind: 'k', title: 'original' }), n2 = await m.appendNode({ kind: 'k' });
  const e = await m.appendEdge({ source: n, target: n2, relation: 'r' });
  const a = await m.appendAssessment({ node: n, stance: 'supports', weight: 0.5, assessor: 'x', basis: n2, independenceKey: 'k' });
  for (const sql of ["UPDATE mycelium_memory.nodes SET title='changed'", 'DELETE FROM mycelium_memory.nodes', 'TRUNCATE mycelium_memory.nodes CASCADE',
    "UPDATE mycelium_memory.edges SET relation='x'", 'DELETE FROM mycelium_memory.edges', 'TRUNCATE mycelium_memory.edges CASCADE',
    'UPDATE mycelium_memory.assessments SET weight=1', 'DELETE FROM mycelium_memory.assessments', 'TRUNCATE mycelium_memory.assessments'])
    await assert.rejects(db.query(sql), /append-only/, sql);
  await db.query('CREATE ROLE mycelium_runtime');
  await db.query('GRANT USAGE ON SCHEMA mycelium_memory TO mycelium_runtime');
  await db.query('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA mycelium_memory TO mycelium_runtime');
  await db.query('SET ROLE mycelium_runtime');
  await m.appendNode({ kind: 'runtime-write' });                                                   // runtime can append
  await assert.rejects(db.query("UPDATE mycelium_memory.nodes SET title='x'"), /permission denied/);
  await assert.rejects(db.query('DROP TABLE mycelium_memory.nodes'), /must be owner|permission denied/);
  await db.query('RESET ROLE');
  assert.equal((await m.getNode(n)).title, 'original');
  assert.equal(await m.appendNode({ id: n, kind: 'k', title: 'original' }), n);                     // identical retry
  assert.equal(await m.appendEdge({ id: e, source: n, target: n2, relation: 'r' }), e);
  assert.equal(await m.appendAssessment({ id: a, node: n, stance: 'supports', weight: 0.5, assessor: 'x', basis: n2, independenceKey: 'k' }), a);
  await assert.rejects(m.appendNode({ id: n, kind: 'k', title: 'different' }), /different payload/);
  await assert.rejects(m.appendAssessment({ id: a, node: n, stance: 'supports', weight: 0.6, assessor: 'x', basis: n2, independenceKey: 'k' }), /different payload/);
  await assert.rejects(m.appendNode({ kind: 'k', body: 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' }), /credential pattern/);
  await assert.rejects(m.appendNode({ kind: 'k', attributes: { url: 'postgresql://u:secret@host/db' } }), /credential pattern/);
  assert.equal(await count(db, 'nodes'), 3);
  await pg.close();
});

test('8. budget throttling refuses new writes by capacity, never by topic, and preserves history', async () => {
  const { pg, db, m } = await fresh();
  const kept = await m.appendNode({ kind: 'kept', body: 'history' });
  const [{ bytes }] = await db.query('SELECT pg_database_size(current_database())::bigint AS bytes');
  const full = createMemory(db, { maxDatabaseBytes: Number(bytes) });
  for (const kind of ['familiar_topic', 'wildly_unexpected_topic', 'failure_record'])
    await assert.rejects(full.appendNode({ kind }), /budget reached/);                                // every kind alike
  assert.equal((await m.getNode(kept)).body, 'history');
  assert.equal(await count(db, 'nodes'), 1);
  const roomy = createMemory(db, { maxDatabaseBytes: Number(bytes) * 2 });
  assert.ok(await roomy.appendNode({ kind: 'wildly_unexpected_topic' }));                             // admitted again with headroom
  await assert.rejects(m.appendNode({ kind: 'k', body: 'x'.repeat(65537) }), /check/i);              // per-row payload bounds
  await assert.rejects(m.appendNode({ kind: 'k', attributes: { blob: 'x'.repeat(17000) } }), /check/i);
  await pg.close();
});
