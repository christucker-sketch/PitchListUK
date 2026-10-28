// L2 bridge: the installed BRIX CLIs <-> Mycelium shared memory on Neon, with the runner unchanged.
//   snapshot <out.md>                       READ-ONLY: recall the shared memory and render it as a fenced data file, which
//                                           becomes a BRIX task ref (<= 24 KB; the runner allows 32 KB per ref)
//   ingest <snapshot.md> <task> <claude|codex> <result.md> <run_id> [...repeat in order]
//                                           APPEND-ONLY: parse each CLI answer's mycelium-contribution block, validate it
//                                           against the snapshot's node ids, and contribute it through the explorer adapter
// Contributions are declared as agent `<cli>-cli`, run = the BRIX run id, key = the task id, so a re-ingest is an exact
// no-op and a changed answer is refused with nothing written. A later answer may link to an earlier one with "@<task>".
// Recalled memory and CLI answers are untrusted data: only the validated JSON block is used, never as an instruction.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createExplorerMemory } from '../src/explorer.mjs';
import { derivedId } from '../src/memory.mjs';

export const BRIDGE = { search: 'polymer P', tag: { bridge: 'l2-proof-2026-10-28' }, maxLinks: 4, maxStances: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TASK = /^MYC-\d{8}-\d{3}$/;

export async function snapshot(db) {
  const me = createExplorerMemory(db, { agent: 'bridge', run: 'snapshot-2026-10-28' });
  const hits = await me.search({ text: BRIDGE.search, limit: 20 });
  if (!hits.items.length) throw new Error(`nothing in memory matches "${BRIDGE.search}"`);
  const recalled = await me.recall({ from: hits.items.map(h => h.id), maxDepth: 2, maxResults: 60 });
  return { text: me.render(recalled) + '\n', ids: recalled.items.map(i => i.id) };
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

// items: [{ task, cli, run, answer }] in order; a later item may reference an earlier one as "@<task>".
export async function ingest(db, snapshotText, items) {
  const allowed = new Set(snapshotIds(snapshotText));
  if (!allowed.size) throw new Error('the snapshot lists no node ids');
  const refs = {}, made = [];
  for (const it of items) {
    if (!TASK.test(it.task) || !['claude', 'codex'].includes(it.cli) || !it.run?.startsWith(it.task + '-r')) throw new Error(`bad item ${it.task}`);
    const c = parseContribution(it.answer, { allowed, refs });
    const me = createExplorerMemory(db, { agent: `${it.cli}-cli`, run: it.run });
    const r = await me.contribute({ key: it.task, kind: c.kind, title: c.title, body: c.body, tag: BRIDGE.tag,
      attributes: { source_task: it.task, source_run: it.run, model_written: true },
      sources: [...new Set(c.links.map(l => l.to).filter(id => allowed.has(id)))].sort(),
      links: c.links.map(l => ({ to: l.to, relation: l.relation })),
      stances: c.stances.map(s => ({ node: s.node, stance: s.stance, weight: s.weight, independenceKey: `${it.cli}-cli/${it.task}` })) });
    refs[it.task] = r.id;
    made.push({ task: it.task, cli: it.cli, id: r.id, links: c.links.map(l => `${l.relation}->${l.to}`), stances: c.stances.length });
  }
  return made;
}

export const contributionId = (cli, run, task) => derivedId('explorer', `${cli}-cli`, run, task);

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, ...args] = process.argv.slice(2);
  try {
    if (!['snapshot', 'ingest'].includes(mode)) throw new Error('usage: bridge.mjs snapshot <out.md> | ingest <snapshot.md> (<task> <cli> <result.md> <run_id>)...');
    if (mode === 'ingest' && process.env.MYCELIUM_REMOTE_WRITES_APPROVED !== 'yes') throw new Error('ingest writes to memory: requires MYCELIUM_REMOTE_WRITES_APPROVED=yes');
    const { connect } = await import('../src/connection.mjs');
    const { assertDeploymentTarget } = await import('../src/preflight.mjs');
    assertDeploymentTarget(process.env);
    const db = await connect();
    if (mode === 'snapshot') {
      const s = await snapshot(db);
      await writeFile(args[0], s.text, { flag: 'wx' });
      console.log(`SNAPSHOT OK: ${s.ids.length} nodes, ${Buffer.byteLength(s.text)} bytes -> ${args[0]}`);
    } else {
      const snap = await readFile(args[0], 'utf8'), items = [];
      if (args.length < 5 || (args.length - 1) % 4) throw new Error('ingest needs <snapshot> then groups of <task> <cli> <result.md> <run_id>');
      for (let i = 1; i < args.length; i += 4) {
        const [task, cli, file, run] = args.slice(i, i + 4);
        items.push({ task, cli, run, answer: await readFile(file, 'utf8') });
      }
      for (const m of await ingest(db, snap, items)) console.log(`INGESTED ${m.task} (${m.cli}-cli) as ${m.id}: ${m.links.join(', ')}; ${m.stances} stance(s)`);
      const me = createExplorerMemory(db, { agent: 'bridge', run: 'verify' });
      const back = await me.recall({ from: items.map(it => contributionId(it.cli, it.run, it.task)), maxDepth: 1, maxResults: 60 });
      console.log(`VERIFY: recall from the CLI contributions reaches ${back.items.length} nodes and ${back.links.length} links; missing: ${back.missing.length}`);
      console.log('BRIDGE OK');
    }
  } catch (e) {
    console.error(`BRIDGE STOP: ${String(e?.message ?? e).replace(/postgres(?:ql)?:\/\/\S+/gi, '<url>').slice(0, 300)}`);
    process.exitCode = 1;
  }
}
