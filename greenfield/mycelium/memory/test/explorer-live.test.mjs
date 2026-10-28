// Offline tests for the PROPOSED live explorer proof: SCRAM verifier, least-privilege login provisioning and the live steps,
// all on PGlite (PostgreSQL 18.6). No Neon, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';
import { target } from '../src/preflight.mjs';
import { scramKeys, deriveKeys, scramVerifier, VERIFIER_RE } from '../scripts/scram-verifier.mjs';
import { createLoginStatements, disableLoginStatements, membershipQueries, EXPLORER_ROLE } from '../scripts/explorer-provision.mjs';
import { assertExplorerTarget, assertLeastPrivilege, whoamiQueries, LIVE } from '../scripts/explorer-live.mjs';
import { explorerA, explorerB } from '../examples/fixtures.mjs';

const adapter = pg => ({ query: async (s, p = []) => (await pg.query(s, p)).rows,
  transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) });
const counts = async db => (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS n,
  (SELECT count(*) FROM mycelium_memory.edges)::int AS e, (SELECT count(*) FROM mycelium_memory.assessments)::int AS a`))[0];
const PW = 'Zm9vYmFyYmF6cXV4cXV1eHF1dXo0Mg+/AbC';

test('SCRAM-SHA-256 matches the RFC 7677 test vector', () => {
  // RFC 7677 section 3: user "user", password "pencil" (below our length floor, so keys are derived directly).
  const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
  const auth = 'n=user,r=rOprNGfwEbeRWgbNEkqO,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
  const k = deriveKeys('pencil', salt);
  const sig = createHmac('sha256', k.storedKey).update(auth).digest();
  const proof = Buffer.from(k.clientKey.map((b, i) => b ^ sig[i]));
  assert.equal(proof.toString('base64'), 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=');
  assert.equal(createHmac('sha256', k.serverKey).update(auth).digest('base64'), '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
  assert.match(scramVerifier(PW), VERIFIER_RE);
  assert.throws(() => scramKeys('pencil', salt), /24-256/);          // our own floor for generated passwords
});

async function world() {
  const pg = new PGlite(), db = adapter(pg); await migrate(db);
  await db.query('CREATE ROLE neondb_owner NOLOGIN');
  const g = await readFile(new URL('../sql/runtime_grants.sql', import.meta.url), 'utf8');
  await db.transaction(g.split('-- statement').map(t => ({ text: t.trim() })).filter(s => s.text));
  return { pg, db };
}

test('create-login: only the verifier is sent and stored; inherited runtime membership only; refuses plaintext and reruns', async () => {
  const { pg, db } = await world();
  try {
    const v = scramVerifier(PW);
    assert.throws(() => createLoginStatements(PW), /plaintext/);
    assert.throws(() => createLoginStatements(v + "'; DROP ROLE x; --"), /plaintext/);
    for (const s of createLoginStatements(v)) assert.ok(!s.text.includes(PW));
    await db.transaction(createLoginStatements(v));
    const [{ rolpassword }] = await db.query('SELECT rolpassword FROM pg_authid WHERE rolname=$1', [EXPLORER_ROLE]);
    assert.equal(rolpassword, v);                                     // PostgreSQL stored the verifier as given
    const rs = await db.transaction(membershipQueries);
    const role = rs[1].find(r => r.rolname === EXPLORER_ROLE);
    assert.deepEqual({ login: role.rolcanlogin, superuser: role.rolsuper, createrole: role.rolcreaterole, limit: role.rolconnlimit },
      { login: true, superuser: false, createrole: false, limit: 2 });
    const m = rs[2].filter(x => x.member === EXPLORER_ROLE);
    assert.deepEqual(m.map(x => [x.role, x.admin_option, x.inherit_option, x.set_option]), [['mycelium_memory_runtime', false, true, false]]);
    await assert.rejects(db.transaction(createLoginStatements(scramVerifier(PW))), /already exists/);
    await db.transaction(disableLoginStatements);
    const after = await db.transaction(membershipQueries);
    assert.equal(after[1].find(r => r.rolname === EXPLORER_ROLE).rolcanlogin, false);
    assert.equal(after[2].filter(x => x.member === EXPLORER_ROLE).length, 0);
  } finally { await pg.close(); }
});

test('live steps as the explorer login: least-privilege check passes, A then B share memory, reruns write nothing', async () => {
  const { pg, db } = await world();
  try {
    await db.transaction(createLoginStatements(scramVerifier(PW)));
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
