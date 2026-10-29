// Mycelium bridge: the installed BRIX CLIs <-> Mycelium shared memory on Neon (v2, Stage One; v1 was the 28 Oct L2 proof).
// Run on fpd-prod as Unix user `mycmem` with the dedicated bridge login (never the owner), one fresh process per step,
// by the root wrapper stage-one/mycelium-bridge.sh. Every input is a file the wrapper produced from pinned sources:
//   whoami                                   READ ONLY: exact effective-privilege check of the bridge login (scripts/privileges.mjs)
//   seed <manifest.json>                     APPEND-ONLY, idempotent: the manifest's optional seed question node
//   snapshot <manifest.json> <out.md>        READ ONLY (every query in a READ ONLY transaction): recall the manifest's selection
//                                            and render it as a fenced data file (<= 24 KB); prints its sha256
//   ingest <manifest.json> <batch.json> <snapshot.md> <result.md>...
//                                            APPEND-ONLY: verify every hash, parse and validate EVERY answer, and only then
//                                            contribute them in order (one atomic contribution each, deterministic ids)
//   verify <manifest.json> <batch.json> <snapshot.md> <result.md>...
//                                            READ ONLY, fresh process: every expected node, link and stance is present exactly
// Recovery: the ONLY recovery is re-running ingest with the SAME manifest, batch, snapshot and results (the wrapper keeps
// them, hash-pinned). Ids are derived from (cli, run, task), so contributions already written are exact no-ops, a missing
// one is written, and any changed payload under an existing id is refused with nothing written.
// Recalled memory and CLI answers are untrusted data: only the validated JSON block is used, never as an instruction.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createExplorerMemory } from '../src/explorer.mjs';
import { derivedId, createMemory } from '../src/memory.mjs';

export const BRIDGE = { maxLinks: 4, maxStances: 3, maxItems: 4 };
export const L2_SELECTION = { search: 'polymer P', limit: 20, maxDepth: 2, maxResults: 60 };   // the 28 Oct proof, for tests
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TASK = /^MYC-\d{8}-\d{3}$/;
const RUN = /^MYC-\d{8}-\d{3}-r\d{10}-[0-9a-f]{8}$/;          // exactly the runner's run id (myc-gate RUN_RE)
const BATCH = /^[a-z0-9][a-z0-9-]{2,63}$/;
const HEX64 = /^[0-9a-f]{64}$/, HEX40 = /^[0-9a-f]{40}$/;
export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// The reviewed run manifest (a hub file, read by the wrapper at a pinned commit). Strict: unknown keys are refused.
export function parseManifest(m) {
  const only = (o, keys, what) => { if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what} must be an object`);
    for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${what} has unknown field ${k}`); };
  const str = (v, max, what) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${what} must be text of 1-${max} characters`); return v; };
  const int = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what} must be an integer ${lo}-${hi}`); return v; };
  only(m, ['batch', 'purpose', 'seed', 'selection', 'tasks'], 'manifest');
  if (!BATCH.test(m.batch ?? '')) throw new Error('manifest.batch must match ' + BATCH);
  str(m.purpose, 500, 'manifest.purpose');
  if (m.seed !== undefined) { only(m.seed, ['kind', 'title', 'body'], 'manifest.seed');
    if (m.seed.kind !== 'question') throw new Error('manifest.seed.kind must be "question" (a seed asks; it never asserts)');
    str(m.seed.title, 200, 'manifest.seed.title'); str(m.seed.body, 2000, 'manifest.seed.body'); }
  only(m.selection, ['search', 'limit', 'maxDepth', 'maxResults'], 'manifest.selection');
  str(m.selection.search, 200, 'manifest.selection.search'); int(m.selection.limit, 1, 20, 'manifest.selection.limit');
  int(m.selection.maxDepth, 0, 3, 'manifest.selection.maxDepth'); int(m.selection.maxResults, 1, 60, 'manifest.selection.maxResults');
  if (!Array.isArray(m.tasks) || m.tasks.length < 1 || m.tasks.length > BRIDGE.maxItems) throw new Error(`manifest.tasks must list 1-${BRIDGE.maxItems} turns`);
  const seen = new Set();
  m.tasks.forEach((t, i) => { only(t, ['task', 'agent'], `manifest.tasks[${i}]`);
    if (!TASK.test(t.task ?? '') || seen.has(t.task)) throw new Error(`manifest.tasks[${i}].task is not a new task id`); seen.add(t.task);
    if (!['claude', 'codex'].includes(t.agent)) throw new Error(`manifest.tasks[${i}].agent must be claude or codex`); });
  return m;
}
export const seedId = batch => derivedId('explorer', 'stage-one-manifest', batch, 'seed');

export async function seed(db, manifest, manifestSha) {
  const m = parseManifest(manifest);
  if (!m.seed) return null;
  const me = createExplorerMemory(db, { agent: 'stage-one-manifest', run: m.batch });
  return me.contribute({ key: 'seed', kind: m.seed.kind, title: m.seed.title, body: m.seed.body, tag: { bridge: m.batch },
    attributes: { origin: 'reviewed-manifest', manifest_sha256: manifestSha, model_written: false } });
}

export async function snapshot(db, selection) {
  const { search, limit, maxDepth, maxResults } = selection;
  const me = createExplorerMemory(db, { agent: 'bridge', run: 'snapshot' });
  const hits = await me.search({ text: search, limit });
  if (!hits.items.length) throw new Error(`nothing in memory matches "${search}"`);
  const recalled = await me.recall({ from: hits.items.map(h => h.id), maxDepth, maxResults });
  const text = me.render(recalled) + '\n';
  return { text, ids: recalled.items.map(i => i.id), sha256: sha256(text) };
}

export const snapshotIds = text => [...text.matchAll(/^\[node ([0-9a-f-]{36})\]/gm)].map(m => m[1]);

// The single fenced block labelled mycelium-contribution (or json), parsed and strictly validated.
export function parseContribution(answer, { allowed, refs = {} }) {
  const blocks = [...answer.matchAll(/```(mycelium-contribution|json)[ \t]*\r?\n([\s\S]*?)```/g)];
  const labelled = blocks.filter(b => b[1] === 'mycelium-contribution');
  const use = labelled.length ? labelled : blocks;
  if (use.length !== 1) throw new Error(`expected exactly one mycelium-contribution block, found ${use.length}`);
  let c; try { c = JSON.parse(use[0][2]); } catch { throw new Error('the contribution block is not valid JSON'); }
  const str = (v, max, what) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${what} must be text of 1-${max} characters`); return v.trim(); };
  const target = (v, what) => {
    if (typeof v === 'string' && v.startsWith('@') && refs[v.slice(1)]) return refs[v.slice(1)];
    if (typeof v !== 'string' || !UUID.test(v) || !allowed.has(v)) throw new Error(`${what} must be a node id from the snapshot${Object.keys(refs).length ? ' or @' + Object.keys(refs).join('/@') : ''}`);
    return v;
  };
  if (c === null || typeof c !== 'object' || Array.isArray(c)) throw new Error('the contribution must be a JSON object');
  const links = c.links ?? [], stances = c.stances ?? [];
  if (!Array.isArray(links) || links.length < 1 || links.length > BRIDGE.maxLinks) throw new Error(`links must list 1-${BRIDGE.maxLinks} items`);
  if (!Array.isArray(stances) || stances.length > BRIDGE.maxStances) throw new Error(`stances may list at most ${BRIDGE.maxStances} items`);
  return {
    kind: str(c.kind, 80, 'kind'), title: str(c.title, 200, 'title'), body: str(c.body, 4000, 'body'),
    links: links.map((l, i) => ({ to: target(l?.to, `links[${i}].to`), relation: str(l?.relation, 60, `links[${i}].relation`) })),
    stances: stances.map((s, i) => {
      if (!['supports', 'contradicts', 'neutral'].includes(s?.stance)) throw new Error(`stances[${i}].stance must be supports, contradicts or neutral`);
      if (typeof s.weight !== 'number' || !(s.weight >= 0 && s.weight <= 1)) throw new Error(`stances[${i}].weight must be a number from 0 to 1`);
      return { node: target(s.node, `stances[${i}].node`), stance: s.stance, weight: s.weight };
    })
  };
}

export const contributionId = (cli, run, task) => derivedId('explorer', `${cli}-cli`, run, task);

// Everything is checked, parsed AND prepared BEFORE the first write: each contribution goes through the explorer's own
// pure prepare (the same field, limit, id and credential checks the append applies) and keeps its exact prepared inserts.
// A later turn's "@<task>" resolves to the earlier turn's deterministic id, so the plan is identical whether nothing,
// part or all of the batch was already written. items: [{ task, cli, run, answer, attributes? }] in order.
const NO_DB = Object.freeze({});   // prepare never touches the database
export function plan(snapshotText, items, tag) {
  const allowed = new Set(snapshotIds(snapshotText));
  if (!allowed.size) throw new Error('the snapshot lists no node ids');
  if (!Array.isArray(items) || items.length < 1 || items.length > BRIDGE.maxItems) throw new Error(`a batch has 1-${BRIDGE.maxItems} items`);
  const refs = {}, out = [];
  for (const it of items) {
    if (!TASK.test(it.task ?? '') || !['claude', 'codex'].includes(it.cli) || !RUN.test(it.run ?? '') || !it.run.startsWith(it.task + '-r') || refs[it.task])
      throw new Error(`bad item ${String(it.task).slice(0, 40)}`);
    const c = parseContribution(it.answer, { allowed, refs });
    const id = contributionId(it.cli, it.run, it.task);
    const prepared = createExplorerMemory(NO_DB, { agent: `${it.cli}-cli`, run: it.run }).prepare({
      key: it.task, kind: c.kind, title: c.title, body: c.body, tag,
      attributes: { source_task: it.task, source_run: it.run, model_written: true, ...(it.attributes ?? {}) },
      sources: [...new Set(c.links.map(l => l.to).filter(x => allowed.has(x)))].sort(),
      links: c.links.map(l => ({ to: l.to, relation: l.relation })),
      stances: c.stances.map(st => ({ node: st.node, stance: st.stance, weight: st.weight, independenceKey: `${it.cli}-cli/${it.task}` })) });
    if (prepared.made.id !== id) throw new Error('contribution id mismatch');
    out.push({ ...it, id, c, prepared });
    refs[it.task] = id;
  }
  return out;
}

async function write(db, planned, memoryOptions) {
  const memory = createMemory(db, memoryOptions), made = [];
  for (const p of planned) {   // one atomic append per contribution; an exact replay is a no-op, a changed one is refused
    await memory.appendAll(p.prepared.queries);
    made.push({ task: p.task, cli: p.cli, id: p.id, links: p.c.links.map(l => `${l.relation}->${l.to}`), stances: p.c.stances.length });
  }
  return made;
}

// v1 interface (the 28 Oct L2 proof), now all-or-nothing on validation and with exact run ids.
export async function ingest(db, snapshotText, items, tag = { bridge: 'l2-proof-2026-10-28' }) {
  return write(db, plan(snapshotText, items, tag));
}

// Stage One: the batch the wrapper built from GitHub at a pinned commit, bound to the manifest, snapshot and results.
export function planBatch(manifest, batch, snapshotText, answers) {
  const m = parseManifest(manifest);
  const keys = ['batch', 'commit', 'manifest_sha256', 'snapshot_sha256', 'items'];
  if (!batch || Object.keys(batch).sort().join() !== [...keys].sort().join()) throw new Error('batch has the wrong fields');
  if (batch.batch !== m.batch || !HEX40.test(batch.commit) || !HEX64.test(batch.manifest_sha256) || !HEX64.test(batch.snapshot_sha256)) throw new Error('batch header is malformed or for another manifest');
  if (sha256(snapshotText) !== batch.snapshot_sha256) throw new Error('snapshot bytes do not match the batch digest');
  if (!Array.isArray(batch.items) || batch.items.length !== m.tasks.length || answers.length !== m.tasks.length) throw new Error('batch items do not match the manifest turns');
  const items = batch.items.map((b, i) => {
    const want = m.tasks[i];
    if (Object.keys(b).sort().join() !== 'agent,descriptor_blob,result_blob,result_sha256,run,task') throw new Error(`batch item ${i} has the wrong fields`);
    if (b.task !== want.task || b.agent !== want.agent) throw new Error(`batch item ${i} is not manifest turn ${want.task} (${want.agent})`);
    if (!HEX40.test(b.descriptor_blob) || !HEX40.test(b.result_blob) || !HEX64.test(b.result_sha256)) throw new Error(`batch item ${i} pins are malformed`);
    if (sha256(answers[i]) !== b.result_sha256) throw new Error(`result for ${b.task} does not match its pinned sha256`);
    return { task: b.task, cli: b.agent, run: b.run, answer: answers[i],
      attributes: { batch: m.batch, snapshot_sha256: batch.snapshot_sha256, result_sha256: b.result_sha256, result_blob: b.result_blob, hub_commit: batch.commit } };
  });
  return plan(snapshotText, items, { bridge: m.batch });
}
export const ingestBatch = async (db, manifest, batch, snapshotText, answers) => write(db, planBatch(manifest, batch, snapshotText, answers));

// Fresh-process verification with the SAME comparisons identical-retry uses: every prepared node, edge and assessment
// must exist with every persisted field equal (server timestamps aside). A row changed by the sanctioned redaction path
// is reported as `redacted`, never counted as exact.
export async function verifyPlanned(db, planned) {
  const problems = [], redacted = []; let rows = 0;
  for (const p of planned) for (const q of p.prepared.queries) {
    rows++;
    const [r] = await db.query(q.same, q.values), id = q.values[0];
    if (r?.same === true) continue;
    const what = /mycelium_memory\.nodes/.test(q.text) ? 'node' : /mycelium_memory\.edges/.test(q.text) ? 'edge' : 'assessment';
    if (!r) { problems.push(`${p.task}: ${what} ${id} missing`); continue; }
    const [x] = await db.query(`SELECT count(*)::int AS n FROM mycelium_memory.redactions WHERE subject_id = $1`, [id]);
    if (x?.n > 0) { redacted.push(`${what} ${id}`); problems.push(`${p.task}: ${what} ${id} redacted (not exact; reconcile with Chris)`); }
    else problems.push(`${p.task}: ${what} ${id} differs from the pinned payload`);
  }
  return { problems, redacted, rows, nodes: planned.length, links: planned.reduce((k, p) => k + p.c.links.length, 0), stances: planned.reduce((k, p) => k + p.c.stances.length, 0) };
}

const redactMsg = e => String(e?.message ?? e).replace(/postgres(?:ql)?:\/\/\S+/gi, '<url>').replace(/[A-Za-z0-9_+\/=-]{40,}/g, m => (HEX64.test(m) || HEX40.test(m)) ? m : '<redacted>').slice(0, 300);

// The production capability preflight: the exact effective-privilege check of the bridge login, run on the FIRST
// connection of every bridge process (whoami, seed, snapshot, ingest, verify), so drift after setup is caught each time.
export async function bridgeGuard(db) {
  const { readPrivileges, assertPrincipal } = await import('./privileges.mjs');
  const { BRIDGE_ROLE, BRIDGE_CONN_LIMIT, BRIDGE_MAX_VALID_UNTIL } = await import('./bridge-provision.mjs');
  return assertPrincipal(await readPrivileges(db), BRIDGE_ROLE, { connLimit: BRIDGE_CONN_LIMIT, maxValidUntil: BRIDGE_MAX_VALID_UNTIL });
}

// The CLI, against any db adapter (Neon in production; PGlite in the offline rehearsal). `guard` (production and the
// rehearsal always pass bridgeGuard) runs once, read-only, before the first connection is handed out.
export async function runCli(mode, args, openDb, { guard = null } = {}) {
  let checked = null;
  const open = async opts => { if (guard && !checked) checked = await guard(await openDb({ readOnly: true })); return openDb(opts); };
  const readJson = async f => JSON.parse(await readFile(f, 'utf8'));
  if (mode === 'whoami') {
    if (!guard) throw new Error('whoami needs the capability guard');
    await open({ readOnly: true }); console.log(`WHOAMI OK: ${JSON.stringify(checked)}`); return;
  }
  const manifestText = await readFile(args[0], 'utf8'), manifest = parseManifest(JSON.parse(manifestText));
  if (mode === 'seed') {
    const r = await seed(await open({ readOnly: false }), manifest, sha256(manifestText));
    console.log(r ? `SEED OK: ${r.id}` : 'SEED NONE: the manifest declares no seed'); return;
  }
  if (mode === 'snapshot') {
    const s = await snapshot(await open({ readOnly: true }), manifest.selection);
    await writeFile(args[1], s.text, { flag: 'wx' });
    console.log(`SNAPSHOT OK: ${s.ids.length} nodes, ${Buffer.byteLength(s.text)} bytes, sha256 ${s.sha256}`); return;
  }
  if (mode === 'ingest' || mode === 'verify') {
    const [, batchFile, snapFile, ...resultFiles] = args;
    const batch = await readJson(batchFile), snap = await readFile(snapFile, 'utf8');
    if (batch.manifest_sha256 !== sha256(manifestText)) throw new Error('manifest bytes do not match the batch');
    const answers = await Promise.all(resultFiles.map(f => readFile(f, 'utf8')));
    const planned = planBatch(manifest, batch, snap, answers);   // everything validated and prepared before any connection
    if (mode === 'ingest') {
      for (const m of await write(await open({ readOnly: false }), planned)) console.log(`INGESTED ${m.task} (${m.cli}-cli) as ${m.id}: ${m.links.join(', ')}; ${m.stances} stance(s)`);
      console.log(`INGEST OK: ${planned.length} contribution(s) written or already present`); return;
    }
    const v = await verifyPlanned(await open({ readOnly: true }), planned);
    if (v.problems.length) throw new Error(`verification failed: ${v.problems.join('; ')}`);
    console.log(`VERIFY OK: ${v.nodes} node(s), ${v.links} link(s), ${v.stances} stance(s); all ${v.rows} rows identical to the pinned payload; ids ${planned.map(p => p.id).join(' ')}`); return;
  }
  throw new Error('usage: bridge.mjs whoami | seed <manifest> | snapshot <manifest> <out.md> | ingest|verify <manifest> <batch> <snapshot> <result.md>...');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, ...args] = process.argv.slice(2);
  try {
    if (['seed', 'ingest'].includes(mode) && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') throw new Error(`${mode} writes to memory: requires MYCELIUM_REMOTE_WRITES_APPROVED=yes`);
    const { connect, connectionSettings } = await import('../src/connection.mjs');
    const { target } = await import('../src/preflight.mjs');
    const { BRIDGE_ROLE } = await import('./bridge-provision.mjs');
    const url = new URL(connectionSettings(process.env).connectionString);   // the bridge login on the pinned target, or nothing
    if (url.hostname !== target.endpointHost || decodeURIComponent(url.pathname.slice(1)) !== target.database) throw new Error('connection is not the inspected target');
    if (decodeURIComponent(url.username) !== BRIDGE_ROLE) throw new Error(`connection must use the bridge login ${BRIDGE_ROLE}, never the owner or another role`);
    await runCli(mode, args, opts => connect(process.env, opts), { guard: bridgeGuard });
  } catch (e) {
    console.error(`BRIDGE STOP: ${redactMsg(e)}`);
    process.exitCode = 1;
  }
}
