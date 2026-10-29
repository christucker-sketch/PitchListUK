// Complete effective-privilege check for a Mycelium LOGIN principal (Stage One; replaces the partial explorer `whoami`
// for the bridge). One READ ONLY transaction enumerates, for the CURRENT session, every relation, function, schema and role
// it can reach outside the system catalogs, and assertPrincipal() compares that against the exact expected capability.
// Every expected field is checked explicitly (a missing or non-boolean field fails), so a query change cannot pass silently.
//   expected for the bridge (runtime capability, nothing else):
//     identity   session_user = current_user = the named principal; no superuser/createrole/createdb/replication/bypassrls
//     roles      member of exactly mycelium_memory_runtime (transitively), inherited, NOT settable; no other role reachable
//     relations  SELECT+INSERT on nodes/edges/assessments; SELECT on assessment_heads/redactions; nothing else anywhere
//                (no UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, no column grants, nothing in neon_auth/public/other schemas)
//     functions  EXECUTE on require_identical_retry only; no SECURITY DEFINER function executable anywhere (redact incl.)
//     schemas    USAGE on mycelium_memory; CREATE nowhere; USAGE elsewhere is reported (and allowed only with zero grants)
//     database   no CREATE; owns no object of any kind
//     login      connection limit exactly the approved one; finite password expiry, in the future, within the ceiling;
//                direct membership exactly runtime (no ADMIN, INHERIT, no SET); granted to no other role
export const RUNTIME_ROLE = 'mycelium_memory_runtime';
const SYS = `n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'`;

export const privilegeQueries = [
  { text: 'SET TRANSACTION READ ONLY' },
  { text: `SELECT current_user AS role, session_user AS session, current_database() AS database,
     r.rolsuper AS superuser, r.rolcreaterole AS createrole, r.rolcreatedb AS createdb, r.rolreplication AS replication,
     r.rolbypassrls AS bypassrls, r.rolcanlogin AS login, r.rolinherit AS inherit, r.rolconnlimit AS connlimit,
     r.rolvaliduntil AS valid_until,
     has_database_privilege(current_database(), 'CREATE') AS db_create,
     (SELECT count(*) FROM pg_class c WHERE pg_has_role(current_user, c.relowner, 'MEMBER'))::int
       + (SELECT count(*) FROM pg_proc p WHERE pg_has_role(current_user, p.proowner, 'MEMBER'))::int
       + (SELECT count(*) FROM pg_namespace n WHERE pg_has_role(current_user, n.nspowner, 'MEMBER'))::int
       + (SELECT count(*) FROM pg_type t WHERE pg_has_role(current_user, t.typowner, 'MEMBER'))::int
       + (SELECT count(*) FROM pg_database d WHERE pg_has_role(current_user, d.datdba, 'MEMBER'))::int AS owned_objects
     FROM pg_roles r WHERE r.rolname = current_user` },
  { text: `SELECT g.rolname AS role, pg_has_role(current_user, g.oid, 'USAGE') AS inherited, pg_has_role(current_user, g.oid, 'SET') AS settable
     FROM pg_roles g WHERE g.rolname <> current_user AND pg_has_role(current_user, g.oid, 'MEMBER') ORDER BY 1` },
  { text: `SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind,
     has_table_privilege(c.oid, 'SELECT') AS sel, has_table_privilege(c.oid, 'INSERT') AS ins,
     has_table_privilege(c.oid, 'UPDATE') AS upd, has_table_privilege(c.oid, 'DELETE') AS del,
     has_table_privilege(c.oid, 'TRUNCATE') AS trunc, has_table_privilege(c.oid, 'REFERENCES') AS refs,
     has_table_privilege(c.oid, 'TRIGGER') AS trig,
     has_any_column_privilege(c.oid, 'SELECT') AS col_sel, has_any_column_privilege(c.oid, 'INSERT') AS col_ins,
     has_any_column_privilege(c.oid, 'UPDATE') AS col_upd, has_any_column_privilege(c.oid, 'REFERENCES') AS col_refs
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND ${SYS}
       AND (has_table_privilege(c.oid, 'SELECT') OR has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE')
         OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE') OR has_table_privilege(c.oid, 'REFERENCES')
         OR has_table_privilege(c.oid, 'TRIGGER') OR has_any_column_privilege(c.oid, 'SELECT') OR has_any_column_privilege(c.oid, 'INSERT')
         OR has_any_column_privilege(c.oid, 'UPDATE') OR has_any_column_privilege(c.oid, 'REFERENCES'))
     ORDER BY 1, 2` },
  { text: `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
     p.prosecdef AS security_definer, (p.prorettype = 'trigger'::regtype) AS trigger_only
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE ${SYS} AND has_function_privilege(p.oid, 'EXECUTE') ORDER BY 1, 2, 3` },
  { text: `SELECT n.nspname AS schema, has_schema_privilege(n.oid, 'USAGE') AS usage, has_schema_privilege(n.oid, 'CREATE') AS create
     FROM pg_namespace n WHERE ${SYS} AND (has_schema_privilege(n.oid, 'USAGE') OR has_schema_privilege(n.oid, 'CREATE')) ORDER BY 1` },
  { text: `SELECT r.rolname AS role, a.admin_option AS admin, a.inherit_option AS inherit, a.set_option AS settable
     FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid WHERE a.member = (SELECT oid FROM pg_roles WHERE rolname = current_user) ORDER BY 1` },
  { text: `SELECT m.rolname AS member FROM pg_auth_members a JOIN pg_roles m ON m.oid = a.member
     WHERE a.roleid = (SELECT oid FROM pg_roles WHERE rolname = current_user) ORDER BY 1` }
];

export const readPrivileges = async db => {
  const r = await db.transaction(privilegeQueries);
  return { identity: r[1][0], roles: r[2], relations: r[3], functions: r[4], schemas: r[5], direct: r[6], members: r[7] };
};

const EXPECTED_RELATIONS = {
  'mycelium_memory.nodes': ['sel', 'ins'], 'mycelium_memory.edges': ['sel', 'ins'], 'mycelium_memory.assessments': ['sel', 'ins'],
  'mycelium_memory.assessment_heads': ['sel'], 'mycelium_memory.redactions': ['sel']
};
const REL_FLAGS = ['sel', 'ins', 'upd', 'del', 'trunc', 'refs', 'trig'];
const COL_FLAGS = { col_sel: 'sel', col_ins: 'ins', col_upd: 'upd', col_refs: 'refs' };

// Returns a list of problems (empty = exactly the expected capability). Never throws on shape: shape errors are problems.
// expect: { connLimit, maxValidUntil, now } -- the approved connection limit and the password-expiry ceiling; the expiry
// must be finite, in the future and not beyond the ceiling.
export function principalProblems(p, principal, { connLimit = 20, maxValidUntil = '2026-12-31T23:59:59Z', now = Date.now() } = {}) {
  const bad = [];
  const bool = (o, k, want, where) => { if (typeof o?.[k] !== 'boolean') bad.push(`${where}.${k} missing`); else if (o[k] !== want) bad.push(`${where}.${k}=${o[k]}`); };
  const id = p?.identity;
  if (!id) return ['no identity row'];
  if (id.role !== principal || id.session !== principal) bad.push(`identity ${id.session}/${id.role} is not ${principal}`);
  for (const k of ['superuser', 'createrole', 'createdb', 'replication', 'bypassrls', 'db_create']) bool(id, k, false, 'identity');
  bool(id, 'login', true, 'identity'); bool(id, 'inherit', true, 'identity');
  if (id.owned_objects !== 0) bad.push(`owns ${id.owned_objects} object(s)`);
  if (id.connlimit !== connLimit) bad.push(`connection limit ${id.connlimit} is not ${connLimit}`);
  const until = id.valid_until == null ? NaN : new Date(id.valid_until).getTime();
  if (!Number.isFinite(until)) bad.push('no finite password expiry (VALID UNTIL)');
  else if (until <= now) bad.push('password expiry has passed');
  else if (until > Date.parse(maxValidUntil)) bad.push(`password expiry is beyond the approved ceiling ${maxValidUntil}`);
  const direct = p.direct;
  if (!Array.isArray(direct) || direct.length !== 1 || direct[0].role !== RUNTIME_ROLE) bad.push('direct memberships are not exactly the runtime template');
  for (const d of direct ?? []) { bool(d, 'admin', false, `membership ${d.role}`); bool(d, 'inherit', true, `membership ${d.role}`); bool(d, 'settable', false, `membership ${d.role}`); }
  if (!Array.isArray(p.members)) bad.push('members missing'); else if (p.members.length) bad.push(`granted to other roles: ${p.members.map(m => m.member).join(', ')}`);
  const roles = p.roles ?? [];
  if (roles.length !== 1 || roles[0].role !== RUNTIME_ROLE) bad.push(`reachable roles [${roles.map(r => r.role).join(', ')}] are not exactly ${RUNTIME_ROLE}`);
  for (const r of roles) { bool(r, 'inherited', true, `role ${r.role}`); bool(r, 'settable', false, `role ${r.role}`); }
  const seen = new Set();
  for (const r of p.relations ?? []) {
    const name = `${r.schema}.${r.name}`, want = EXPECTED_RELATIONS[name] ?? [];
    seen.add(name);
    for (const f of REL_FLAGS) bool(r, f, want.includes(f), name);
    for (const [c, f] of Object.entries(COL_FLAGS)) bool(r, c, want.includes(f), name);
  }
  for (const name of Object.keys(EXPECTED_RELATIONS)) if (!seen.has(name)) bad.push(`${name} not accessible`);
  const fns = p.functions ?? [];
  for (const f of fns) {
    const name = `${f.schema}.${f.name}(${f.args})`;
    if (f.security_definer !== false) bad.push(`can execute SECURITY DEFINER ${name}`);
    else if (f.schema === 'mycelium_memory' && !(f.name === 'require_identical_retry' && f.args === 'p_same boolean') && f.trigger_only !== true) bad.push(`can execute ${name}`);
  }
  if (!fns.some(f => f.schema === 'mycelium_memory' && f.name === 'require_identical_retry')) bad.push('cannot execute require_identical_retry');
  for (const s of p.schemas ?? []) {
    bool(s, 'create', false, `schema ${s.schema}`);
    if (s.schema !== 'mycelium_memory' && (p.relations ?? []).some(r => r.schema === s.schema)) bad.push(`has grants in schema ${s.schema}`);
  }
  if (!(p.schemas ?? []).some(s => s.schema === 'mycelium_memory' && s.usage === true)) bad.push('no USAGE on mycelium_memory');
  return bad;
}

export function assertPrincipal(p, principal, expect) {
  const bad = principalProblems(p, principal, expect);
  if (bad.length) throw new Error(`${principal} is not exactly least-privilege: ${bad.slice(0, 8).join('; ')}${bad.length > 8 ? '; ...' : ''}`);
  return { principal, other_schema_usage: (p.schemas ?? []).filter(s => s.usage && s.schema !== 'mycelium_memory').map(s => s.schema),
    valid_until: p.identity.valid_until ?? null, connlimit: p.identity.connlimit };
}
