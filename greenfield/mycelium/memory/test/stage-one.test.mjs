// Stage One, offline on PGlite: manifest-selected recall, pinned batch ingestion, recovery after interruption, exact
// verification, the complete privilege check with real refusals, and bridge-login provisioning. Fake answers only; no
// Neon, no network, no model calls. Each of Codex's 29 Oct review reproductions (stage-one-review-probes.mjs, which
// records the PRE-FIX behaviour) has an inverted assertion here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { adapter, world, counts } from './helpers.mjs';
import { parseManifest, seed, seedId, snapshot, planBatch, ingestBatch, verifyPlanned, contributionId, sha256, runCli, bridgeGuard } from '../scripts/bridge.mjs';
import { readPrivileges, principalProblems, assertPrincipal } from '../scripts/privileges.mjs';
import { createLoginStatements, rotateLoginStatements, disableLoginStatements, membershipQueries, assertBridgeLogin, assertBridgeClosed,
  ownership, validUntil, BRIDGE_ROLE } from '../scripts/bridge-provision.mjs';

const MANIFEST = {
  batch: 'stage-one-proof-test', purpose: 'offline rehearsal',
  seed: { kind: 'question', title: 'FindPitches: how do we verify a vendor pitch is real, open and actionable?', body: 'Seed question for the proof.' },
  selection: { search: 'FindPitches', limit: 20, maxDepth: 2, maxResults: 60 },
  tasks: [{ task: 'MYC-20261029-001', agent: 'claude' }, { task: 'MYC-20261029-002', agent: 'codex' }]
};
const RUN1 = 'MYC-20261029-001-r1793280000-0a1b2c3d', RUN2 = 'MYC-20261029-002-r1793280100-4e5f6a7b';
const block = o => 'Reasoning.\n\n```mycelium-contribution\n' + JSON.stringify(o) + '\n```\n';
const claude = s => block({ kind: 'hypothesis', title: 'Organiser application pages are the primary evidence', body: 'Check the official page.',
  links: [{ to: s, relation: 'answers' }], stances: [{ node: s, stance: 'supports', weight: 0.6 }] });
const codex = s => block({ kind: 'probe_design', title: 'Two-source verification', body: 'Require an organiser page and a dated listing.',
  links: [{ to: '@MYC-20261029-001', relation: 'refines' }, { to: s, relation: 'tests' }], stances: [] });

async function prepared(opts) {
  const w = await world(opts), mtext = JSON.stringify(MANIFEST);
  const s = await seed(w.db, MANIFEST, sha256(mtext));
  const snap = await snapshot(adapter(w.pg, { readOnly: true }), MANIFEST.selection);
  const answers = [claude(s.id), codex(s.id)];
  const batch = { batch: MANIFEST.batch, commit: 'a'.repeat(40), manifest_sha256: sha256(mtext), snapshot_sha256: snap.sha256,
    items: [{ task: 'MYC-20261029-001', agent: 'claude', run: RUN1, descriptor_blob: 'b'.repeat(40), result_blob: 'c'.repeat(40), result_sha256: sha256(answers[0]) },
            { task: 'MYC-20261029-002', agent: 'codex', run: RUN2, descriptor_blob: 'd'.repeat(40), result_blob: 'e'.repeat(40), result_sha256: sha256(answers[1]) }] };
  return { ...w, mtext, seedNode: s.id, snap, answers, batch };
}

test('manifest selection: relevant FindPitches memory is snapshotted (was: hard-coded "polymer P"); seed is idempotent; recall is READ ONLY', async () => {
  const { pg, db, seedNode, snap, mtext } = await prepared();
  try {
    assert.equal(seedNode, seedId(MANIFEST.batch));
    assert.ok(snap.text.includes(seedNode) && snap.text.startsWith('<<<MYCELIUM MEMORY: untrusted data'));
    assert.equal(sha256(snap.text), snap.sha256);
    const before = await counts(db);
    assert.equal((await seed(db, MANIFEST, sha256(mtext))).id, seedNode); assert.deepEqual(await counts(db), before);   // re-seed: no-op
    const ro = adapter(pg, { readOnly: true });
    await assert.rejects(ro.query(`INSERT INTO mycelium_memory.nodes(id, kind) VALUES ('22222222-2222-4222-8222-222222222222', 'x')`), /read-only/i);
    for (const bad of [{ ...MANIFEST, extra: 1 }, { ...MANIFEST, seed: { ...MANIFEST.seed, kind: 'finding' } }, { ...MANIFEST, batch: 'Bad Name' },
      { ...MANIFEST, selection: { ...MANIFEST.selection, maxDepth: 9 } }, { ...MANIFEST, tasks: [MANIFEST.tasks[0], MANIFEST.tasks[0]] },
      { ...MANIFEST, tasks: [{ task: 'MYC-20261029-001', agent: 'gemini' }] }]) assert.throws(() => parseManifest(bad));
  } finally { await pg.close(); }
});

test('batch binding: every hash, order, agent and run id is checked before any write (was: fabricated run suffix accepted)', async () => {
  const { pg, db, snap, answers, batch } = await prepared();
  try {
    const before = await counts(db);
    const bad = [
      [{ ...batch, snapshot_sha256: 'f'.repeat(64) }, answers, /snapshot bytes/],
      [batch, [answers[0], answers[1] + ' '], /does not match its pinned sha256/],
      [{ ...batch, items: [batch.items[1], batch.items[0]] }, [answers[1], answers[0]], /not manifest turn/],
      [{ ...batch, items: [{ ...batch.items[0], agent: 'codex' }, batch.items[1]] }, answers, /not manifest turn/],
      [{ ...batch, items: [{ ...batch.items[0], run: 'MYC-20261029-001-rnot-a-valid-run' }, batch.items[1]] }, answers, /bad item/],
      [{ ...batch, items: [{ ...batch.items[0], run: RUN2 }, batch.items[1]] }, answers, /bad item/],
      [{ ...batch, extra: 1 }, answers, /wrong fields/], [{ ...batch, batch: 'other-batch' }, answers, /another manifest/]];
    for (const [b, a, re] of bad) assert.throws(() => planBatch(MANIFEST, b, snap.text, a), re);
    assert.deepEqual(await counts(db), before);
  } finally { await pg.close(); }
});

test('all-or-nothing validation: a malformed second answer writes NOTHING (was: first committed alone)', async () => {
  const { pg, db, snap, answers, batch } = await prepared();
  try {
    const before = await counts(db), broken = 'no block here';
    const b = { ...batch, items: [batch.items[0], { ...batch.items[1], result_sha256: sha256(broken) }] };
    await assert.rejects(ingestBatch(db, MANIFEST, b, snap.text, [answers[0], broken]), /exactly one/);
    assert.deepEqual(await counts(db), before);
  } finally { await pg.close(); }
});

test('happy path + exact verification; the exact-batch replay is a no-op; a changed payload under an existing id is refused', async () => {
  const { pg, db, snap, answers, batch, seedNode } = await prepared();
  try {
    const planned = planBatch(MANIFEST, batch, snap.text, answers);
    assert.equal((await verifyPlanned(db, planned)).problems.filter(x => / missing$/.test(x)).length, 6);   // every row missing before ingest
    const before = await counts(db);
    const made = await ingestBatch(db, MANIFEST, batch, snap.text, answers);
    assert.deepEqual(made.map(m => m.id), [contributionId('claude', RUN1, 'MYC-20261029-001'), contributionId('codex', RUN2, 'MYC-20261029-002')]);
    assert.deepEqual(made[1].links, [`refines->${made[0].id}`, `tests->${seedNode}`]);
    const v = await verifyPlanned(adapter(pg, { readOnly: true }), planned);
    assert.deepEqual(v, { problems: [], redacted: [], rows: 6, nodes: 2, links: 3, stances: 1 });
    const after = await counts(db); assert.deepEqual(after, { n: before.n + 2, e: before.e + 3, a: before.a + 1 });
    await ingestBatch(db, MANIFEST, batch, snap.text, answers); assert.deepEqual(await counts(db), after);
    const [node] = await db.query('SELECT attributes, provenance FROM mycelium_memory.nodes WHERE id = $1', [made[0].id]);
    assert.equal(node.attributes.snapshot_sha256, snap.sha256); assert.equal(node.attributes.result_sha256, batch.items[0].result_sha256);
    assert.equal(node.attributes.bridge, MANIFEST.batch); assert.equal(node.attributes.model_written, true);
    assert.deepEqual(node.provenance.declared_by, { agent: 'claude-cli', run: RUN1 });
    const changed = answers[0].replace('official page', 'other page');
    const b2 = { ...batch, items: [{ ...batch.items[0], result_sha256: sha256(changed) }, batch.items[1]] };
    await assert.rejects(ingestBatch(db, MANIFEST, b2, snap.text, [changed, answers[1]]), /retry|identical|different/i);
    assert.deepEqual(await counts(db), after);
  } finally { await pg.close(); }
});

// A db wrapper that fails the FIRST transaction writing a given contribution id, before it commits or after it committed.
const faulty = (db, { id, after }) => { let hit = false; return { ...db, transaction: async ss => {
  const mine = !hit && JSON.stringify(ss).includes(id); if (mine) hit = true;
  if (mine && !after) throw new Error('fetch failed (injected, before commit)');
  const r = await db.transaction(ss); if (mine && after) throw new Error('fetch failed (injected, after commit)'); return r; } }; };

test('recovery: death between contributions, lost acknowledgement after commit, concurrent duplicates, restart elsewhere', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myc-s1-'));
  try {
    let { pg, db, snap, answers, batch } = await prepared({ dataDir: dir });
    const planned = planBatch(MANIFEST, batch, snap.text, answers), base = await counts(db);
    const final = { n: base.n + 2, e: base.e + 3, a: base.a + 1 }, second = planned[1].id;
    await assert.rejects(ingestBatch(faulty(db, { id: second, after: false }), MANIFEST, batch, snap.text, answers), /before commit/);
    assert.deepEqual(await counts(db), { n: base.n + 1, e: base.e + 1, a: base.a + 1 });              // died between: first only
    assert.equal((await verifyPlanned(db, planned)).problems.length, 3);                                // verify names every missing row
    await assert.rejects(ingestBatch(faulty(db, { id: second, after: true }), MANIFEST, batch, snap.text, answers), /after commit/);
    assert.deepEqual(await counts(db), final);                                                          // the commit landed; ack lost
    await Promise.all([ingestBatch(db, MANIFEST, batch, snap.text, answers), ingestBatch(db, MANIFEST, batch, snap.text, answers)]);
    assert.deepEqual(await counts(db), final);                                                          // concurrent duplicates: no-op
    await pg.close();
    const pg2 = new PGlite(dir), db2 = adapter(pg2);                                                    // "another host": fresh process state
    await ingestBatch(db2, MANIFEST, batch, snap.text, answers);
    assert.deepEqual(await counts(db2), final); assert.deepEqual((await verifyPlanned(db2, planned)).problems, []);
    await pg2.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runCli: seed -> snapshot -> ingest -> verify through files, READ ONLY where it should be; snapshot never overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myc-s1cli-'));
  const { pg } = await world();
  try {
    const opened = [];
    const open = async ({ readOnly }) => { opened.push(readOnly); return adapter(pg, { readOnly }); };
    const mf = join(dir, 'manifest.json'), sf = join(dir, 'snap.md'), bf = join(dir, 'batch.json'), r1 = join(dir, 'r1.md'), r2 = join(dir, 'r2.md');
    const mtext = JSON.stringify(MANIFEST); await writeFile(mf, mtext);
    const log = []; const orig = console.log; console.log = s => log.push(s);
    try {
      await runCli('seed', [mf], open); await runCli('snapshot', [mf, sf], open);
      await assert.rejects(runCli('snapshot', [mf, sf], open), /EEXIST/);
      const snap = await readFile(sf, 'utf8'), s = seedId(MANIFEST.batch), a = [claude(s), codex(s)];
      await writeFile(r1, a[0]); await writeFile(r2, a[1]);
      await writeFile(bf, JSON.stringify({ batch: MANIFEST.batch, commit: 'a'.repeat(40), manifest_sha256: sha256(mtext), snapshot_sha256: sha256(snap),
        items: [{ task: 'MYC-20261029-001', agent: 'claude', run: RUN1, descriptor_blob: 'b'.repeat(40), result_blob: 'c'.repeat(40), result_sha256: sha256(a[0]) },
                { task: 'MYC-20261029-002', agent: 'codex', run: RUN2, descriptor_blob: 'd'.repeat(40), result_blob: 'e'.repeat(40), result_sha256: sha256(a[1]) }] }));
      await assert.rejects(runCli('verify', [mf, bf, sf, r1, r2], open), /verification failed/);
      await runCli('ingest', [mf, bf, sf, r1, r2], open); await runCli('ingest', [mf, bf, sf, r1, r2], open);
      await runCli('verify', [mf, bf, sf, r1, r2], open);
      await writeFile(mf, mtext + ' ');
      await assert.rejects(runCli('ingest', [mf, bf, sf, r1, r2], open), /manifest bytes/);
    } finally { console.log = orig; }
    assert.ok(log.some(l => l.startsWith('SNAPSHOT OK')) && log.some(l => l.startsWith('VERIFY OK: 2 node(s), 3 link(s), 1 stance(s)')));
    assert.deepEqual(opened, [false, true, true, true, false, false, true]);   // seed, snapshot x2, verify, ingest x2, verify
  } finally { await pg.close(); await rm(dir, { recursive: true, force: true }); }
});

test('privileges: the bridge login passes ONLY with exactly the runtime capability; real refusals as that login', async () => {
  const { pg, db } = await world();
  try {
    const asBridge = async fn => { await pg.query(`SET SESSION AUTHORIZATION ${BRIDGE_ROLE}`); try { return await fn(); } finally { await pg.query('SET SESSION AUTHORIZATION postgres'); } };   // PGlite: RESET does not restore
    const NOW = Date.parse('2026-10-29T12:00:00Z');
    const ownerQ = async q => { await pg.query('SET SESSION AUTHORIZATION neondb_owner'); try { await pg.query(q); } finally { await pg.query('SET SESSION AUTHORIZATION postgres'); } };   // memberships are the owner's grants, as on Neon
    const check = () => asBridge(async () => principalProblems(await readPrivileges(adapter(pg, { readOnly: true })), BRIDGE_ROLE, { now: NOW }));
    assert.deepEqual(await check(), []);
    const ok = await asBridge(async () => assertPrincipal(await readPrivileges(db), BRIDGE_ROLE, { now: NOW }));
    assert.equal(ok.connlimit, 20); assert.ok(ok.valid_until);
    await asBridge(async () => {   // what the login can and cannot do, for real
      await pg.query(`INSERT INTO mycelium_memory.nodes(id, kind, title) VALUES ('33333333-3333-4333-8333-333333333333', 'probe', 'x')`);
      for (const sql of [`UPDATE mycelium_memory.nodes SET title = 'y'`, `DELETE FROM mycelium_memory.edges`, `TRUNCATE mycelium_memory.assessments`,
        `SELECT * FROM mycelium_memory.redaction_authorizations`, `SELECT mycelium_memory.redact('node', '33333333-3333-4333-8333-333333333333', 'x', '44444444-4444-4444-8444-444444444444')`,
        'CREATE SCHEMA evil', 'CREATE TABLE public.evil (x int)', 'CREATE TABLE mycelium_memory.evil (x int)', 'SET ROLE mycelium_memory_runtime',
        'SET ROLE mycelium_memory_redactor', 'SET ROLE neondb_owner', 'CREATE ROLE evil', 'CREATE DATABASE evil'])
        await assert.rejects(pg.query(sql), /permission denied|must be|not allowed|append-only|denied/i, sql);
    });
    const drift = async (grant, revoke, re) => { await pg.query(grant); try { const p = await check(); assert.ok(p.some(x => re.test(x)), `${grant}: ${p}`); } finally { await pg.query(revoke); } };
    await drift('GRANT UPDATE ON mycelium_memory.edges TO mycelium_memory_runtime', 'REVOKE UPDATE ON mycelium_memory.edges FROM mycelium_memory_runtime', /edges\.upd/);
    await drift('GRANT UPDATE (title) ON mycelium_memory.nodes TO mycelium_memory_runtime', 'REVOKE UPDATE (title) ON mycelium_memory.nodes FROM mycelium_memory_runtime', /col_upd/);
    await drift('GRANT TRUNCATE ON mycelium_memory.nodes TO mycelium_bridge_fpd_r2', 'REVOKE TRUNCATE ON mycelium_memory.nodes FROM mycelium_bridge_fpd_r2', /trunc/);
    await drift('GRANT mycelium_memory_redactor TO mycelium_bridge_fpd_r2', 'REVOKE mycelium_memory_redactor FROM mycelium_bridge_fpd_r2', /reachable roles|SECURITY DEFINER/);
    await drift('GRANT EXECUTE ON FUNCTION mycelium_memory.redact(text,uuid,text,uuid) TO mycelium_memory_runtime', 'REVOKE EXECUTE ON FUNCTION mycelium_memory.redact(text,uuid,text,uuid) FROM mycelium_memory_runtime', /SECURITY DEFINER/);
    await drift('GRANT CREATE ON SCHEMA public TO mycelium_bridge_fpd_r2', 'REVOKE CREATE ON SCHEMA public FROM mycelium_bridge_fpd_r2', /public\.create/);
    await drift('ALTER ROLE mycelium_bridge_fpd_r2 CREATEDB', 'ALTER ROLE mycelium_bridge_fpd_r2 NOCREATEDB', /createdb/);
    await drift('GRANT SELECT ON mycelium_memory.redaction_authorizations TO mycelium_bridge_fpd_r2', 'REVOKE SELECT ON mycelium_memory.redaction_authorizations FROM mycelium_bridge_fpd_r2', /redaction_authorizations/);
    await drift('ALTER TABLE mycelium_memory.schema_migrations OWNER TO mycelium_bridge_fpd_r2', 'ALTER TABLE mycelium_memory.schema_migrations OWNER TO postgres', /owns/);
    // login-level drift after setup (Codex R5): limit, expiry, membership options, grants of this login to others
    await drift('ALTER ROLE mycelium_bridge_fpd_r2 CONNECTION LIMIT -1', 'ALTER ROLE mycelium_bridge_fpd_r2 CONNECTION LIMIT 20', /connection limit/);
    await drift("ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL 'infinity'", "ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL '2026-12-31T23:59:59Z'", /no finite password expiry/);
    await drift("ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL '2027-06-01T00:00:00Z'", "ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL '2026-12-31T23:59:59Z'", /beyond the approved ceiling/);
    await drift("ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL '2026-10-01T00:00:00Z'", "ALTER ROLE mycelium_bridge_fpd_r2 VALID UNTIL '2026-12-31T23:59:59Z'", /expiry has passed/);
    await pg.query('CREATE ROLE helper NOLOGIN');
    await drift('GRANT mycelium_bridge_fpd_r2 TO helper', 'REVOKE mycelium_bridge_fpd_r2 FROM helper', /granted to other roles: .*helper/);
    // the creator's automatic grant is accepted ONLY as ADMIN-only (Neon, 29 Oct): with INHERIT or SET it fails
    await drift('GRANT mycelium_bridge_fpd_r2 TO neondb_owner WITH INHERIT TRUE', 'GRANT mycelium_bridge_fpd_r2 TO neondb_owner WITH INHERIT FALSE', /granted to other roles: neondb_owner\(admin=true,inherit=true/);
    await drift('GRANT mycelium_bridge_fpd_r2 TO neondb_owner WITH SET TRUE', 'GRANT mycelium_bridge_fpd_r2 TO neondb_owner WITH SET FALSE', /set=true/);
    await ownerQ('REVOKE mycelium_memory_runtime FROM mycelium_bridge_fpd_r2');
    await ownerQ('GRANT mycelium_memory_runtime TO mycelium_bridge_fpd_r2 WITH INHERIT TRUE, SET FALSE, ADMIN TRUE');
    assert.ok((await check()).some(x => /membership mycelium_memory_runtime\.admin=true/.test(x)));
    await ownerQ('REVOKE mycelium_memory_runtime FROM mycelium_bridge_fpd_r2');
    await ownerQ('GRANT mycelium_memory_runtime TO mycelium_bridge_fpd_r2 WITH INHERIT TRUE, SET TRUE');
    assert.ok((await check()).some(x => /settable/.test(x)));
    await ownerQ('REVOKE mycelium_memory_runtime FROM mycelium_bridge_fpd_r2'); await ownerQ('GRANT mycelium_memory_runtime TO mycelium_bridge_fpd_r2 WITH INHERIT TRUE, SET FALSE');
    await pg.query('CREATE SCHEMA neon_auth'); await pg.query('CREATE TABLE neon_auth."user" (id int)');
    assert.deepEqual(await check(), []);                                           // a schema it cannot reach is not reported at all
    await pg.query('GRANT USAGE ON SCHEMA neon_auth TO PUBLIC');
    assert.deepEqual(await check(), []);                                           // bare USAGE, no grants: allowed, but reported
    assert.deepEqual((await asBridge(async () => assertPrincipal(await readPrivileges(db), BRIDGE_ROLE, { now: NOW }))).other_schema_usage.sort(), ['neon_auth', 'public']);
    await pg.query('GRANT SELECT ON neon_auth."user" TO PUBLIC');
    assert.ok((await check()).some(x => /neon_auth/.test(x)));
    assert.deepEqual(principalProblems({ identity: { role: BRIDGE_ROLE, session: BRIDGE_ROLE } }, BRIDGE_ROLE, { now: NOW }).filter(x => /missing/.test(x)).length > 5, true);   // absent fields fail
    await assert.rejects(bridgeGuard(db), /not exactly least-privilege/);   // the production guard refuses a superuser session
  } finally { await pg.close(); }
});

test('bridge provisioning: create bound to a grant with expiry ceiling; rotate only ours and open; disable closes and revokes', async () => {
  const { pg, db } = await world({ bridge: false });
  const PW = 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q', PW2 = 'Zm3_kQ8v-Rt5nWx2Lb7pYc4dHf9gJs6aEu1oKi0q';
  const G = '6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b', OTHER = '7a2d3c9f-4e5b-4f60-8b1c-2d3e4f5a6b7c', U = '2026-12-31T23:59:59Z', NOW = Date.parse('2026-10-29T12:00:00Z');
  try {
    const asOwner = async ss => { await pg.query('SET SESSION AUTHORIZATION neondb_owner'); try { return await db.transaction(ss); } finally { await pg.query('SET SESSION AUTHORIZATION postgres'); } };   // as on Neon
    const read = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    assert.throws(() => validUntil('2027-01-31T00:00:00Z', NOW), /ceiling/); assert.throws(() => validUntil('2026-01-01T00:00:00Z', NOW), /past/);
    assert.throws(() => createLoginStatements("x'; DROP", G, U), /valid generated/);
    // created AS neondb_owner (CREATEROLE, not superuser), exactly as on Neon: PostgreSQL adds the creator's ADMIN-only grant
    await asOwner(createLoginStatements(PW, G, U));
    const st = await read();
    assert.deepEqual(st.memberships.filter(m => m.role === BRIDGE_ROLE).map(m => [m.member, m.admin_option, m.inherit_option, m.set_option]), [['neondb_owner', true, false, false]]);
    assertBridgeLogin(st, G, NOW); assert.equal(ownership(st, OTHER), 'foreign');   // the 29 Oct live refusal, now accepted
    await pg.query('CREATE ROLE helper2 NOLOGIN'); await pg.query(`GRANT ${BRIDGE_ROLE} TO helper2`);
    assert.throws(() => assertBridgeLogin(Object.freeze({ ...st, memberships: [...st.memberships, { role: BRIDGE_ROLE, member: 'helper2', admin_option: false, inherit_option: true, set_option: false }] }), G, NOW), /not in the approved/);
    await pg.query(`REVOKE ${BRIDGE_ROLE} FROM helper2`);
    await pg.query(`GRANT ${BRIDGE_ROLE} TO neondb_owner WITH INHERIT TRUE`);
    assert.throws(() => assertBridgeLogin(Promise.resolve() && st && { ...st, memberships: st.memberships.map(m => m.role === BRIDGE_ROLE ? { ...m, inherit_option: true } : m) }, G, NOW), /not in the approved/);
    await pg.query(`GRANT ${BRIDGE_ROLE} TO neondb_owner WITH INHERIT FALSE`);
    assertBridgeLogin(await read(), G, NOW);
    await assert.rejects(asOwner(createLoginStatements(PW, G, U)), /already exists/);
    await assert.rejects(asOwner(rotateLoginStatements(PW2, OTHER, U)), /not created under this grant/);
    await assert.rejects(asOwner(disableLoginStatements(OTHER)), /not created under this grant/);
    await asOwner(rotateLoginStatements(PW2, G, '2026-12-01T00:00:00Z'));
    assertBridgeLogin(await read(), G, NOW);
    assert.equal(new Date((await read()).roles.find(r => r.rolname === BRIDGE_ROLE).rolvaliduntil).toISOString(), '2026-12-01T00:00:00.000Z');
    await asOwner(disableLoginStatements(G)); await asOwner(disableLoginStatements(G));   // idempotent
    const closed = await read(); assertBridgeClosed(closed, G); assert.throws(() => assertBridgeLogin(closed, G, NOW));
    assert.ok(new Date(closed.roles.find(r => r.rolname === BRIDGE_ROLE).rolvaliduntil).getTime() < NOW);
    await assert.rejects(asOwner(rotateLoginStatements(PW, G, U)), /closed; rotation does not reopen/);
  } finally { await pg.close(); }
});

test('R3: a second answer that fails the append API payload validation (credential pattern) writes NOTHING', async () => {
  const { pg, db, snap, answers, batch, seedNode } = await prepared();
  try {
    const before = await counts(db);
    const bad = block({ kind: 'hypothesis', title: 'leaks', body: 'token ghp_' + 'A'.repeat(36), links: [{ to: seedNode, relation: 'tests' }], stances: [] });
    const b = { ...batch, items: [batch.items[0], { ...batch.items[1], result_sha256: sha256(bad) }] };
    assert.throws(() => planBatch(MANIFEST, b, snap.text, [answers[0], bad]), /credential pattern/);   // refused while planning
    await assert.rejects(ingestBatch(db, MANIFEST, b, snap.text, [answers[0], bad]), /credential pattern/);
    assert.deepEqual(await counts(db), before);
    const big = block({ kind: 'k'.repeat(81), title: 't', body: 'b', links: [{ to: seedNode, relation: 'r' }] });
    assert.throws(() => planBatch(MANIFEST, { ...batch, items: [batch.items[0], { ...batch.items[1], result_sha256: sha256(big) }] }, snap.text, [answers[0], big]), /kind/);
  } finally { await pg.close(); }
});

test('R4: verification compares EVERY persisted field with the pinned payload; redaction is reported, never exact', async () => {
  const { pg, db, snap, answers, batch } = await prepared();
  try {
    await ingestBatch(db, MANIFEST, batch, snap.text, answers);
    const ro = adapter(pg, { readOnly: true });
    assert.deepEqual((await verifyPlanned(ro, planBatch(MANIFEST, batch, snap.text, answers))).problems, []);
    const otherBody = answers[0].replace('Check the official page.', 'A different body.');
    const b1 = { ...batch, items: [{ ...batch.items[0], result_sha256: sha256(otherBody) }, batch.items[1]] };
    assert.ok((await verifyPlanned(ro, planBatch(MANIFEST, b1, snap.text, [otherBody, answers[1]]))).problems.some(x => /node .* differs/.test(x)));       // body
    const b2 = { ...batch, commit: 'f'.repeat(40) };
    const p2 = (await verifyPlanned(ro, planBatch(MANIFEST, b2, snap.text, answers))).problems;
    assert.ok(p2.some(x => /node .* differs/.test(x)) && p2.some(x => /edge .* differs/.test(x)) === false);   // binding attributes are on nodes
    const otherRel = answers[1].replace('"tests"', '"probes"');
    const b3 = { ...batch, items: [batch.items[0], { ...batch.items[1], result_sha256: sha256(otherRel) }] };
    assert.ok((await verifyPlanned(ro, planBatch(MANIFEST, b3, snap.text, [answers[0], otherRel]))).problems.some(x => /edge .* differs/.test(x)));       // edge relation
    const planned = planBatch(MANIFEST, batch, snap.text, answers);
    await db.query(`SELECT mycelium_memory.redact('node', $1, 'owner_request', '55555555-5555-4555-8555-555555555555')`, [planned[0].id]);
    const v = await verifyPlanned(ro, planned);
    assert.deepEqual(v.redacted, [`node ${planned[0].id}`]); assert.ok(v.problems.some(x => /redacted \(not exact/.test(x)));
  } finally { await pg.close(); }
});
