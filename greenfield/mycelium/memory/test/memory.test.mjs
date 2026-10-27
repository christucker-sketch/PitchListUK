import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';
import { createMemory } from '../src/memory.mjs';
import { connectionSettings } from '../src/connection.mjs';

function adapter(pg) {
  return { query: async (s, p = []) => (await pg.query(s, p)).rows,
    transaction: statements => pg.transaction(async tx => {
      const out = []; for (const s of statements) out.push((await tx.query(s.text, s.values ?? [])).rows); return out;
    }) };
}

test('target guard rejects inherited app URL, missing password, wrong host and insecure configuration', () => {
  assert.throws(() => connectionSettings({ DATABASE_URL: 'postgresql://other' }));
  const env = { MYCELIUM_DATABASE_URL: 'postgresql://user:example@ep-memory.neon.tech/neondb?sslmode=require',
    MYCELIUM_DATABASE_HOST: 'ep-memory.neon.tech', MYCELIUM_DATABASE_NAME: 'neondb' };
  assert.ok(connectionSettings(env));
  for (const url of ['postgresql://user@ep-memory.neon.tech/neondb?sslmode=require',
    'postgresql://user:example@ep-other.neon.tech/neondb?sslmode=require',
    'postgresql://user:example@ep-memory.neon.tech/neondb?sslmode=disable']) {
    assert.throws(() => connectionSettings({ ...env, MYCELIUM_DATABASE_URL: url }));
  }
});

test('real local PostgreSQL: flexible branching, merging, contradictions, SQL parameters and durable reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mycelium-memory-'));
  let pg;
  try {
    pg = new PGlite(dir); let db = adapter(pg); let memory = createMemory(db);
    assert.equal(await migrate(db), 'applied');
    assert.equal(await migrate(db), 'already applied');
    const root = await memory.appendNode({ kind: 'discovery', title: "x'); DROP SCHEMA public; --", provenance: { source: 'synthetic:test' } });
    const a = await memory.appendNode({ kind: 'branch', attributes: { direction: 'unanticipated A' } });
    const b = await memory.appendNode({ kind: 'experiment', attributes: { outcome: 'failed', learning: 'retained' } });
    const result = await memory.appendNode({ kind: 'new_unprescribed_kind', body: 'Recombined learning' });
    for (const [source, target, relation] of [[root,a,'spawns'],[root,b,'spawns'],[a,result,'supports'],[b,result,'contradicts'],[result,root,'revisits']]) {
      await memory.appendEdge({ source, target, relation, provenance: { synthetic: true } });
    }
    assert.equal((await memory.connections(root)).length, 3);
    assert.equal((await memory.getNode(b)).attributes.outcome, 'failed');
    await assert.rejects(memory.appendEdge({ source: root, target: randomUUID(), relation: 'dangling' }));
    await assert.rejects(memory.appendNode({ id: root, kind: 'overwrite' }));
    await assert.rejects(memory.appendNode({ kind: 'invalid', attributes: [] }));
    await pg.close(); pg = new PGlite(dir); db = adapter(pg); memory = createMemory(db);
    assert.equal((await memory.getNode(result)).body, 'Recombined learning');
    assert.equal((await memory.getNode(root)).provenance.source, 'synthetic:test');
    assert.equal((await memory.connections(root)).length, 3);
    const before = (await db.query('SELECT count(*)::int AS n FROM mycelium_memory.nodes'))[0].n;
    await assert.rejects(db.transaction([{ text: 'INSERT INTO mycelium_memory.nodes (id,kind) VALUES ($1,$2)', values: [randomUUID(),'rollback'] },
      { text: 'INSERT INTO mycelium_memory.edges (id,source_id,target_id,relation) VALUES ($1,$2,$3,$4)', values: [randomUUID(),root,randomUUID(),'missing'] }]));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mycelium_memory.nodes'))[0].n, before);
    await db.query("UPDATE mycelium_memory.schema_migrations SET checksum='unexpected'");
    await assert.rejects(migrate(db), /checksum/);
  } finally { await pg?.close(); await rm(dir, { recursive: true, force: true }); }
});
