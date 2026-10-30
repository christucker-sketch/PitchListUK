// Inquiry workbench evaluator: runs every MECHANISM against every CASE on the same seeds, inside the same observation
// contract, and scores against hidden truth that mechanisms cannot reach.
//   node evaluate.mjs [--seeds 8] [--json out.json] [--md out.md] [--max-ms 150000] [--cache f] [--focus a,b]
// Each run gets a FRESH node:vm realm whose global object has a null prototype and no host objects at all: its JSON, Math
// and Function are the realm's own, Math.random is a seeded generator defined inside the realm, and data crosses only as
// primitive strings: outputs are returned as strings built inside the realm (never read via host property access, so no
// mechanism getter or proxy runs outside the time limit). This closes the host-constructor
// route Codex found (C-04). Input goes through ONE own data property, __in, defined non-configurable before the mechanism
// loads, so the mechanism cannot turn it into a setter that would run its code outside the time limit; the call scripts
// are compiled once and reused. vm is still a FAIRNESS boundary, not a security one: on BRIX the evaluator runs in an OS sandbox.
// Contract for a mechanism script:
//   function create(api) { return { choose(now), observe(obs) } }
//     api   = { budget, seeds: [{id, text}] }         the starting links
//     choose(now) -> { fetch: <id> } | { wait: true }   id must be a page the mechanism has been shown (seed or link)
//     observe(obs)  obs = { t, id, status: 'open'|'closed'|'none', key: string|null, links: [{to, text}] }
// Primary endpoint (fixed before any cycle): VERIFIED = distinct opportunity keys the mechanism observed open while they
// truly were open. Secondary: PRECISION of its final claims (keys whose last observation was open) judged at the HORIZON,
// i.e. whether each claimed opportunity is still open at the end (C-02); reopenings detected, each only by a true-open
// observation inside its own open interval, and mean detection delay (C-01); fetches, wasted fetches, CPU ms.
// Time: cpuMs and the 8 s run budget are PROCESS CPU time (process.cpuUsage), not wall-clock, so other load on the machine
// does not change them much; the per-call vm timeout (250 ms wall) is only a hang guard. Any failed, timed-out or missing
// seed makes that mechanism's comparison INCOMPLETE: no metrics and no paired verdict are published for it (C-06).
import vm from 'node:vm';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeWorld, parseCase } from './world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE = 'baseline-fixed';
const CALL_MS = 250, LOAD_MS = 1000, RUN_CPU_MS = 8000;
const sha = s => createHash('sha256').update(s).digest('hex');
// the cache is bound to the exact evaluator and world code (C-05): changing either invalidates every cached row
export const EVAL_VERSION = sha(readFileSync(join(HERE, 'evaluate.mjs')) + '\0' + readFileSync(join(HERE, 'world.mjs'))).slice(0, 16);
const cpuNow = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const REALM_RNG = 'const __r=(()=>{let a=SEED>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};})();'
  + 'Object.defineProperty(Math,"random",{value:__r,writable:false,configurable:false});';
const wrap = expr => new vm.Script(`(()=>{try{return "R"+(${expr})}catch(e){let m;try{m=String(e&&e.message)}catch{m="unprintable error"}return "E"+m.slice(0,120)}})()`);
const S_CREATE = wrap('(()=>{if(!globalThis.__create)throw new Error("mechanism defines no create(api)");globalThis.__m=__create(JSON.parse(__in));return "ok"})()');
const S_CHOOSE = wrap('JSON.stringify(__m.choose(Number(__in)) ?? {wait:true})');
const S_OBSERVE = wrap('(__m.observe(JSON.parse(__in)), "ok")');
const FAIL = (error, extra = {}) => ({ verified: 0, precision: 0, claims: 0, reopenDetected: 0, reopenEvents: 0, meanReopenDelay: 0, fetches: 0, wasted: 0, cpuMs: 0, ...extra, error });

export function runOne(caseSpec, mechSource, seed) {
  const world = makeWorld(caseSpec, seed), budget = world.budget;
  const box = Object.create(null);
  Object.defineProperty(box, '__in', { value: '', writable: true, enumerable: false, configurable: false });
  const ctx = vm.createContext(box, { codeGeneration: { strings: true, wasm: false }, microtaskMode: 'afterEvaluate' });
  // every call returns a primitive string built INSIDE the realm (and inside the timeout); anything else is a failure
  const call = (script, input, ms = CALL_MS) => {
    box.__in = input;   // a plain own data property (non-configurable): no mechanism code can run on this write
    if (box.__in !== input) throw new Error('mechanism made the input channel read-only');
    const out = script.runInContext(ctx, { timeout: ms });
    if (typeof out !== 'string') throw new Error('mechanism returned a non-string across the boundary');
    if (out[0] === 'E') throw new Error(out.slice(1));
    return out.slice(1);
  };
  try {
    vm.runInContext('"use strict";' + REALM_RNG.replace('SEED', String((seed * 2654435761) >>> 0)), ctx, { timeout: LOAD_MS });
    vm.runInContext('"use strict";' + mechSource + '\n;globalThis.__create = (typeof create === "function") ? create : null;', ctx, { timeout: LOAD_MS });
    call(S_CREATE, JSON.stringify({ budget, seeds: world.seedLinks }), LOAD_MS);
  } catch (e) { return FAIL(`load failed: ${String(e.message).slice(0, 120)}`); }
  const known = new Set(world.seedLinks.map(s => s.id)), lastObs = new Map();
  const tp = new Set(), reopen = world.truth.reopenings().filter(e => e.at < budget);
  const openTimes = new Map();   // key -> times it was observed open while truly open
  let fetches = 0, wasted = 0, cpu = 0, error = null;
  for (let t = 0; t < budget; t++) {
    const c0 = cpuNow();
    let choice;
    try { choice = JSON.parse(call(S_CHOOSE, String(t))); }
    catch (e) { error = `choose failed at t=${t}: ${String(e.message).slice(0, 120)}`; break; }
    if (choice?.wait) { cpu += cpuNow() - c0; if (cpu > RUN_CPU_MS) { error = `CPU budget ${RUN_CPU_MS} ms exceeded at t=${t}`; break; } continue; }
    const id = choice?.fetch;
    if (!Number.isInteger(id) || !known.has(id)) { error = `t=${t}: fetch of a page it was never shown (${JSON.stringify(choice).slice(0, 60)})`; break; }
    const obs = world.observe(id, t); fetches++;
    for (const l of obs.links) known.add(l.to);
    let gained = false;
    if (obs.status === 'open' && obs.key && world.truth.trulyOpen(id, t)) {
      if (!tp.has(obs.key)) { tp.add(obs.key); gained = true; }
      if (!openTimes.has(obs.key)) openTimes.set(obs.key, []);
      openTimes.get(obs.key).push(t);
    }
    if (obs.key) lastObs.set(obs.key, { status: obs.status, t, id });
    if (!gained) wasted++;
    try { call(S_OBSERVE, JSON.stringify({ t, ...obs })); }
    catch (e) { error = `observe failed at t=${t}: ${String(e.message).slice(0, 120)}`; break; }
    cpu += cpuNow() - c0;   // process CPU, including the world's own work: a coarse cost, comparable across mechanisms
    if (cpu > RUN_CPU_MS) { error = `CPU budget ${RUN_CPU_MS} ms exceeded at t=${t}`; break; }
  }
  const horizon = budget - 1;
  const claims = [...lastObs.values()].filter(o => o.status === 'open');
  const correct = claims.filter(o => world.truth.trulyOpen(o.id, horizon)).length;
  let detected = 0, delay = 0;
  for (const e of reopen) {
    const end = Math.min(e.end, budget), hit = (openTimes.get(e.key) ?? []).find(x => x >= e.at && x < end);
    if (hit !== undefined) { detected++; delay += hit - e.at; } else delay += end - e.at;
  }
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
export const METRICS = ['verified', 'precision', 'reopenDetected', 'meanReopenDelay', 'fetches', 'wasted', 'cpuMs'];

// cache: { "<evaluator version>:<mechanism sha>:<case sha>:<seed>": row } from earlier turns. A row is reused only when the
// evaluator/world code, the mechanism source and the case are byte-identical. Cached rows are VALIDATED and only measured
// fields are taken from them; case, mechanism and seed always come from the request (C-05). focus: names evaluated first,
// so a time cut never drops the turn's own new artifacts.
const ROW_NUM = ['verified', 'precision', 'claims', 'reopenDetected', 'reopenEvents', 'meanReopenDelay', 'fetches', 'wasted', 'cpuMs'];
export function cleanRow(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const out = {};
  for (const k of ROW_NUM) { if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0) return null; out[k] = r[k]; }
  if (out.precision > 1) return null;
  if (r.error !== null && r.error !== undefined && typeof r.error !== 'string') return null;
  out.error = r.error ? String(r.error).slice(0, 200) : null;
  return out;
}
export const seedsFor = (c, seeds) => c.seeds ?? Array.from({ length: seeds }, (_, i) => 101 + i);
export function evaluate({ mechs, cases }, { seeds = 8, maxMs = 150000, cache = {}, focus = [] } = {}) {
  const t0 = Date.now(), rows = [], fresh = {};
  const pairs = [];
  for (const [cn, c] of Object.entries(cases)) for (const mn of Object.keys(mechs)) pairs.push([cn, mn]);
  const prio = ([cn, mn]) => (focus.includes(mn) || focus.includes(cn)) ? 0 : mn === BASELINE ? 1 : 2;
  pairs.sort((a, b) => prio(a) - prio(b));
  let truncated = false;
  for (const [cn, mn] of pairs) {
    const c = cases[cn], src = mechs[mn];
    for (const s of seedsFor(c, seeds)) {
      const key = `${EVAL_VERSION}:${sha(src)}:${sha(JSON.stringify(c))}:${s}`;
      const hit = Object.hasOwn(cache, key) ? cleanRow(cache[key]) : null;
      if (hit) { rows.push({ ...hit, case: cn, mechanism: mn, seed: s }); fresh[key] = hit; continue; }
      if (Date.now() - t0 > maxMs) { truncated = true; continue; }
      let res; try { res = runOne(c, src, s); } catch (e) { res = FAIL(`load failed: ${String(e.message).slice(0, 120)}`); }
      rows.push({ ...res, case: cn, mechanism: mn, seed: s }); fresh[key] = res;
    }
  }
  return { rows, truncated, ms: Date.now() - t0, cache: fresh, seeds };
}

// A (mechanism, case) entry is COMPLETE only when every requested seed has a successful row; otherwise it is published as
// { incomplete: {ok, expected} } with no metrics, and no paired verdict is formed against or for it (C-06). Paired
// differences use exactly the requested seeds, all present on both sides.
export function scoreboard(run, { mechs, cases }) {
  const board = { cases: {}, failures: [], incomplete: [], truncated: run.truncated, ms: run.ms, evaluator: EVAL_VERSION,
    mechanisms: Object.fromEntries(Object.entries(mechs).map(([k, v]) => [k, sha(v).slice(0, 12)])),
    caseHashes: Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, sha(JSON.stringify(v)).slice(0, 12)])) };
  for (const [cn, c] of Object.entries(cases)) {
    const per = {}, want = seedsFor(c, run.seeds ?? 8), okRows = {};
    for (const mn of Object.keys(mechs)) {
      const rs = run.rows.filter(r => r.case === cn && r.mechanism === mn);
      for (const b of rs.filter(r => r.error)) board.failures.push(`${mn} on ${cn} seed ${b.seed}: ${b.error}`);
      const ok = want.map(s => rs.find(r => r.seed === s && !r.error)).filter(Boolean);
      if (ok.length !== want.length) { per[mn] = { incomplete: { ok: ok.length, expected: want.length } }; board.incomplete.push(`${mn} on ${cn}: ${ok.length}/${want.length} seeds`); continue; }
      okRows[mn] = ok;
      per[mn] = Object.fromEntries(METRICS.map(k => [k, stats(ok.map(r => r[k]))]));
    }
    const base = okRows[BASELINE];
    if (base) for (const mn of Object.keys(okRows)) if (mn !== BASELINE)
      per[mn].verifiedVsBaseline = stats(okRows[mn].map((r, i) => r.verified - base[i].verified));
    board.cases[cn] = per;
  }
  return board;
}

const fmt = (s, d = 1) => s ? `${s.mean.toFixed(d)}±${s.se.toFixed(d)}` : '—';
export function renderMarkdown(board) {
  const lines = [`Workbench scoreboard (mean ± standard error over seeds; "vs base" = paired difference in VERIFIED against ${BASELINE}; precision is judged at the horizon; evaluator ${board.evaluator})`, ''];
  for (const [cn, per] of Object.entries(board.cases)) {
    lines.push(`case ${cn} [${board.caseHashes[cn]}]`);
    lines.push('mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms');
    for (const [mn, s] of Object.entries(per)) lines.push(s.incomplete ? `${mn} | INCOMPLETE (${s.incomplete.ok}/${s.incomplete.expected} seeds): not scored` : `${mn} | ${fmt(s.verified)} | ${fmt(s.verifiedVsBaseline)} | ${fmt(s.precision, 2)} | ${fmt(s.reopenDetected)} | ${fmt(s.meanReopenDelay, 0)} | ${fmt(s.wasted, 0)} | ${fmt(s.cpuMs, 0)}`);
    lines.push('');
  }
  if (board.failures.length) lines.push('failures:', ...board.failures.slice(0, 12).map(x => `- ${x}`));
  if (board.truncated) lines.push('NOTE: evaluation was cut at its time limit; entries without every seed are INCOMPLETE and not scored.');
  return lines.join('\n');
}
// The compact form carried in a cycle result when space is short: primary endpoint only.
export function renderCompact(board) {
  const lines = [`Scoreboard, compact (verified, vs ${BASELINE}, precision; evaluator ${board.evaluator}):`];
  for (const [cn, per] of Object.entries(board.cases))
    lines.push(`${cn}: ` + Object.entries(per).map(([mn, s]) => s.incomplete ? `${mn} INCOMPLETE ${s.incomplete.ok}/${s.incomplete.expected}` : `${mn} ${s.verified.mean.toFixed(1)}${s.verifiedVsBaseline ? ` (${s.verifiedVsBaseline.mean >= 0 ? '+' : ''}${s.verifiedVsBaseline.mean.toFixed(1)}±${s.verifiedVsBaseline.se.toFixed(1)})` : ''} p${s.precision.mean.toFixed(2)}`).join('; '));
  if (board.failures.length) lines.push(`failures: ${board.failures.length} (first: ${board.failures[0].slice(0, 160)})`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const all = await loadAll(arg('--dir', HERE));
  let cache = {}; if (arg('--cache')) { try { cache = JSON.parse(await readFile(arg('--cache'), 'utf8')); } catch { cache = {}; } }
  const run = evaluate(all, { seeds: Number(arg('--seeds', 8)), maxMs: Number(arg('--max-ms', 150000)), cache, focus: (arg('--focus', '') || '').split(',').filter(Boolean) });
  if (arg('--cache')) await writeFile(arg('--cache'), JSON.stringify(run.cache));
  const board = scoreboard(run, all), md = renderMarkdown(board);
  if (arg('--compact')) await writeFile(arg('--compact'), renderCompact(board) + '\n');
  if (arg('--json')) await writeFile(arg('--json'), JSON.stringify(board, null, 1));
  if (arg('--md')) await writeFile(arg('--md'), md + '\n');
  console.log(md);
}
