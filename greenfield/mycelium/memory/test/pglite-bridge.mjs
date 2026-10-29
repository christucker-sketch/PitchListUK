// OFFLINE REHEARSAL ONLY: the real bridge CLI (runCli) against a PGlite data dir, connected AS the restricted
// mycelium_bridge_fpd_r2 role, so the real grants are enforced. Used by stage-one/test-bridge-host.sh in place of
// `node --env-file=/etc/mycelium/bridge.env scripts/bridge.mjs`. Never used on a host.
//   T_PGDATA=<dir> node test/pglite-bridge.mjs <mode> <args...>
//   T_INJECT_ONCE=<file holding a contribution id>: the first transaction writing that id fails AFTER it committed
//   (a lost acknowledgement); the file is removed when it fires, so the next process succeeds.
import { readFile, rm } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { adapter } from './helpers.mjs';
import { runCli, bridgeGuard } from '../scripts/bridge.mjs';
const [mode, ...args] = process.argv.slice(2);
if (['seed', 'ingest'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') {
  console.error(`BRIDGE STOP: ${mode} writes to memory: requires MYCELIUM_REMOTE_WRITES_APPROVED=yes`); process.exit(1);
}
const pg = new PGlite(process.env.T_PGDATA);
let inject = null; try { inject = (await readFile(process.env.T_INJECT_ONCE ?? '/nonexistent', 'utf8')).trim(); } catch {}
try {
  await pg.query('SET SESSION AUTHORIZATION mycelium_bridge_fpd_r2');
  await runCli(mode, args, async ({ readOnly }) => {
    const db = adapter(pg, { readOnly });
    if (!inject || readOnly) return db;
    return { ...db, transaction: async ss => { const r = await db.transaction(ss);
      if (inject && JSON.stringify(ss).includes(inject)) { inject = null; await rm(process.env.T_INJECT_ONCE); throw new Error('fetch failed (injected after commit)'); }
      return r; } };
  }, { guard: bridgeGuard });   // the same capability preflight as production, on every process
} catch (e) { console.error(`BRIDGE STOP: ${String(e?.message ?? e).slice(0, 300)}`); process.exitCode = 1; }
finally { await pg.close(); }
