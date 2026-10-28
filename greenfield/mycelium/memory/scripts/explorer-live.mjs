// The proposed live shared-memory proof on fpd-prod (PROPOSAL; DB only, no model call). Runs as Unix user `mycmem` with the
// explorer login from /etc/mycelium/explorer.env (never the migration owner). Each mode is one fresh process:
//   node --env-file=/etc/mycelium/explorer.env scripts/explorer-live.mjs whoami   read-only: identity and privilege refusals
//   ... explorer-live.mjs A      fixture explorer A records 2 contributions (4 nodes, 3 edges), synthetic, fixed keys
//   ... explorer-live.mjs B      fixture explorer B (new process) finds A by phrase, recalls, extends (2 nodes, 3 edges, 2 stances)
//   ... explorer-live.mjs check  read-only: recall from B's record and print what it reached
// Fixed run tags make every write idempotent: a rerun after an uncertain outcome is a no-op, never a duplicate.
import { connect, connectionSettings } from '../src/connection.mjs';
import { target } from '../src/preflight.mjs';
import { createExplorerMemory } from '../src/explorer.mjs';
import { derivedId } from '../src/memory.mjs';
import { explorerA, explorerB } from '../examples/fixtures.mjs';
import { EXPLORER_ROLE, describeError } from './explorer-provision.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const LIVE = { aRun: 'live-proof-2026-10-28-a', bRun: 'live-proof-2026-10-28-b', maxDatabaseBytes: 900 * 1024 * 1024 };

// Refuse anything but the pinned host/database and the least-privilege explorer login.
export function assertExplorerTarget(env) {
  const { connectionString } = connectionSettings(env);
  const url = new URL(connectionString);
  if (url.hostname !== target.endpointHost || decodeURIComponent(url.pathname.slice(1)) !== target.database)
    throw new Error('Explorer connection is not the inspected target.');
  if (decodeURIComponent(url.username) !== EXPLORER_ROLE) throw new Error('Explorer connection must use the explorer login, never the owner.');
}

// Read-only receipt: totals (so a before/after delta proves existing rows were preserved) and the trial's own rows.
export const footprintQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS nodes_total,
     (SELECT count(*) FROM mycelium_memory.edges)::int AS edges_total,
     (SELECT count(*) FROM mycelium_memory.assessments)::int AS assessments_total,
     (SELECT count(*) FROM mycelium_memory.nodes WHERE attributes->>'synthetic' = 'true'
        AND provenance->'declared_by'->>'run' IN ($1, $2))::int AS trial_nodes,
     (SELECT count(*) FROM mycelium_memory.edges WHERE attributes->>'synthetic' = 'true'
        AND provenance->'declared_by'->>'run' IN ($1, $2))::int AS trial_edges,
     (SELECT count(*) FROM mycelium_memory.assessments WHERE assessor IN ($3, $4))::int AS trial_assessments`,
    values: [LIVE.aRun, LIVE.bRun, `fixture-explorer-a/${LIVE.aRun}`, `fixture-explorer-b/${LIVE.bRun}`] }
];

export const whoamiQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT current_user AS role, session_user AS session, current_database() AS database,
     (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS elevated,
     has_table_privilege('mycelium_memory.nodes', 'INSERT') AS can_append,
     has_table_privilege('mycelium_memory.nodes', 'UPDATE') OR has_table_privilege('mycelium_memory.nodes', 'DELETE') AS can_mutate,
     has_table_privilege('mycelium_memory.redaction_authorizations', 'SELECT') AS can_see_capability,
     has_function_privilege('mycelium_memory.redact(text,uuid,text,uuid)', 'EXECUTE') AS can_redact,
     has_database_privilege(current_database(), 'CREATE') AS can_create_schema,
     pg_has_role(current_user, 'neondb_owner', 'MEMBER') AS owner_member` }
];
export function assertLeastPrivilege(w) {
  const bad = ['elevated', 'can_mutate', 'can_see_capability', 'can_redact', 'can_create_schema', 'owner_member'].filter(k => w[k]);
  if (w.role !== EXPLORER_ROLE || !w.can_append || bad.length) throw new Error(`Explorer login is not least-privilege (${bad.join(', ') || 'role/append'}); stop.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  try {
    if (!['whoami', 'footprint', 'A', 'B', 'check'].includes(mode)) throw new Error('Unknown command.');
    assertExplorerTarget(process.env);
    const db = await connect();
    const [w] = (await db.transaction(whoamiQueries))[1];
    assertLeastPrivilege(w);
    const opts = { synthetic: true, memoryOptions: { maxDatabaseBytes: LIVE.maxDatabaseBytes } };
    let out;
    if (mode === 'whoami') out = w;
    else if (mode === 'footprint') out = (await db.transaction(footprintQueries))[1][0];
    else if (mode === 'A') out = await explorerA(db, { ...opts, run: LIVE.aRun });
    else if (mode === 'B') out = await explorerB(db, { ...opts, run: LIVE.bRun, aRun: LIVE.aRun });
    else {
      const ext = derivedId('explorer', 'fixture-explorer-b', LIVE.bRun, 'cofactor-cold');
      const r = await createExplorerMemory(db, { agent: 'live-check', run: 'read-only' }).recall({ from: [ext], maxDepth: 2 });
      out = { extension: ext, missing: r.missing, reached: r.items.map(i => ({ id: i.id, kind: i.kind, by: i.provenance?.declared_by })),
        links: r.links.map(e => e.relation).sort(), stances: Object.fromEntries(Object.entries(r.stances).map(([k, v]) => [k, v.stances])) };
    }
    console.log(JSON.stringify({ mode, pid: process.pid, ...out }));
  } catch (e) {
    // Diagnosable but safe: SQLSTATE and server message with the password, any URL and long tokens removed.
    let secret = null; try { secret = decodeURIComponent(new URL(process.env.MYCELIUM_DATABASE_URL).password) || null; } catch { }
    console.error(`Explorer live step failed or refused: ${describeError(e, secret)}`);
    process.exitCode = 1;
  }
}
