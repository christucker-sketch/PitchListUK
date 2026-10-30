// Deliberately red contract regressions for MYC-0.1-B, against 2c23e316.
// These assert the desired behaviour, not that a bug continues to exist.
// No secrets, network, model calls or host changes; all worlds are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOne, evaluate, scoreboard, BASELINE } from '../evaluate.mjs';
import { makeWorld, parseCase } from '../world.mjs';
const small = { name: 'codex-harness-case', author: 'codex', description: 'regression', budget: 60,
  families: { a: { n: 1, yield: 1, out: 0, to: {}, words: ['x'], seeds: 1, schedule: 'cycle:5' } } };

test('C-01: count a reopening only inside its own open interval, not all missed earlier intervals', () => {
  const w = makeWorld(small, 7), events = w.truth.reopenings();
  assert.ok(events.length > 2);
  const t = events.at(-1).at;
  const src = `function create(api){return {choose(t){return t===${t}?{fetch:api.seeds[0].id}:{wait:true}},observe(){}}}`;
  const r = runOne(small, src, 7);
  assert.equal(r.error, null);
  assert.equal(r.reopenDetected, 1, 'one observation must not retrospectively detect every missed reopening');
});

test('C-02: final-current precision must not certify an un-rechecked closed opportunity', () => {
  const c = { ...small, families: { a: { ...small.families.a, schedule: 'closes_mid' } } };
  const src = 'function create(api){return {choose(t){return t===0?{fetch:api.seeds[0].id}:{wait:true}},observe(){}}}';
  const r = runOne(c, src, 7);
  assert.equal(r.claims, 1); assert.equal(r.precision, 0, 'last observed open is not the same as currently open');
});

test('C-03: case quantities are integral, rather than silently ceil-rounded by loops', () => {
  for (const c of [ { ...small, budget: 60.5 },
    ...['n', 'out', 'seeds'].map(k => ({ ...small, families: { a: { ...small.families.a, [k]: 1.5, out: k === 'out' ? 1.5 : 0, to: k === 'out' ? { a: 1 } : {} } } })) ]) {
    assert.throws(() => parseCase(c), /integer|integral|whole/i);
  }
});

test('C-04: mechanism host-function constructors must not expose the evaluator process', () => {
  // Reads a boolean from process.versions only. Does not inspect env, files or credentials.
  const src = `function create(api){let escaped=false;try{escaped=!!JSON.parse.constructor('return process')().versions.node}catch{}
    return {choose(){return {fetch:escaped?-123456:api.seeds[0].id}},observe(){}}}`;
  const r = runOne(small, src, 7);
  assert.equal(r.error, null, 'host JSON functions crossed the claimed observation/fairness boundary');
});

test('C-05: cached measurements cannot overwrite the requested row identity', () => {
  const src = 'function create(api){return {choose(){return {fetch:api.seeds[0].id}},observe(){}}}';
  const all = { mechs: { [BASELINE]: src }, cases: { [small.name]: small } };
  const first = evaluate(all, { seeds: 1 });
  const cache = structuredClone(first.cache), k = Object.keys(cache)[0];
  cache[k].case = 'forged-case'; cache[k].mechanism = 'forged-mechanism'; cache[k].seed = 999;
  const row = evaluate(all, { seeds: 1, cache }).rows[0];
  assert.equal(row.case, small.name); assert.equal(row.mechanism, BASELINE); assert.equal(row.seed, 101);
});

test('C-06: a partially failed mechanism must not receive a successful-seeds-only paired verdict', () => {
  const row = { verified: 1, precision: 1, reopenDetected: 0, meanReopenDelay: 0, fetches: 1, wasted: 0, cpuMs: 1 };
  const all = { mechs: { [BASELINE]: 'base', 'codex-selective': 'candidate' }, cases: { [small.name]: small } };
  const rows = [101, 102].map(seed => ({ case: small.name, mechanism: BASELINE, seed, ...row }));
  rows.push({ case: small.name, mechanism: 'codex-selective', seed: 101, ...row, verified: 99 });
  rows.push({ case: small.name, mechanism: 'codex-selective', seed: 102, error: 'failed run' });
  const b = scoreboard({ rows, truncated: false, ms: 1 }, all);
  assert.ok(b.failures.length);
  assert.equal(b.cases[small.name]['codex-selective']?.verifiedVsBaseline, undefined,
    'do not publish a favourable paired mean by dropping the failed seed');
});
