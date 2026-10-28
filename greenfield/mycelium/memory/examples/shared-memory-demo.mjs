// Deterministic OFFLINE demo of shared explorer memory. FAKE fixtures: no model, no Claude/Codex CLI, no network, no Neon.
// Explorer A and explorer B run as SEPARATE processes against one persisted local PostgreSQL (PGlite) data directory.
//   node examples/shared-memory-demo.mjs            runs A then B in fresh processes and prints what B reused from A
//   node examples/shared-memory-demo.mjs <dir> A|B   one explorer only (used by the driver and the tests)
import { PGlite } from '@electric-sql/pglite';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../src/schema.mjs';
import { explorerA, explorerB } from './fixtures.mjs';

const adapter = pg => ({ query: async (s, p = []) => (await pg.query(s, p)).rows,
  transaction: ss => pg.transaction(async tx => { const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; }) });

const [dir, who] = process.argv.slice(2);
if (dir && who) {
  const pg = new PGlite(dir), db = adapter(pg);
  try {
    await migrate(db);
    console.log(JSON.stringify({ explorer: who, pid: process.pid, ...(who === 'A' ? await explorerA(db) : await explorerB(db)) }));
  } finally { await pg.close(); }
} else {
  const d = await mkdtemp(join(tmpdir(), 'mycelium-shared-demo-')), me = fileURLToPath(import.meta.url);
  try {
    for (const w of ['A', 'B']) {
      const r = spawnSync(process.execPath, [me, d, w], { encoding: 'utf8' });
      if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
      console.log(r.stdout.trim());
    }
  } finally { await rm(d, { recursive: true, force: true }); }
}
