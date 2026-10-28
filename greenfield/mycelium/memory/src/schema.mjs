import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Ordered, checksummed migrations. Applied ones must match byte-for-byte; unknown recorded versions stop everything.
export const versions = ['001_memory', '002_integrity_assessments', '003_redaction'];
export const version = versions[versions.length - 1];

// Hash the reviewed LF SQL identically on Windows CRLF checkouts. Other byte changes remain significant.
export const canonicalSql = source => source.replace(/\r\n/g, '\n');

export async function migration(v) {
  const source = canonicalSql(await readFile(new URL(`../sql/${v}.sql`, import.meta.url), 'utf8')); 
  return { version: v, checksum: createHash('sha256').update(source).digest('hex'),
    statements: source.split('-- statement').map(text => ({ text: text.trim() })).filter(s => s.text) };
}

export async function migrate(db) {
  const all = await Promise.all(versions.map(migration));
  const [found] = await db.query("SELECT to_regclass('mycelium_memory.schema_migrations')::text AS name");
  const applied = new Map();
  if (found.name) {
    for (const r of await db.query('SELECT version, checksum FROM mycelium_memory.schema_migrations')) applied.set(r.version, r.checksum);
    for (const v of applied.keys()) if (!versions.includes(v)) throw new Error(`Unknown applied migration ${v}; no changes made.`);
    if (!applied.has(versions[0])) throw new Error('Migration checksum/version mismatch; no changes made.');
  }
  // Every applied migration must match, and the applied set must be a prefix of the list (no gaps), before any change.
  let prefix = true;
  for (const m of all) {
    if (applied.has(m.version)) {
      if (!prefix || applied.get(m.version) !== m.checksum) throw new Error('Migration checksum/version mismatch; no changes made.');
    } else prefix = false;
  }
  const pending = all.filter(m => !applied.has(m.version));
  if (pending.length === 0) return 'already applied';
  // A pre-existing unrecognized schema causes CREATE SCHEMA to fail. Never adopt or overwrite it.
  await db.transaction(pending.flatMap(m => [...m.statements, {
      text: 'INSERT INTO mycelium_memory.schema_migrations (version, checksum) VALUES ($1,$2)',
      values: [m.version, m.checksum]
    }]));
  return 'applied';
}
