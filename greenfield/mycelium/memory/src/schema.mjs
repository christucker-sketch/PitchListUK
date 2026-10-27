import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const version = '001_memory';
export async function migration() {
  const source = await readFile(new URL('../sql/001_memory.sql', import.meta.url), 'utf8');
  return { checksum: createHash('sha256').update(source).digest('hex'),
    statements: source.split('-- statement').map(text => ({ text: text.trim() })) };
}

export async function migrate(db) {
  const m = await migration();
  const [found] = await db.query("SELECT to_regclass('mycelium_memory.schema_migrations')::text AS name");
  if (found.name) {
    const rows = await db.query('SELECT checksum FROM mycelium_memory.schema_migrations WHERE version=$1', [version]);
    if (rows.length !== 1 || rows[0].checksum !== m.checksum) throw new Error('Migration checksum/version mismatch; no changes made.');
    return 'already applied';
  }
  // A pre-existing unrecognized schema causes CREATE SCHEMA to fail. Never adopt or overwrite it.
  await db.transaction([...m.statements, {
    text: 'INSERT INTO mycelium_memory.schema_migrations (version, checksum) VALUES ($1,$2)',
    values: [version, m.checksum]
  }]);
  return 'applied';
}
