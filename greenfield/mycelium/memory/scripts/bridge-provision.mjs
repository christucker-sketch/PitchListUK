// OWNER-side provisioning of the ONE persistent Stage One bridge login (PROPOSAL; Windows PC, existing migration-owner
// .env.local; never on fpd-prod). Derived from the proven explorer-provision.mjs mechanics, NOT its trial name or comment:
//   node --env-file=.env.local scripts/bridge-provision.mjs memberships                       read-only
//   ... verify-absent                                                                          read-only: exit 1 if the name exists
//   ... owned <grant>                                                                          read-only: prints OWNERSHIP absent|ours|foreign
//   ... verify-login <grant>                                                                   read-only: exit 1 unless ours and exact
//   ... verify-closed <grant>                                                                  read-only: exit 1 unless absent or ours+closed
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes ... create-login <password-file> <grant> <valid-until>  refuses if the name exists
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes ... rotate-login <password-file> <grant> <valid-until>  new password/expiry, ONLY if ours
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes ... disable-login <grant>                               NOLOGIN + expire + revoke, ONLY if ours
// <grant> is the owner-approval UUID, written as the role comment in the creating transaction; every later change acts only
// on a role carrying exactly that comment. The login inherits only mycelium_memory_runtime (INHERIT TRUE, SET FALSE, no
// ADMIN), CONNECTION LIMIT 20 (Neon's proxy holds idle sessions), and a password expiry (VALID UNTIL) no later than the
// approved ceiling below. The expiry only stops NEW password authentication after that time: it does not revoke the
// runtime membership or end a session already open, so closure is always the explicit disable below. Disable = NOLOGIN
// (no new sessions) + REVOKE runtime (in PostgreSQL semantics an open session loses graph privileges at its next
// statement; on Neon this is verified only under approval) + expiry in the past.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { assertTrialPassword as assertGeneratedPassword, describeError } from './explorer-provision.mjs';

// r2: the first creation (`mycelium_bridge_fpd`, grant d246ad79…) was closed by the fail-closed path on 29 Oct and stays
// closed (NOLOGIN, expired, no membership); a closed login is never reopened. See CREATOR_GRANT below for the cause.
export const BRIDGE_ROLE = 'mycelium_bridge_fpd_r2';
// PostgreSQL 16+ (and so Neon): when a non-superuser with CREATEROLE creates a role, the new role is automatically granted
// to its creator WITH ADMIN, INHERIT FALSE, SET FALSE (createrole_self_grant unset). It gives the login NOTHING; it lets
// the owner administer it. Exactly that one grant is accepted; any other grant of the login to a role fails.
export const CREATOR_ROLE = 'neondb_owner';
export const creatorGrantOnly = grants => grants.length <= 1 && grants.every(g => g.member === CREATOR_ROLE
  && (g.admin_option ?? g.admin) === true && (g.inherit_option ?? g.inherit) === false && (g.set_option ?? g.settable) === false);
export const BRIDGE_CONN_LIMIT = 20;
export const BRIDGE_MAX_VALID_UNTIL = '2026-12-31T23:59:59Z';   // owner-approved ceiling; moving it is a reviewed change
const GRANT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const R = [BRIDGE_ROLE, 'mycelium_memory_runtime', 'mycelium_memory_redactor'];
export const grantComment = grant => {
  if (!GRANT_RE.test(grant ?? '')) throw new Error('grant must be a lowercase UUID.');
  return `mycelium-bridge-fpd ${grant}`;
};
export function validUntil(v, now = Date.now()) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error('valid-until must be an ISO UTC time like 2026-12-31T23:59:59Z.');
  if (Date.parse(v) <= now) throw new Error('valid-until is in the past.');
  if (Date.parse(v) > Date.parse(BRIDGE_MAX_VALID_UNTIL)) throw new Error(`valid-until is beyond the approved ceiling ${BRIDGE_MAX_VALID_UNTIL}.`);
  return v;
}

export const membershipQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolconnlimit,
           rolvaliduntil, shobj_description(oid, 'pg_authid') AS comment FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`, values: [R] },
  { text: `SELECT r.rolname AS role, m.rolname AS member, a.admin_option, a.inherit_option, a.set_option
           FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
           WHERE r.rolname = ANY($1) OR m.rolname = ANY($1) ORDER BY 1, 2`, values: [R] }
];

const ours = comment => `IF NOT FOUND THEN RAISE EXCEPTION 'role ${BRIDGE_ROLE} does not exist'; END IF;
    IF c IS DISTINCT FROM '${comment}' THEN RAISE EXCEPTION 'role ${BRIDGE_ROLE} was not created under this grant; left unchanged'; END IF;`;

export function createLoginStatements(password, grant, until) {
  assertGeneratedPassword(password); const comment = grantComment(grant); validUntil(until);
  return [
    { text: `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${BRIDGE_ROLE}') THEN RAISE EXCEPTION 'bridge role already exists; inspect first'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycelium_memory_runtime' AND NOT rolcanlogin) THEN RAISE EXCEPTION 'runtime template missing'; END IF;
    END $$` },
    { text: `CREATE ROLE ${BRIDGE_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
             CONNECTION LIMIT ${BRIDGE_CONN_LIMIT} PASSWORD '${password}' VALID UNTIL '${until}'` },
    { text: `COMMENT ON ROLE ${BRIDGE_ROLE} IS '${comment}'` },
    { text: `GRANT mycelium_memory_runtime TO ${BRIDGE_ROLE} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE` }
  ];
}
export function rotateLoginStatements(password, grant, until) {
  assertGeneratedPassword(password); const comment = grantComment(grant); validUntil(until);
  return [{ text: `DO $$ DECLARE c text; BEGIN
    SELECT shobj_description(oid, 'pg_authid') INTO c FROM pg_roles WHERE rolname = '${BRIDGE_ROLE}';
    ${ours(comment)}
    IF NOT (SELECT rolcanlogin FROM pg_roles WHERE rolname = '${BRIDGE_ROLE}') THEN RAISE EXCEPTION 'role ${BRIDGE_ROLE} is closed; rotation does not reopen it'; END IF;
    EXECUTE 'ALTER ROLE ${BRIDGE_ROLE} PASSWORD ''${password}'' VALID UNTIL ''${until}''';
  END $$` }];
}
export function disableLoginStatements(grant) {
  const comment = grantComment(grant);
  return [{ text: `DO $$ DECLARE c text; BEGIN
    SELECT shobj_description(oid, 'pg_authid') INTO c FROM pg_roles WHERE rolname = '${BRIDGE_ROLE}';
    IF NOT FOUND THEN RETURN; END IF;
    IF c IS DISTINCT FROM '${comment}' THEN RAISE EXCEPTION 'role ${BRIDGE_ROLE} was not created under this grant; left unchanged'; END IF;
    EXECUTE 'ALTER ROLE ${BRIDGE_ROLE} NOLOGIN VALID UNTIL ''1970-01-01T00:00:00Z''';
    IF EXISTS (SELECT 1 FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
               WHERE r.rolname = 'mycelium_memory_runtime' AND m.rolname = '${BRIDGE_ROLE}') THEN
      EXECUTE 'REVOKE mycelium_memory_runtime FROM ${BRIDGE_ROLE}';
    END IF;
  END $$` }];
}

export function ownership({ roles }, grant) {
  const r = roles.find(x => x.rolname === BRIDGE_ROLE);
  return !r ? 'absent' : r.comment === grantComment(grant) ? 'ours' : 'foreign';
}
export function assertBridgeAbsent({ roles }) {
  if (roles.some(x => x.rolname === BRIDGE_ROLE)) throw new Error(`Role ${BRIDGE_ROLE} already exists; it will not be used or changed.`);
}
export function assertBridgeLogin(state, grant, now = Date.now()) {
  const { roles, memberships } = state;
  const r = roles.find(x => x.rolname === BRIDGE_ROLE), m = memberships.filter(x => x.member === BRIDGE_ROLE);
  const until = r?.rolvaliduntil ? new Date(r.rolvaliduntil).getTime() : NaN;
  const ok = ownership(state, grant) === 'ours' && r.rolcanlogin === true && r.rolsuper === false && r.rolcreatedb === false
    && r.rolcreaterole === false && r.rolreplication === false && r.rolbypassrls === false && r.rolinherit === true
    && r.rolconnlimit === BRIDGE_CONN_LIMIT && until > now && until <= Date.parse(BRIDGE_MAX_VALID_UNTIL)
    && m.length === 1 && m[0].role === 'mycelium_memory_runtime' && m[0].inherit_option === true && m[0].set_option === false && m[0].admin_option === false
    && creatorGrantOnly(memberships.filter(x => x.role === BRIDGE_ROLE));
  if (!ok) throw new Error('Bridge login is not in the approved least-privilege state for this grant.');
}
export function assertBridgeClosed(state, grant) {
  const own = ownership(state, grant);
  if (own === 'foreign') throw new Error(`Role ${BRIDGE_ROLE} exists but is not this grant's; not closed by this grant.`);
  const r = state.roles.find(x => x.rolname === BRIDGE_ROLE);
  if (own === 'ours' && (r.rolcanlogin || state.memberships.some(x => x.member === BRIDGE_ROLE))) throw new Error('Bridge login is still active.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, a1, a2, a3] = process.argv.slice(2);
  let secret = null;
  try {
    const modes = ['memberships', 'verify-absent', 'owned', 'verify-login', 'verify-closed', 'create-login', 'rotate-login', 'disable-login'];
    if (!modes.includes(mode)) throw new Error('Unknown command.');
    const writes = ['create-login', 'rotate-login', 'disable-login'].includes(mode);
    if (writes && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') throw new Error('Requires MYCELIUM_REMOTE_WRITES_APPROVED=yes after owner approval.');
    const grant = ['create-login', 'rotate-login'].includes(mode) ? a2 : a1;
    if (!['memberships', 'verify-absent'].includes(mode)) grantComment(grant);
    const { connect } = await import('../src/connection.mjs');
    const { assertDeploymentTarget } = await import('../src/preflight.mjs');
    assertDeploymentTarget(process.env);   // the OWNER, on the PC only: this script is never installed for use on fpd-prod
    const db = await connect();
    const read = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    if (mode === 'create-login' || mode === 'rotate-login') {
      secret = (await readFile(a1, 'utf8')).trim();
      await db.transaction((mode === 'create-login' ? createLoginStatements : rotateLoginStatements)(secret, grant, a3));
      console.log(`${mode === 'create-login' ? 'Created' : 'Rotated'} ${BRIDGE_ROLE} for grant ${grant}: LOGIN, limit ${BRIDGE_CONN_LIMIT}, valid until ${a3}, inherits mycelium_memory_runtime only.`);
    } else if (mode === 'disable-login') {
      await db.transaction(disableLoginStatements(grant));
      console.log(`Closed ${BRIDGE_ROLE} for grant ${grant} (or it was absent): NOLOGIN, expired, runtime membership revoked.`);
    } else {
      const state = await read();
      console.log(JSON.stringify(state, null, 1));
      if (mode === 'verify-absent') { assertBridgeAbsent(state); console.log(`VERIFIED: ${BRIDGE_ROLE} does not exist.`); }
      if (mode === 'owned') console.log(`OWNERSHIP: ${ownership(state, grant)}`);
      if (mode === 'verify-login') { assertBridgeLogin(state, grant); console.log('VERIFIED: bridge login is this grant\'s and in the approved least-privilege state.'); }
      if (mode === 'verify-closed') { assertBridgeClosed(state, grant); console.log('VERIFIED: this grant\'s bridge login is closed (NOLOGIN, no membership) or absent.'); }
    }
  } catch (e) {
    console.error(`Bridge provisioning stopped: ${describeError(e, secret)}`);
    process.exitCode = 1;
  }
}
