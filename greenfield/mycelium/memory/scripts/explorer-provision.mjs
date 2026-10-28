// OWNER-side provisioning of ONE least-privilege explorer login (PROPOSAL; Windows PC, existing migration-owner .env.local).
//   node --env-file=.env.local scripts/explorer-provision.mjs memberships            read-only: role/membership options
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes node --env-file=.env.local scripts/explorer-provision.mjs create-login <verifier-file>
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes node --env-file=.env.local scripts/explorer-provision.mjs disable-login   (close/rollback)
//   node --env-file=.env.local scripts/explorer-provision.mjs verify-login | verify-closed   read-only assertions (exit 1 if not)
// The login gets only mycelium_memory_runtime's privileges, inherited (INHERIT TRUE, SET FALSE, no ADMIN), at most two
// connections. Its password never reaches this machine: only the SCRAM verifier made on fpd-prod (scram-verifier.mjs).
import { readFile } from 'node:fs/promises';
import { connect } from '../src/connection.mjs';
import { assertDeploymentTarget } from '../src/preflight.mjs';
import { VERIFIER_RE } from './scram-verifier.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const EXPLORER_ROLE = 'mycelium_explorer_fpd';
const R = [EXPLORER_ROLE, 'mycelium_memory_runtime', 'mycelium_memory_redactor'];

export const membershipQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolconnlimit
           FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`, values: [R] },
  { text: `SELECT r.rolname AS role, m.rolname AS member, g.rolname AS grantor, a.admin_option, a.inherit_option, a.set_option
           FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
           LEFT JOIN pg_roles g ON g.oid = a.grantor
           WHERE r.rolname = ANY($1) OR m.rolname = ANY($1) ORDER BY 1, 2, 3`, values: [R] }
];

// The statements for create-login. The verifier is a strictly validated literal (utility statements take no parameters).
export function createLoginStatements(verifier) {
  if (!VERIFIER_RE.test(verifier)) throw new Error('Not a SCRAM-SHA-256 verifier; refusing (a plaintext password must never be sent).');
  return [
    { text: `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${EXPLORER_ROLE}') THEN RAISE EXCEPTION 'explorer role already exists; inspect first'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycelium_memory_runtime' AND NOT rolcanlogin) THEN RAISE EXCEPTION 'runtime template missing'; END IF;
    END $$` },
    { text: `CREATE ROLE ${EXPLORER_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
             CONNECTION LIMIT 2 PASSWORD '${verifier}'` },
    { text: `GRANT mycelium_memory_runtime TO ${EXPLORER_ROLE} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE` }
  ];
}
// Rollback / close: safe in every state (absent role, already disabled, membership already gone). Never drops anything.
export const disableLoginStatements = [
  { text: `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${EXPLORER_ROLE}') THEN
      EXECUTE 'ALTER ROLE ${EXPLORER_ROLE} NOLOGIN';
      IF EXISTS (SELECT 1 FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
                 WHERE r.rolname = 'mycelium_memory_runtime' AND m.rolname = '${EXPLORER_ROLE}') THEN
        EXECUTE 'REVOKE mycelium_memory_runtime FROM ${EXPLORER_ROLE}';
      END IF;
    END IF;
  END $$` }
];

// The only acceptable state after create-login: LOGIN, unprivileged, limit 2, exactly one membership (runtime) inherited,
// not settable, not admin. Anything else -> throw (the caller then runs close).
export function assertExplorerLogin({ roles, memberships }) {
  const r = roles.find(x => x.rolname === EXPLORER_ROLE);
  const m = memberships.filter(x => x.member === EXPLORER_ROLE);
  const ok = r && r.rolcanlogin && !r.rolsuper && !r.rolcreatedb && !r.rolcreaterole && !r.rolreplication && !r.rolbypassrls
    && r.rolconnlimit === 2 && m.length === 1 && m[0].role === 'mycelium_memory_runtime'
    && m[0].inherit_option === true && m[0].set_option === false && m[0].admin_option === false;
  if (!ok) throw new Error('Explorer login is not in the approved least-privilege state.');
}
export function assertExplorerClosed({ roles, memberships }) {
  const r = roles.find(x => x.rolname === EXPLORER_ROLE);
  if (r && (r.rolcanlogin || memberships.some(x => x.member === EXPLORER_ROLE))) throw new Error('Explorer login is still active.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  try {
    if (!['memberships', 'create-login', 'disable-login', 'verify-login', 'verify-closed'].includes(mode)) throw new Error('Unknown command.');
    if (['create-login', 'disable-login'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') throw new Error('Requires MYCELIUM_REMOTE_WRITES_APPROVED=yes after owner approval.');
    assertDeploymentTarget(process.env);
    const db = await connect();
    if (['memberships', 'verify-login', 'verify-closed'].includes(mode)) {
      const rs = await db.transaction(membershipQueries), state = { roles: rs[1], memberships: rs[2] };
      console.log(JSON.stringify(state, null, 1));
      if (mode === 'verify-login') { assertExplorerLogin(state); console.log('VERIFIED: explorer login is in the approved least-privilege state.'); }
      if (mode === 'verify-closed') { assertExplorerClosed(state); console.log('VERIFIED: explorer login is closed (NOLOGIN, no membership) or absent.'); }
    } else if (mode === 'create-login') {
      const verifier = (await readFile(process.argv[3], 'utf8')).trim();
      await db.transaction(createLoginStatements(verifier));
      console.log(`Created ${EXPLORER_ROLE}: LOGIN, connection limit 2, inherits mycelium_memory_runtime only (SET FALSE, ADMIN FALSE).`);
    } else {
      await db.transaction(disableLoginStatements);
      console.log(`Disabled ${EXPLORER_ROLE}: NOLOGIN and runtime membership revoked.`);
    }
  } catch {
    console.error('Explorer provisioning failed. No credential details logged.');
    process.exitCode = 1;
  }
}
