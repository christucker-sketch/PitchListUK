// Test-only D1 stand-in backed by node:sqlite, with the real v2 migrations applied.
// Lets customer API tests exercise the actual SQL (joins, date logic) instead of string matching.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../operations/findpitches-v2/migrations');

export function createMigratedD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  const d1 = {
    sqlite,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values.map(v => (v === undefined ? null : v)); return stmt; },
        async all() { return { results: sqlite.prepare(sql).all(...args).map(plain) }; },
        async first() { const row = sqlite.prepare(sql).get(...args); return row ? plain(row) : null; },
        async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes) } }; }
      };
      return stmt;
    }
  };
  return d1;
}

function plain(row) { return Object.fromEntries(Object.entries(row)); }
