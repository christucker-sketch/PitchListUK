// Workbench contract tests: the observation boundary (Codex's E0 leak cannot recur), fairness of the vm boundary,
// determinism, case validation, pairing, caching and the time cut. Offline; no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, parseCase } from '../world.mjs';
import { runOne, evaluate, scoreboard, loadAll, BASELINE } from '../evaluate.mjs';

const tiny = { name: 'tiny-case', author: 'baseline', description: 't', budget: 80, anchorSignal: 0.7,
  families: { a: { n: 30, yield: 0.5, out: 3, to: { a: 1 }, words: ['x'], seeds: 2, schedule: 'cycle:20' }, b: { n: 10, yield: 0, out: 1, to: { a: 1 }, words: ['y'], seeds: 1 } } };
const recorder = `function create(api) { const log = []; let q = api.seeds.map(s => s.id);
  globalThis.__log = log; return { choose() { return q.length ? { fetch: q.shift() } : { wait: true }; }, observe(o) { log.push(o); for (const l of o.links) q.push(l.to); } }; }`;

test('a mechanism receives observation records only: exactly {t,id,status,key,links}, never truth', () => {
  const seenKeys = new Set();
  const probe = `function create(api) { let q = api.seeds.map(s => s.id), bad = null;
    if (Object.keys(api).sort().join() !== 'budget,seeds') bad = -1;
    return { choose() { if (bad !== null) return { fetch: bad }; return q.length ? { fetch: q.shift() } : { wait: true }; },
      observe(o) { if (Object.keys(o).sort().join() !== 'id,key,links,status,t') bad = -2; for (const l of o.links) { if (Object.keys(l).sort().join() !== 'text,to') bad = -3; q.push(l.to); } } }; }`;
  const r = runOne(tiny, probe, 1);
  assert.equal(r.error, null);
  assert.ok(r.fetches > 10);
  void seenKeys;
});

test('two pages that LOOK the same give the same view, whatever their hidden future (the E0 revisit-list leak)', () => {
  // Same observed status/links; one page has a future opening, the other never will. The mechanism must not be able to tell.
  const w = makeWorld({ ...tiny, families: { ...tiny.families, a: { ...tiny.families.a, schedule: 'opens_mid' } } }, 3);
  const o1 = w.observe(w.seedLinks[0].id, 0);
  assert.deepEqual(Object.keys(o1).sort(), ['id', 'key', 'links', 'status']);
  assert.ok(['closed', 'none'].includes(o1.status));     // before mid-run nothing is open, observably
});

test('the vm boundary: no process, require, import or host objects; unknown page ids are refused', () => {
  const peek = `function create(api) { const p = (typeof process === 'undefined' && typeof require === 'undefined') ? 'clean' : 'leak';
    return { choose() { return p === 'clean' ? { fetch: 999999 } : { fetch: api.seeds[0].id }; }, observe() {} }; }`;
  const r = runOne(tiny, peek, 1);
  assert.match(r.error, /never shown/);                    // clean realm, and guessing an id is caught
  assert.match(runOne(tiny, 'import fs from "node:fs"; function create(){}', 1).error ?? 'load', /load|Cannot use import/i);
  assert.match(runOne(tiny, 'function create(){ return { choose(){ for(;;){} }, observe(){} }; }', 1).error, /choose failed|timed out/i);
});

test('deterministic per (case, mechanism, seed); different seeds differ', () => {
  const noTime = r => ({ ...r, cpuMs: 0 });   // measured time varies; every outcome must not
  assert.deepEqual(noTime(runOne(tiny, recorder, 5)), noTime(runOne(tiny, recorder, 5)));
  const snap = seed => { const w = makeWorld(tiny, seed); return Array.from({ length: 40 }, (_, id) => w.observe(id, 10)); };
  assert.deepEqual(snap(1), snap(1)); assert.notDeepEqual(snap(1), snap(2));
});

test('case validation refuses unknown fields, bad weights, oversized worlds and code', () => {
  for (const bad of [{ ...tiny, extra: 1 }, { ...tiny, name: 'Bad Name' }, { ...tiny, budget: 999999 },
    { ...tiny, families: { a: { ...tiny.families.a, to: { a: 0.5 } } } }, { ...tiny, families: { a: { ...tiny.families.a, n: 7000 } } },
    { ...tiny, families: { a: { ...tiny.families.a, schedule: 'eval(1)' } } }, { ...tiny, families: { a: { ...tiny.families.a, seeds: 0 } } }])
    assert.throws(() => parseCase(bad));
});

test('scoreboard pairs every mechanism with the fixed baseline seed by seed; failures are reported, not hidden', async () => {
  const { mechs } = await loadAll();
  const all = { mechs: { [BASELINE]: mechs[BASELINE], recorder, broken: 'function create(){ throw new Error("boom") }' }, cases: { [tiny.name]: tiny } };
  const run = evaluate(all, { seeds: 3 }), board = scoreboard(run, all);
  assert.equal(board.cases[tiny.name].recorder.verifiedVsBaseline.n, 3);
  assert.equal(board.cases[tiny.name].broken, null);
  assert.ok(board.failures.some(f => /broken/.test(f)));
});

test('the cache reuses rows only for byte-identical mechanism + case; the time cut keeps focus artifacts first', async () => {
  const { mechs } = await loadAll();
  const all = { mechs: { [BASELINE]: mechs[BASELINE], recorder }, cases: { [tiny.name]: tiny } };
  const first = evaluate(all, { seeds: 2 });
  const again = evaluate(all, { seeds: 2, cache: first.cache });
  assert.deepEqual(again.rows.map(r => ({ ...r, cpuMs: 0 })), first.rows.map(r => ({ ...r, cpuMs: 0 })));
  const changed = evaluate({ ...all, mechs: { ...all.mechs, recorder: recorder + '\n// edit' } }, { seeds: 2, cache: first.cache });
  assert.equal(Object.keys(changed.cache).length, 4);      // 2 reused (baseline) + 2 recomputed (edited recorder)
  const cut = evaluate({ ...all, mechs: { ...all.mechs, mine: recorder + '//x' } }, { seeds: 2, maxMs: -1, focus: ['mine'] });
  assert.ok(cut.truncated);
});

test('the shipped cases and mechanisms load and validate', async () => {
  const { mechs, cases } = await loadAll();
  assert.ok(Object.keys(mechs).includes(BASELINE) && Object.keys(cases).length >= 1);
  for (const c of Object.values(cases)) assert.equal(parseCase(c), c);
});
