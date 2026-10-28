import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connect } from '../src/connection.mjs';
import { migrate } from '../src/schema.mjs';
import { assertMigrationCatalog, assertDeploymentTarget } from '../src/preflight.mjs';
import { nodeInsert, edgeInsert, createMemory } from '../src/memory.mjs';

const mode = process.argv[2];
try {
  if (!['check', 'inspect', 'migrate', 'roles', 'smoke-write', 'smoke-read'].includes(mode)) throw new Error('Unknown command.');
  if (['migrate', 'roles', 'smoke-write'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') {
    throw new Error('Remote schema/data changes require MYCELIUM_REMOTE_WRITES_APPROVED=yes after owner approval.');
  }
  assertDeploymentTarget(process.env);
  const db = await connect();
  if (mode === 'inspect') {
    const result = await db.transaction([
      { text: 'SET TRANSACTION READ ONLY' },
      { text: "SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS version" },
      { text: "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name" },
      { text: "SELECT to_regclass('mycelium_memory.schema_migrations')::text AS ledger" }
    ]);
    if(result[1][0].database !== 'neondb') throw new Error('Wrong database.');
    console.log(JSON.stringify({ identity: result[1], tables: result[2], ledger: result[3] },null,2));
    if(result[3][0].ledger) console.log(JSON.stringify(await db.transaction([
      {text:'SET TRANSACTION READ ONLY'}, {text:'SELECT version,checksum FROM mycelium_memory.schema_migrations ORDER BY version'}
    ])));
  } else if (mode === 'roles') {
    const source = await readFile(new URL('../sql/runtime_grants.sql', import.meta.url), 'utf8');
    await db.transaction(source.split('-- statement').map(text=>({text:text.trim()})).filter(s=>s.text));
    console.log('Created two Mycelium-only NOLOGIN roles and explicit grants. No credential/login change or dispatch.');
  } else if (mode === 'check') {
    await db.query('SELECT 1 AS connected');
    console.log('Authenticated HTTPS database connection passed. No schema/data writes.');
  } else if (mode === 'migrate') {
    const foreign = await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','mycelium_memory')");
    assertMigrationCatalog(foreign);
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
