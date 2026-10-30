// Inquiry workbench evaluator: runs every MECHANISM against every CASE on the same seeds, inside the same observation
// contract, and scores against hidden truth that mechanisms cannot reach.
//   node evaluate.mjs [--seeds 8] [--json out.json] [--md out.md] [--max-ms 150000]
// Mechanisms are plain scripts (mechanisms/*.js) evaluated in a fresh node:vm context per run, with only a seeded random(),
// Math, JSON and the data it is handed. Data crosses the boundary as JSON text, so no host object, world or truth is
// reachable from inside. (vm is a FAIRNESS boundary, not a security one: on BRIX the evaluator itself runs in an OS
// sandbox with no network and no credentials; see post/.)
// Contract for a mechanism script:
//   function create(api) { return { choose(now), observe(obs) } }
//     api   = { budget, seeds: [{id, text}] }         the starting links
//     choose(now) -> { fetch: <id> } | { wait: true }   id must be a page the mechanism has been shown (seed or link)
//     observe(obs)  obs = { t, id, status: 'open'|'closed'|'none', key: string|null, links: [{to, text}] }
// Primary endpoint (fixed before any cycle): VERIFIED = distinct opportunity keys the mechanism observed open while they
// truly were open. Secondary: precision of its final claims (keys whose last observation was open), reopenings detected
// and mean detection delay, fetches, wasted fetches, CPU ms. Paired against the baseline-fixed mechanism, seed by seed.
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeWorld, parseCase, rng } from './world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE = 'baseline-fixed';
const CALL_MS = 50, RUN_CPU_MS = 8000;
const sha = s => createHash('sha256').update(s).digest('hex');

export function runOne(caseSpec, mechSource, seed) {
  const world = makeWorld(caseSpec, seed), budget = world.budget;
  const ctx = vm.createContext({ Math: Object.create(Math), JSON, __in: '', __out: '' });
  const r = rng(seed * 2654435761 >>> 0);
  ctx.Math.random = () => r();
  const call = code => { ctx.__out = ''; vm.runInContext(code, ctx, { timeout: CALL_MS }); return ctx.__out; };
  try {
    vm.runInContext('"use strict";' + mechSource + '\n;globalThis.__create = (typeof create === "function") ? create : null;', ctx, { timeout: 500 });
    ctx.__in = JSON.stringify({ budget, seeds: world.seedLinks });
    call('if (!globalThis.__create) throw new Error("mechanism defines no create(api)"); globalThis.__m = __create(JSON.parse(__in)); __out = "ok";');
  } catch (e) { return { verified: 0, precision: 0, claims: 0, reopenDetected: 0, reopenEvents: 0, meanReopenDelay: 0, fetches: 0, wasted: 0, cpuMs: 0, error: `load failed: ${String(e.message).slice(0, 120)}` }; }
  const known = new Set(world.seedLinks.map(s => s.id)), lastObs = new Map(), visits = new Map();
  const tp = new Set(), reopen = world.truth.reopenings().filter(e => e.at < budget);
  const firstOpenAfter = new Map();   // key -> times observed truly open
  let fetches = 0, wasted = 0, cpu = 0, error = null;
  for (let t = 0; t < budget; t++) {
    const c0 = performance.now();
    let choice;
    try { ctx.__in = String(t); choice = JSON.parse(call('__out = JSON.stringify(__m.choose(Number(__in)) ?? {wait:true})')); }
    catch (e) { error = `choose failed at t=${t}: ${String(e.message).slice(0, 120)}`; break; }
    if (choice?.wait) { cpu += performance.now() - c0; continue; }
    const id = choice?.fetch;
    if (!Number.isInteger(id) || !known.has(id)) { error = `t=${t}: fetch of a page it was never shown (${JSON.stringify(choice).slice(0, 60)})`; break; }
    const obs = world.observe(id, t); fetches++;
    visits.set(id, (visits.get(id) ?? 0) + 1);
    for (const l of obs.links) known.add(l.to);
    let gained = false;
    if (obs.status === 'open' && obs.key && world.truth.trulyOpen(id, t)) {
      if (!tp.has(obs.key)) { tp.add(obs.key); gained = true; }
      if (!firstOpenAfter.has(obs.key)) firstOpenAfter.set(obs.key, []);
      firstOpenAfter.get(obs.key).push(t);
    }
    if (obs.key) lastObs.set(obs.key, { status: obs.status, t, id });
    if (!gained) wasted++;
    try { ctx.__in = JSON.stringify({ t, ...obs }); call('__m.observe(JSON.parse(__in)); __out = "ok"'); }
    catch (e) { error = `observe failed at t=${t}: ${String(e.message).slice(0, 120)}`; break; }
    cpu += performance.now() - c0;   // includes the world's own work: a coarse cost, comparable across mechanisms
    if (cpu > RUN_CPU_MS) { error = `CPU budget ${RUN_CPU_MS} ms exceeded at t=${t}`; break; }
  }
  const claims = [...lastObs.entries()].filter(([, o]) => o.status === 'open');
  const correct = claims.filter(([, o]) => world.truth.trulyOpen(o.id, o.t)).length;
  let detected = 0, delay = 0;
  for (const e of reopen) { const ts = (firstOpenAfter.get(e.key) ?? []).filter(x => x >= e.at); if (ts.length) { detected++; delay += ts[0] - e.at; } else delay += budget - e.at; }
  return { verified: tp.size, precision: claims.length ? correct / claims.length : 1, claims: claims.length, reopenDetected: detected,
    reopenEvents: reopen.length, meanReopenDelay: reopen.length ? delay / reopen.length : 0, fetches, wasted, cpuMs: Math.round(cpu), error };
}

export async function loadAll(dir = HERE) {
  const mechs = {}, cases = {};
  for (const f of (await readdir(join(dir, 'mechanisms'))).filter(f => /^[a-z0-9-]+\.js$/.test(f)).sort()) mechs[f.replace(/\.js$/, '')] = await readFile(join(dir, 'mechanisms', f), 'utf8');
  for (const f of (await readdir(join(dir, 'cases'))).filter(f => /^[a-z0-9-]+\.json$/.test(f)).sort()) { const c = parseCase(JSON.parse(await readFile(join(dir, 'cases', f), 'utf8'))); cases[c.name] = c; }
  return { mechs, cases };
}

const stats = xs => { const n = xs.length, mu = xs.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1)) : 0; return { mean: mu, se: n > 1 ? sd / Math.sqrt(n) : 0, n }; };
const METRICS = ['verified', 'precision', 'reopenDetected', 'meanReopenDelay', 'fetches', 'wasted', 'cpuMs'];

// cache: { "<mechanism sha>:<case sha>:<seed>": row } from earlier turns. A row is reused only when BOTH the mechanism
// source and the case are byte-identical, so a cycle re-scores only what changed. focus: names evaluated first, so a
// time cut never drops the turn's own new artifacts.
export function evaluate({ mechs, cases }, { seeds = 8, maxMs = 150000, cache = {}, focus = [] } = {}) {
  const t0 = Date.now(), rows = [], fresh = {};
  const pairs = [];
  for (const [cn, c] of Object.entries(cases)) for (const mn of Object.keys(mechs)) pairs.push([cn, mn]);
  const prio = ([cn, mn]) => (focus.includes(mn) || focus.includes(cn)) ? 0 : mn === BASELINE ? 1 : 2;
  pairs.sort((a, b) => prio(a) - prio(b));
  let truncated = false;
  for (const [cn, mn] of pairs) {
    const c = cases[cn], src = mechs[mn], ss = c.seeds ?? Array.from({ length: seeds }, (_, i) => 101 + i);
    for (const s of ss) {
      const key = `${sha(src)}:${sha(JSON.stringify(c))}:${s}`;
      if (cache[key]) { rows.push({ case: cn, mechanism: mn, seed: s, ...cache[key] }); fresh[key] = cache[key]; continue; }
      if (Date.now() - t0 > maxMs) { truncated = true; continue; }
      let res; try { res = runOne(c, src, s); } catch (e) { res = { error: `load failed: ${String(e.message).slice(0, 120)}` }; }
      rows.push({ case: cn, mechanism: mn, seed: s, ...res }); fresh[key] = res;
    }
  }
  return { rows, truncated, ms: Date.now() - t0, cache: fresh };
}

export function scoreboard(run, { mechs, cases }) {
  const board = { cases: {}, failures: [], truncated: run.truncated, ms: run.ms,
    mechanisms: Object.fromEntries(Object.entries(mechs).map(([k, v]) => [k, sha(v).slice(0, 12)])),
    caseHashes: Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, sha(JSON.stringify(v)).slice(0, 12)])) };
  for (const cn of Object.keys(cases)) {
    const per = {};
    for (const mn of Object.keys(mechs)) {
      const rs = run.rows.filter(r => r.case === cn && r.mechanism === mn);
      const bad = rs.filter(r => r.error); for (const b of bad) board.failures.push(`${mn} on ${cn} seed ${b.seed}: ${b.error}`);
      const ok = rs.filter(r => !r.error); if (!ok.length) { per[mn] = null; continue; }
      per[mn] = Object.fromEntries(METRICS.map(k => [k, stats(ok.map(r => r[k]))]));
      const base = run.rows.filter(r => r.case === cn && r.mechanism === BASELINE && !r.error);
      if (mn !== BASELINE && base.length) {
        const d = ok.map(r => { const b = base.find(x => x.seed === r.seed); return b ? r.verified - b.verified : null; }).filter(x => x !== null);
        if (d.length) per[mn].verifiedVsBaseline = stats(d);
      }
    }
    board.cases[cn] = per;
  }
  return board;
}

export function renderMarkdown(board) {
  const f = (s, d = 1) => s ? `${s.mean.toFixed(d)}±${s.se.toFixed(d)}` : '—';
  const lines = [`Workbench scoreboard (mean ± standard error over seeds; "vs base" = paired difference in VERIFIED against ${BASELINE})`, ''];
  for (const [cn, per] of Object.entries(board.cases)) {
    lines.push(`case ${cn} [${board.caseHashes[cn]}]`);
    lines.push('mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms');
    for (const [mn, s] of Object.entries(per)) lines.push(s ? `${mn} | ${f(s.verified)} | ${f(s.verifiedVsBaseline)} | ${f(s.precision, 2)} | ${f(s.reopenDetected)} | ${f(s.meanReopenDelay, 0)} | ${f(s.wasted, 0)} | ${f(s.cpuMs, 0)}` : `${mn} | FAILED`);
    lines.push('');
  }
  if (board.failures.length) lines.push('failures:', ...board.failures.slice(0, 12).map(x => `- ${x}`));
  if (board.truncated) lines.push('NOTE: evaluation was cut at its time limit; the table covers only completed runs.');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const all = await loadAll(arg('--dir', HERE));
  let cache = {}; if (arg('--cache')) { try { cache = JSON.parse(await readFile(arg('--cache'), 'utf8')); } catch { cache = {}; } }
  const run = evaluate(all, { seeds: Number(arg('--seeds', 8)), maxMs: Number(arg('--max-ms', 150000)), cache, focus: (arg('--focus', '') || '').split(',').filter(Boolean) });
  if (arg('--cache')) await writeFile(arg('--cache'), JSON.stringify(run.cache));
  const board = scoreboard(run, all), md = renderMarkdown(board);
  if (arg('--json')) await writeFile(arg('--json'), JSON.stringify(board, null, 1));
  if (arg('--md')) await writeFile(arg('--md'), md + '\n');
  console.log(md);
}
