import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connect } from '../src/connection.mjs';
import { migrate } from '../src/schema.mjs';
import { nodeInsert, edgeInsert, createMemory } from '../src/memory.mjs';

const mode = process.argv[2];
try {
  if (!['check', 'migrate', 'smoke-write', 'smoke-read'].includes(mode)) throw new Error('Unknown command.');
  if (['migrate', 'smoke-write'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') {
    throw new Error('Remote schema/data changes require MYCELIUM_REMOTE_WRITES_APPROVED=yes after owner approval.');
  }
  const db = await connect();
  if (mode === 'check') {
    await db.query('SELECT 1 AS connected');
    console.log('Authenticated HTTPS database connection passed. No schema/data writes.');
  } else if (mode === 'migrate') {
    console.log(`Mycelium-only schema migration ${await migrate(db)}.`);
  } else if (mode === 'smoke-write') {
    const discovery = randomUUID(), result = randomUUID(), edge = randomUUID();
    const proof = { discovery, result, edge };
    // Save the manifest first so an uncertain network outcome can be reconciled by a read, not a blind retry.
    await mkdir(new URL('../.smoke/', import.meta.url), { recursive: true, mode: 0o700 });
    const file = new URL('../.smoke/proof.json', import.meta.url);
    await writeFile(file, JSON.stringify(proof), { flag: 'wx', mode: 0o600 });
    await db.transaction([
      nodeInsert({ id: discovery, kind: 'discovery', title: 'Synthetic connectivity proof', provenance: { synthetic: true } }),
      nodeInsert({ id: result, kind: 'learned_result', title: 'Synthetic committed memory', attributes: { outcome: 'observed' }, provenance: { synthetic: true } }),
      edgeInsert({ id: edge, source: discovery, target: result, relation: 'supports', provenance: { synthetic: true } })
    ]);
    console.log('Committed two synthetic nodes and one edge; rerun smoke-read in a fresh process.');
  } else {
    const p = JSON.parse(await readFile(new URL('../.smoke/proof.json', import.meta.url), 'utf8'));
    const memory = createMemory(db);
    const a = await memory.getNode(p.discovery), b = await memory.getNode(p.result);
    const edges = await memory.connections(p.discovery);
    if (a?.kind !== 'discovery' || b?.kind !== 'learned_result' || !edges.some(e => e.id === p.edge && e.target_id === p.result)) {
      throw new Error('Persistent proof does not match; reconcile before any retry.');
    }
    console.log('Fresh-process read verified both committed nodes and their relationship.');
  }
} catch {
  // Database/HTTP exceptions can include connection configuration or SQL data. Do not print raw error objects.
  console.error('Mycelium database check failed. No credential details logged; inspect local configuration and approved target.');
  process.exitCode = 1;
}
