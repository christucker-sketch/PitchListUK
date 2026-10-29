// Offline test helpers: a PGlite db adapter shaped like src/connection.mjs (incl. its READ ONLY mode) and a world with the
// real migrations, the real runtime grants and the Stage One bridge login. No network, no Neon, no model.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';

export const adapter = (pg, { readOnly = false } = {}) => ({
  readOnly,
  query: readOnly
    ? (s, p = []) => pg.transaction(async tx => { await tx.query('SET TRANSACTION READ ONLY'); return (await tx.query(s, p)).rows; })
    : async (s, p = []) => (await pg.query(s, p)).rows,
  transaction: ss => pg.transaction(async tx => { if (readOnly) await tx.query('SET TRANSACTION READ ONLY');
    const o = []; for (const s of ss) o.push((await tx.query(s.text, s.values ?? [])).rows); return o; })
});

export async function world({ dataDir, bridge = true } = {}) {
  const pg = new PGlite(dataDir), db = adapter(pg);
  await migrate(db);
  await db.query('CREATE ROLE neondb_owner NOLOGIN CREATEROLE');   // like Neon's owner: CREATEROLE, not superuser
  const g = await readFile(new URL('../sql/runtime_grants.sql', import.meta.url), 'utf8');
  await db.transaction(g.split('-- statement').map(t => ({ text: t.trim() })).filter(s => s.text));
  // Neon's owner holds ADMIN (not INHERIT/SET) on the templates, as observed live on 28-29 Oct
  await db.query('GRANT mycelium_memory_runtime, mycelium_memory_redactor TO neondb_owner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
  if (bridge) {   // created BY neondb_owner, so PostgreSQL adds the creator's automatic ADMIN-only grant, exactly as on Neon
    await db.query('SET SESSION AUTHORIZATION neondb_owner');
    await db.query(`CREATE ROLE mycelium_bridge_fpd_r2 LOGIN INHERIT CONNECTION LIMIT 20 PASSWORD 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q' VALID UNTIL '2026-12-31T23:59:59Z'`);
    await db.query('GRANT mycelium_memory_runtime TO mycelium_bridge_fpd_r2 WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');
    await db.query('SET SESSION AUTHORIZATION postgres');
  }
  return { pg, db };
}
export const counts = async db => (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS n,
  (SELECT count(*) FROM mycelium_memory.edges)::int AS e, (SELECT count(*) FROM mycelium_memory.assessments)::int AS a`))[0];
