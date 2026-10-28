// OWNER-side provisioning of ONE least-privilege explorer login (PROPOSAL; Windows PC, existing migration-owner .env.local).
// Every mutation is bound to ONE trial attempt: create-login writes `mycelium-explorer-trial <attempt-uuid>` as the role's
// comment IN THE SAME TRANSACTION that creates it, and disable-login acts only on a role carrying that exact comment.
// A pre-existing or foreign role of the same name is reported and never changed.
//   node --env-file=.env.local scripts/explorer-provision.mjs memberships                 read-only: roles/memberships/comment
//   node --env-file=.env.local scripts/explorer-provision.mjs verify-absent               read-only: exit 1 if the name exists
//   node --env-file=.env.local scripts/explorer-provision.mjs owned <attempt>             read-only: prints absent|ours|foreign
//   node --env-file=.env.local scripts/explorer-provision.mjs verify-login <attempt>      read-only: exit 1 unless ours and exact
//   node --env-file=.env.local scripts/explorer-provision.mjs verify-closed <attempt>     read-only: exit 1 unless absent or ours+closed
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes ... create-login <password-file> <attempt>        refuses if the name exists
//   MYCELIUM_REMOTE_WRITES_APPROVED=yes ... disable-login <attempt>                       NOLOGIN + revoke, ONLY if ours
// The login gets only mycelium_memory_runtime's privileges, inherited (INHERIT TRUE, SET FALSE, no ADMIN), at most two
// connections. Neon accepts only PLAIN-TEXT passwords in CREATE ROLE ("Hashed passwords are not supported", Neon docs), so
// the password generated on fpd-prod is copied here once, sent over TLS in CREATE ROLE, and wiped by the caller.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { connect } from '../src/connection.mjs';
import { assertDeploymentTarget } from '../src/preflight.mjs';

export const EXPLORER_ROLE = 'mycelium_explorer_fpd';
const R = [EXPLORER_ROLE, 'mycelium_memory_runtime', 'mycelium_memory_redactor'];
const ATTEMPT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const attemptComment = attempt => {
  if (!ATTEMPT_RE.test(attempt ?? '')) throw new Error('attempt must be a lowercase UUID.');
  return `mycelium-explorer-trial ${attempt}`;
};

export const membershipQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolconnlimit,
           shobj_description(oid, 'pg_authid') AS comment
           FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`, values: [R] },
  { text: `SELECT r.rolname AS role, m.rolname AS member, g.rolname AS grantor, a.admin_option, a.inherit_option, a.set_option
           FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
           LEFT JOIN pg_roles g ON g.oid = a.grantor
           WHERE r.rolname = ANY($1) OR m.rolname = ANY($1) ORDER BY 1, 2, 3`, values: [R] }
];

// The generated password: URL-safe base64 (no quoting or URL-encoding needed), 32-64 characters, upper, lower and digit,
// no character three times in a row -- comfortably above Neon's 60-bit entropy minimum.
export function assertTrialPassword(p) {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{32,64}$/.test(p) || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p) || /(.)\1\1/.test(p))
    throw new Error('password file does not hold a valid generated trial password; refusing.');
  return p;
}
// Statements for create-login. The password and attempt are strictly validated literals (utility statements take no
// parameters). The existence check, creation, binding comment and grant commit together or not at all.
export function createLoginStatements(password, attempt) {
  assertTrialPassword(password);
  const comment = attemptComment(attempt);
  return [
    { text: `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${EXPLORER_ROLE}') THEN RAISE EXCEPTION 'explorer role already exists; inspect first'; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycelium_memory_runtime' AND NOT rolcanlogin) THEN RAISE EXCEPTION 'runtime template missing'; END IF;
    END $$` },
    { text: `CREATE ROLE ${EXPLORER_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
             CONNECTION LIMIT 2 PASSWORD '${password}'` },
    { text: `COMMENT ON ROLE ${EXPLORER_ROLE} IS '${comment}'` },
    { text: `GRANT mycelium_memory_runtime TO ${EXPLORER_ROLE} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE` }
  ];
}

// Close/rollback for THIS attempt only: absent -> no-op; ours -> NOLOGIN + revoke (idempotent); foreign -> error, unchanged.
export function disableLoginStatements(attempt) {
  const comment = attemptComment(attempt);
  return [{ text: `DO $$ DECLARE c text; BEGIN
    SELECT shobj_description(oid, 'pg_authid') INTO c FROM pg_roles WHERE rolname = '${EXPLORER_ROLE}';
    IF NOT FOUND THEN RETURN; END IF;
    IF c IS DISTINCT FROM '${comment}' THEN
      RAISE EXCEPTION 'role ${EXPLORER_ROLE} exists but was not created by this trial attempt; left unchanged';
    END IF;
    EXECUTE 'ALTER ROLE ${EXPLORER_ROLE} NOLOGIN';
    IF EXISTS (SELECT 1 FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
               WHERE r.rolname = 'mycelium_memory_runtime' AND m.rolname = '${EXPLORER_ROLE}') THEN
      EXECUTE 'REVOKE mycelium_memory_runtime FROM ${EXPLORER_ROLE}';
    END IF;
  END $$` }];
}

export function ownership({ roles }, attempt) {
  const r = roles.find(x => x.rolname === EXPLORER_ROLE);
  return !r ? 'absent' : r.comment === attemptComment(attempt) ? 'ours' : 'foreign';
}
export function assertExplorerAbsent({ roles }) {
  if (roles.some(x => x.rolname === EXPLORER_ROLE)) throw new Error(`Role ${EXPLORER_ROLE} already exists; the trial will not use or change it.`);
}
// The only acceptable state after create-login: ours, LOGIN, unprivileged, limit 2, exactly one membership (runtime)
// inherited, not settable, not admin.
export function assertExplorerLogin(state, attempt) {
  const { roles, memberships } = state;
  const r = roles.find(x => x.rolname === EXPLORER_ROLE);
  const m = memberships.filter(x => x.member === EXPLORER_ROLE);
  const ok = ownership(state, attempt) === 'ours' && r.rolcanlogin && !r.rolsuper && !r.rolcreatedb && !r.rolcreaterole
    && !r.rolreplication && !r.rolbypassrls && r.rolconnlimit === 2 && m.length === 1 && m[0].role === 'mycelium_memory_runtime'
    && m[0].inherit_option === true && m[0].set_option === false && m[0].admin_option === false;
  if (!ok) throw new Error('Explorer login is not in the approved least-privilege state for this attempt.');
}
export function assertExplorerClosed(state, attempt) {
  const own = ownership(state, attempt);
  if (own === 'foreign') throw new Error(`Role ${EXPLORER_ROLE} exists but is not this trial's; not closed by this trial.`);
  const r = state.roles.find(x => x.rolname === EXPLORER_ROLE);
  if (own === 'ours' && (r.rolcanlogin || state.memberships.some(x => x.member === EXPLORER_ROLE))) throw new Error('Explorer login is still active.');
}

// Diagnosable but safe: the SQLSTATE and server message, with the password, any URL and any long secret-like token removed.
export function describeError(e, secret = null) {
  let msg = String(e?.message ?? e);
  if (secret) msg = msg.split(secret).join('<password>');
  msg = msg.replace(/postgres(?:ql)?:\/\/\S+/gi, '<url>').replace(/[A-Za-z0-9_+\/=-]{32,}/g, '<redacted>').slice(0, 300);
  return e?.code ? `SQLSTATE ${e.code}: ${msg}` : msg;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, a1, a2] = process.argv.slice(2);
  let secret = null;
  try {
    const modes = ['memberships', 'verify-absent', 'owned', 'verify-login', 'verify-closed', 'create-login', 'disable-login'];
    if (!modes.includes(mode)) throw new Error('Unknown command.');
    if (['create-login', 'disable-login'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') throw new Error('Requires MYCELIUM_REMOTE_WRITES_APPROVED=yes after owner approval.');
    const attempt = mode === 'create-login' ? a2 : a1;
    if (!['memberships', 'verify-absent'].includes(mode)) attemptComment(attempt);
    assertDeploymentTarget(process.env);
    const db = await connect();
    const read = async () => { const rs = await db.transaction(membershipQueries); return { roles: rs[1], memberships: rs[2] }; };
    if (mode === 'create-login') {
      secret = (await readFile(a1, 'utf8')).trim();
      await db.transaction(createLoginStatements(secret, attempt));
      console.log(`Created ${EXPLORER_ROLE} for attempt ${attempt}: LOGIN, connection limit 2, inherits mycelium_memory_runtime only.`);
    } else if (mode === 'disable-login') {
      await db.transaction(disableLoginStatements(attempt));
      console.log(`Closed ${EXPLORER_ROLE} for attempt ${attempt} (or it was absent): NOLOGIN, runtime membership revoked.`);
    } else {
      const state = await read();
      console.log(JSON.stringify(state, null, 1));
      if (mode === 'verify-absent') { assertExplorerAbsent(state); console.log(`VERIFIED: ${EXPLORER_ROLE} does not exist.`); }
      if (mode === 'owned') console.log(`OWNERSHIP: ${ownership(state, attempt)}`);
      if (mode === 'verify-login') { assertExplorerLogin(state, attempt); console.log('VERIFIED: explorer login is this attempt\'s and in the approved least-privilege state.'); }
      if (mode === 'verify-closed') { assertExplorerClosed(state, attempt); console.log('VERIFIED: this attempt\'s explorer login is closed (NOLOGIN, no membership) or absent.'); }
    }
  } catch (e) {
    console.error(`Explorer provisioning stopped: ${describeError(e, secret)}`);
    process.exitCode = 1;
  }
}
