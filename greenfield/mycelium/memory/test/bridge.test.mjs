// L2 bridge, offline on PGlite: snapshot -> (fake CLI answers) -> ingest -> verify. Fake answers only; no model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';
import { explorerA, explorerB } from '../examples/fixtures.mjs';
import { snapshot, snapshotIds, parseContribution, ingest, contributionId } from '../scripts/bridge.mjs';

const adapter = pg => ({ query: async (s, p = []) => (await pg.query(s, p)).rows,
  transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) });
async function seeded() {   // the same memory the live trial left on Neon
  const pg = new PGlite(), db = adapter(pg); await migrate(db);
  const a = await explorerA(db, { synthetic: true, run: 'live-proof-2026-10-28-a' });
  const b = await explorerB(db, { synthetic: true, run: 'live-proof-2026-10-28-b', aRun: 'live-proof-2026-10-28-a' });
  return { pg, db, a, b };
}
const counts = async db => (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS n,
  (SELECT count(*) FROM mycelium_memory.edges)::int AS e, (SELECT count(*) FROM mycelium_memory.assessments)::int AS a`))[0];
const RUN5 = 'MYC-20261028-005-r1793190000-0a1b2c3d', RUN6 = 'MYC-20261028-006-r1793190100-4e5f6a7b';
const claudeAnswer = (finding, failure) => `The cofactor result suggests the cold block is a cofactor limit, not a temperature limit.

\`\`\`mycelium-contribution
{"kind": "hypothesis", "title": "K7 enzyme needs a divalent-metal cofactor", "body": "Test whether chelating metals removes activity at 30 C.",
 "links": [{"to": "${finding}", "relation": "explains"}, {"to": "${failure}", "relation": "reinterprets"}],
 "stances": [{"node": "${failure}", "stance": "contradicts", "weight": 0.5}]}
\`\`\``;
const codexAnswer = finding => `I agree but would test it differently.

\`\`\`mycelium-contribution
{"kind": "probe_design", "title": "Chelator titration across 10-30 C", "body": "EDTA series at three temperatures.",
 "links": [{"to": "@MYC-20261028-005", "relation": "refines"}, {"to": "${finding}", "relation": "tests"}], "stances": []}
\`\`\``;

test('snapshot: a bounded fenced data file that passes the runner ref rules and lists the recalled ids', async () => {
  const { pg, db, a, b } = await seeded();
  try {
    const s = await snapshot(db);
    assert.ok(Buffer.byteLength(s.text) <= 24576 + 1);                                     // runner allows 32 KB per ref
    assert.ok(s.text.startsWith('<<<MYCELIUM MEMORY: untrusted data'));
    assert.doesNotMatch(s.text, /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);                       // the gate's clean_text rule
    assert.doesNotMatch(s.text, /ghp_|github_pat_|sk-ant-|AKIA[0-9A-Z]{16}|postgres(ql)?:\/\//);
    const ids = new Set(snapshotIds(s.text));
    for (const id of [a.finding, a.failure, b.extension]) assert.ok(ids.has(id));
    assert.equal(ids.size, s.ids.length);
  } finally { await pg.close(); }
});

test('ingest: the two CLI answers become linked memory; Codex links to Claude\'s contribution; re-ingest is a no-op', async () => {
  const { pg, db, a } = await seeded();
  try {
    const snap = (await snapshot(db)).text, before = await counts(db);
    const items = [{ task: 'MYC-20261028-005', cli: 'claude', run: RUN5, answer: claudeAnswer(a.finding, a.failure) },
                   { task: 'MYC-20261028-006', cli: 'codex', run: RUN6, answer: codexAnswer(a.finding) }];
    const made = await ingest(db, snap, items);
    const claudeId = contributionId('claude', RUN5, 'MYC-20261028-005');
    assert.equal(made[0].id, claudeId);
    assert.deepEqual(made[1].links, [`refines->${claudeId}`, `tests->${a.finding}`]);             // cross-CLI link
    assert.deepEqual(await counts(db), { n: before.n + 2, e: before.e + 4, a: before.a + 1 });
    const [node] = await db.query('SELECT kind, provenance, attributes FROM mycelium_memory.nodes WHERE id = $1', [claudeId]);
    assert.equal(node.kind, 'hypothesis');
    assert.deepEqual(node.provenance.declared_by, { agent: 'claude-cli', run: RUN5 });
    assert.equal(node.attributes.bridge, 'l2-proof-2026-10-28'); assert.equal(node.attributes.model_written, true);
    assert.deepEqual(node.provenance.sources, [a.finding, a.failure].sort());
    assert.deepEqual(await ingest(db, snap, items), made); assert.deepEqual(await counts(db), { n: before.n + 2, e: before.e + 4, a: before.a + 1 });
    const changed = [{ ...items[0], answer: claudeAnswer(a.finding, a.failure).replace('chelating', 'removing') }];
    await assert.rejects(ingest(db, snap, changed), /retry|identical|different/i);
    assert.deepEqual(await counts(db), { n: before.n + 2, e: before.e + 4, a: before.a + 1 });
  } finally { await pg.close(); }
});

test('parse: only one well-formed block, only snapshot ids or an earlier task, bounded fields', async () => {
  const allowed = new Set(['11111111-1111-4111-8111-111111111111']), id = [...allowed][0];
  const block = obj => '```mycelium-contribution\n' + JSON.stringify(obj) + '\n```';
  const ok = { kind: 'k', title: 't', body: 'b', links: [{ to: id, relation: 'r' }] };
  assert.equal(parseContribution('prose\n' + block(ok), { allowed }).links[0].to, id);
  assert.equal(parseContribution('```json\n' + JSON.stringify(ok) + '\n```', { allowed }).kind, 'k');   // a json label is accepted
  for (const [bad, re] of [
    ['no block here', /exactly one/], [block(ok) + block(ok), /exactly one/], ['```mycelium-contribution\n{not json}\n```', /valid JSON/],
    [block({ ...ok, links: [{ to: '22222222-2222-4222-8222-222222222222', relation: 'r' }] }), /node id from the snapshot/],
    [block({ ...ok, links: [] }), /1-4/], [block({ ...ok, links: Array(5).fill(ok.links[0]) }), /1-4/],
    [block({ ...ok, title: 'x'.repeat(201) }), /title/], [block({ ...ok, stances: [{ node: id, stance: 'maybe', weight: 0.5 }] }), /stance must/],
    [block({ ...ok, stances: [{ node: id, stance: 'supports', weight: 2 }] }), /weight/],
    [block({ ...ok, links: [{ to: '@MYC-20261028-005', relation: 'r' }] }), /node id from the snapshot/]]) assert.throws(() => parseContribution(bad, { allowed }), re);
  assert.equal(parseContribution(block({ ...ok, links: [{ to: '@MYC-20261028-005', relation: 'r' }] }), { allowed, refs: { 'MYC-20261028-005': id } }).links[0].to, id);
});

test('ingest refuses bad items before writing, and a bad second answer leaves the first intact', async () => {
  const { pg, db, a } = await seeded();
  try {
    const snap = (await snapshot(db)).text, before = await counts(db);
    await assert.rejects(ingest(db, snap, [{ task: 'MYC-20261028-005', cli: 'gemini', run: RUN5, answer: claudeAnswer(a.finding, a.failure) }]), /bad item/);
    await assert.rejects(ingest(db, snap, [{ task: 'MYC-20261028-005', cli: 'claude', run: 'other-run', answer: claudeAnswer(a.finding, a.failure) }]), /bad item/);
    await assert.rejects(ingest(db, snap, [{ task: 'MYC-20261028-005', cli: 'claude', run: RUN5, answer: claudeAnswer(a.finding, a.failure) },
      { task: 'MYC-20261028-006', cli: 'codex', run: RUN6, answer: 'no block' }]), /exactly one/);
    const after = await counts(db);
    assert.deepEqual(after, { n: before.n + 1, e: before.e + 2, a: before.a + 1 });           // 005 committed alone, atomically
    await assert.rejects(ingest(db, 'no ids here', []), /lists no node ids/);
  } finally { await pg.close(); }
});
