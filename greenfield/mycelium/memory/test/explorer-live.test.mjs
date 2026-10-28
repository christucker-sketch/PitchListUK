// Offline tests for the PROPOSED live explorer proof: trial password rules, least-privilege login provisioning and the live steps,
// all on PGlite (PostgreSQL 18.6). No Neon, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';
import { target } from '../src/preflight.mjs';
import { createLoginStatements, disableLoginStatements, membershipQueries, EXPLORER_ROLE, assertExplorerLogin, assertExplorerClosed,
  assertExplorerAbsent, ownership, assertTrialPassword, describeError } from '../scripts/explorer-provision.mjs';
import { randomUUID } from 'node:crypto';
import { assertExplorerTarget, assertLeastPrivilege, whoamiQueries, footprintQueries, LIVE } from '../scripts/explorer-live.mjs';
import { explorerA, explorerB } from '../examples/fixtures.mjs';

const adapter = pg => ({ query: async (s, p = []) => (await pg.query(s, p)).rows,
  transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) });
const counts = async db => (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS n,
  (SELECT count(*) FROM mycelium_memory.edges)::int AS e, (SELECT count(*) FROM mycelium_memory.assessments)::int AS a`))[0];
const PW = 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q';   // the shape setup generates: 40 base64url chars
const ATT = '6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b';

test('trial password rules: Neon needs plain text; only a generated URL-safe password passes; errors are scrubbed', () => {
  assert.equal(assertTrialPassword(PW), PW);
  for (const bad of ['SCRAM-SHA-256$4096:abc', 'short1A', PW + "'", 'a'.repeat(40), PW.replace(/[0-9]/g, 'x'), 'Qx7aaab' + PW.slice(7)])
    assert.throws(() => assertTrialPassword(bad), /valid generated trial password/);
  const e = Object.assign(new Error(`password "${PW}" rejected near postgresql://u:${PW}@h/db`), { code: '22023' });
  const d = describeError(e, PW);
  assert.ok(d.startsWith('SQLSTATE 22023:') && !d.includes(PW) && !d.includes('postgresql://'));
});

async function world() {
  const pg = new PGlite(), db = adapter(pg); await migrate(db);
  await db.query('CREATE ROLE neondb_owner NOLOGIN');
  const g = await readFile(new URL('../sql/runtime_grants.sql', import.meta.url), 'utf8');
  await db.transaction(g.split('-- statement').map(t => ({ text: t.trim() })).filter(s => s.text));
  return { pg, db };
}

test('create-login: PostgreSQL stores a hash of the plain-text password; inherited runtime membership only; refuses bad input and reruns', async () => {
  const { pg, db } = await world();
  try {
    assert.throws(() => createLoginStatements('SCRAM-SHA-256$4096:x', ATT), /valid generated trial password/);   // Neon rejects hashes
    assert.throws(() => createLoginStatements(PW + "'; DROP ROLE x; --", ATT), /valid generated trial password/);
    await db.transaction(createLoginStatements(PW, ATT));
    const [{ rolpassword }] = await db.query('SELECT rolpassword FROM pg_authid WHERE rolname=$1', [EXPLORER_ROLE]);
    assert.ok(rolpassword.startsWith('SCRAM-SHA-256$') && !rolpassword.includes(PW));   // stored hashed by the server
    const rs = await db.transaction(membershipQueries);
    const role = rs[1].find(r => r.rolname === EXPLORER_ROLE);
    assert.deepEqual({ login: role.rolcanlogin, superuser: role.rolsuper, createrole: role.rolcreaterole, limit: role.rolconnlimit },
      { login: true, superuser: false, createrole: false, limit: 2 });
    const m = rs[2].filter(x => x.member === EXPLORER_ROLE);
    assert.deepEqual(m.map(x => [x.role, x.admin_option, x.inherit_option, x.set_option]), [['mycelium_memory_runtime', false, true, false]]);
    await assert.rejects(db.transaction(createLoginStatements(PW, ATT)), /already exists/);
    await db.transaction(disableLoginStatements(ATT));
    const after = await db.transaction(membershipQueries);
    assert.equal(after[1].find(r => r.rolname === EXPLORER_ROLE).rolcanlogin, false);
    assert.equal(after[2].filter(x => x.member === EXPLORER_ROLE).length, 0);
  } finally { await pg.close(); }
});

test('live steps as the explorer login: least-privilege check passes, A then B share memory, reruns write nothing', async () => {
  const { pg, db } = await world();
  try {
    await db.transaction(createLoginStatements(PW, ATT));
    await db.query(`SET ROLE ${EXPLORER_ROLE}`);
    const [w] = (await db.transaction(whoamiQueries))[1];
    assert.doesNotThrow(() => assertLeastPrivilege(w));
    assert.deepEqual({ append: w.can_append, mutate: w.can_mutate, redact: w.can_redact, capability: w.can_see_capability, schema: w.can_create_schema },
      { append: true, mutate: false, redact: false, capability: false, schema: false });
    const opts = { synthetic: true };
    const a = await explorerA(db, { ...opts, run: LIVE.aRun });
    const b = await explorerB(db, { ...opts, run: LIVE.bRun, aRun: LIVE.aRun });
    assert.ok(b.reusedFromA.includes(a.finding) && b.reusedFromA.includes(a.failure));
    assert.deepEqual(await counts(db), { n: 6, e: 6, a: 2 });          // the exact bounded footprint of the live proof
    await explorerA(db, { ...opts, run: LIVE.aRun }); await explorerB(db, { ...opts, run: LIVE.bRun, aRun: LIVE.aRun });
    assert.deepEqual(await counts(db), { n: 6, e: 6, a: 2 });          // reruns are no-ops
    const synthetic = await db.query("SELECT count(*)::int AS n FROM mycelium_memory.nodes WHERE kind IN ('discovery','failed_experiment','cross_branch_result') AND attributes->>'synthetic' = 'true'");
    assert.equal(synthetic[0].n, 3);
    const tagged = (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes WHERE attributes->>'synthetic'='true')::int AS n,
      (SELECT count(*) FROM mycelium_memory.edges WHERE attributes->>'synthetic'='true')::int AS e,
      (SELECT count(*) FROM mycelium_memory.assessments WHERE assessor = $1)::int AS a`, [`fixture-explorer-b/${LIVE.bRun}`]))[0];
    assert.deepEqual(tagged, { n: 6, e: 6, a: 2 });                    // all 14 rows identifiable
    await db.query('RESET ROLE');
    await db.query('GRANT ALL ON SCHEMA mycelium_memory TO neondb_owner');
    await db.query('GRANT ALL ON ALL TABLES IN SCHEMA mycelium_memory TO neondb_owner');
    await db.query('SET ROLE neondb_owner');                           // an owner-like role is refused, not used
    const [o] = (await db.transaction(whoamiQueries))[1];
    assert.throws(() => assertLeastPrivilege(o), /not least-privilege/);
    await db.query('RESET ROLE');
  } finally { await pg.close(); }
});

test('explorer target guard: pinned host/database and the explorer login only', () => {
  const url = (user, host = target.endpointHost, dbn = target.database) => `postgresql://${user}:x@${host}/${dbn}?sslmode=require`;
  const env = u => ({ MYCELIUM_DATABASE_URL: u, MYCELIUM_DATABASE_HOST: new URL(u).hostname, MYCELIUM_DATABASE_NAME: decodeURIComponent(new URL(u).pathname.slice(1)) });
  assert.doesNotThrow(() => assertExplorerTarget(env(url(EXPLORER_ROLE))));
  assert.throws(() => assertExplorerTarget(env(url('neondb_owner'))), /explorer login/);
  assert.throws(() => assertExplorerTarget(env(url(EXPLORER_ROLE, 'ep-other.neon.tech'))), /inspected target/);
  assert.throws(() => assertExplorerTarget(env(url(EXPLORER_ROLE, target.endpointHost, 'otherdb'))), /inspected target/);
});

test('owner close is safe in every state; verify-login / verify-closed fail closed', async () => {
  const { pg, db } = await world();
  try {
    const state = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    await db.transaction(disableLoginStatements(ATT));                          // role absent: no error
    assertExplorerClosed(await state(), ATT);
    assert.throws(() => assertExplorerLogin({ roles: [], memberships: [] }, ATT), /approved least-privilege/);
    await db.transaction(createLoginStatements(PW, ATT));
    assertExplorerLogin(await state(), ATT);
    assert.throws(() => assertExplorerClosed({ roles: [{ rolname: EXPLORER_ROLE, rolcanlogin: true, comment: `mycelium-explorer-trial ${ATT}` }], memberships: [] }, ATT), /still active/);
    await db.query(`GRANT mycelium_memory_redactor TO ${EXPLORER_ROLE}`);   // any extra membership is refused
    const extra = await state();
    assert.throws(() => assertExplorerLogin(extra, ATT), /approved least-privilege/);
    await db.query(`REVOKE mycelium_memory_redactor FROM ${EXPLORER_ROLE}`);
    await db.transaction(disableLoginStatements(ATT)); await db.transaction(disableLoginStatements(ATT));   // twice: idempotent
    assertExplorerClosed(await state(), ATT);
  } finally { await pg.close(); }
});

test('footprint receipt: before/after delta is exactly the trial rows and existing rows are preserved', async () => {
  const { pg, db } = await world();
  try {
    await db.query("INSERT INTO mycelium_memory.nodes (id, kind) VALUES (gen_random_uuid(), 'pre-existing')");
    await db.transaction(createLoginStatements(PW, ATT));
    await db.query(`SET ROLE ${EXPLORER_ROLE}`);
    const fp = async () => (await db.transaction(footprintQueries))[1][0];
    const before = await fp();
    await explorerA(db, { synthetic: true, run: LIVE.aRun }); await explorerB(db, { synthetic: true, run: LIVE.bRun, aRun: LIVE.aRun });
    const after = await fp();
    assert.deepEqual([after.nodes_total - before.nodes_total, after.edges_total - before.edges_total, after.assessments_total - before.assessments_total], [6, 6, 2]);
    assert.deepEqual([after.trial_nodes, after.trial_edges, after.trial_assessments], [6, 6, 2]);
    assert.equal(before.nodes_total, 1);
    await db.query('RESET ROLE');
  } finally { await pg.close(); }
});

test('R3c: a pre-existing or foreign role of the same name is refused and never changed; only this attempt is closed', async () => {
  const { pg, db } = await world();
  try {
    const state = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    // someone else's login of the same name, with runtime membership
    await db.query(`CREATE ROLE ${EXPLORER_ROLE} LOGIN CONNECTION LIMIT 5`);
    await db.query(`GRANT mycelium_memory_runtime TO ${EXPLORER_ROLE}`);
    const before = JSON.stringify(await state());
    assert.throws(() => assertExplorerAbsent({ roles: (JSON.parse(before)).roles }), /already exists/);   // baseline refuses
    assert.equal(ownership(JSON.parse(before), ATT), 'foreign');
    await assert.rejects(db.transaction(createLoginStatements(PW, ATT)), /already exists/);
    await assert.rejects(db.transaction(disableLoginStatements(ATT)), /not created by this trial/);   // defensive close refuses
    assert.throws(() => assertExplorerClosed(JSON.parse(before), ATT), /not this trial/);
    assert.equal(JSON.stringify(await state()), before);                                             // byte-identical: untouched
    // a role created by a DIFFERENT attempt is also foreign to this one
    await db.query(`DROP ROLE ${EXPLORER_ROLE}`);
    const other = randomUUID();
    await db.transaction(createLoginStatements(PW, other));
    assert.equal(ownership(await state(), ATT), 'foreign'); assert.equal(ownership(await state(), other), 'ours');
    await assert.rejects(db.transaction(disableLoginStatements(ATT)), /not created by this trial/);
    assert.equal((await state()).roles.find(r => r.rolname === EXPLORER_ROLE).rolcanlogin, true);
    await db.transaction(disableLoginStatements(other));
    assertExplorerClosed(await state(), other);
    assert.throws(() => createLoginStatements(PW, 'not-a-uuid'), /UUID/);
    assert.throws(() => disableLoginStatements('6F1C2B8E-3D4A-4E5F-9A0B-1C2D3E4F5A6B'), /UUID/);
  } finally { await pg.close(); }
});

test('R3c: uncertain create is reconciled read-only: absent -> nothing to close; ours -> close; the binding is atomic', async () => {
  const { pg, db } = await world();
  try {
    const state = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    // a create that fails part-way leaves NOTHING (existence check, create, comment and grant are one transaction)
    const st = createLoginStatements(PW, ATT);
    await assert.rejects(db.transaction([...st, { text: 'SELECT 1/0' }]), /division by zero/);
    assert.equal(ownership(await state(), ATT), 'absent');
    await db.transaction(disableLoginStatements(ATT));                    // nothing to close: no-op, no error
    assertExplorerClosed(await state(), ATT);
    // a create whose outcome the caller never saw: the comment proves it is ours, so close is safe
    await db.transaction(st);
    assert.equal(ownership(await state(), ATT), 'ours');
    assertExplorerLogin(await state(), ATT);
    await db.transaction(disableLoginStatements(ATT));
    assertExplorerClosed(await state(), ATT);
  } finally { await pg.close(); }
});
