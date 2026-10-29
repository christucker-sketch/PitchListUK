// OFFLINE REHEARSAL ONLY: initialise a PGlite data dir like Neon today (migrations, runtime grants, the L2-era memory)
// plus the Stage One bridge login. Prints the derived ids the fake CLIs need.   node test/pglite-init.mjs <dir> <batch>...
import { world } from './helpers.mjs';
import { explorerA, explorerB } from '../examples/fixtures.mjs';
import { seedId } from '../scripts/bridge.mjs';
const [dir, ...batches] = process.argv.slice(2);
const { pg, db } = await world({ dataDir: dir });
await explorerA(db, { synthetic: true, run: 'live-proof-2026-10-28-a' });
await explorerB(db, { synthetic: true, run: 'live-proof-2026-10-28-b', aRun: 'live-proof-2026-10-28-a' });
console.log(JSON.stringify(Object.fromEntries(batches.map(b => [b, seedId(b)]))));
await pg.close();
