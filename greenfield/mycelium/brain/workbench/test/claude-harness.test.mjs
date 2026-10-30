// Claude's regressions for the MYC-0.1-B fixes, beyond Codex's C-01..C-06: the realm boundary against getters, proxies and
// prototype routes; the time limits; and cache validation. All synthetic; no secrets, network or host changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOne, evaluate, scoreboard, BASELINE, EVAL_VERSION } from '../evaluate.mjs';
const small = { name: 'claude-harness-case', author: 'claude', description: 'regression', budget: 60,
  families: { a: { n: 5, yield: 1, out: 1, to: { a: 1 }, words: ['x'], seeds: 1 } } };
const okMech = 'function create(api){return {choose(){return {fetch:api.seeds[0].id}},observe(){}}}';
const withChoose = body => `function create(api){return {choose(t){${body}},observe(){}}}`;

test('realm: no host route through globalThis, Function, errors or JSON', () => {
  const probes = [
    'this.constructor.constructor("return process")()',
    'globalThis.constructor.constructor("return process")()',
    'Object.getPrototypeOf(globalThis)?.constructor?.constructor("return process")()',
    '(function(){return this})().constructor.constructor("return process")()',
    'JSON.constructor.constructor("return process")()',
    'Math.constructor.constructor("return process")()',
  ];
  for (const p of probes) {
    const r = runOne(small, withChoose(`let esc=false;try{esc=!!(${p}).versions}catch{}return esc?{fetch:-1}:{fetch:api.seeds[0].id}`), 7);
    assert.equal(r.error, null, `escaped via ${p}`);
  }
});

test('realm: a throwing getter, a hostile error object or a proxy return cannot run code outside the time limit', () => {
  const cases = [
    withChoose('throw { get message() { for(;;){} } }'),
    withChoose('return new Proxy({}, { get(){ for(;;){} } })'),
    'function create(api){ Object.defineProperty(globalThis,"__out",{get(){for(;;){}}}); return {choose(){return {fetch:api.seeds[0].id}},observe(){}} }',
    withChoose('JSON.stringify = () => ({ toString(){ for(;;){} } }); return {fetch:api.seeds[0].id}'),
  ];
  for (const src of cases) {
    const t0 = Date.now(), r = runOne(small, src, 7);
    assert.ok(Date.now() - t0 < 10000, 'returned in bounded time');
    assert.equal(typeof r.verified, 'number');
  }
});

test('realm: Math.random is seeded inside the realm, reproducible, and cannot be replaced by the mechanism', () => {
  const src = 'function create(api){let tried=false;try{Math.random=()=>0.5;}catch{tried=true}const xs=[Math.random(),Math.random()];return {choose(){return xs[0]===0.5?{fetch:-1}:{fetch:api.seeds[0].id}},observe(){}}}';
  assert.equal(runOne(small, src, 7).error, null);
  const draw = 'function create(api){const v=Math.random();return {choose(){return v<0.5?{fetch:api.seeds[0].id}:{wait:true}},observe(){}}}';
  const noCpu = ({ cpuMs, ...r }) => r;
  assert.deepEqual(noCpu(runOne(small, draw, 3)), noCpu(runOne(small, draw, 3)), 'same seed, same run (cpuMs aside)');
});

test('time: the per-call limit is a hang guard, not a speed test; an endless loop still fails', () => {
  const slow = withChoose('const e=Date.now()+60; while(Date.now()<e){} return {fetch:api.seeds[0].id}');
  const s2 = { ...small, budget: 50 };
  assert.equal(runOne(s2, slow, 7).error, null, 'a 60 ms call (over the old 50 ms wall limit) is not a failure');
  assert.match(runOne(s2, withChoose('for(;;){}'), 7).error, /timed out/);
});

test('cache: malformed rows are ignored and recomputed; keys are bound to the evaluator version', () => {
  const all = { mechs: { [BASELINE]: okMech }, cases: { [small.name]: small } };
  const first = evaluate(all, { seeds: 2 }), keys = Object.keys(first.cache);
  assert.ok(keys.every(k => k.startsWith(EVAL_VERSION + ':')));
  const forged = Object.fromEntries(keys.map(k => [k, { verified: 'lots', precision: 7 }]));
  const again = evaluate(all, { seeds: 2, cache: forged });
  assert.deepEqual(again.rows.map(r => r.verified), first.rows.map(r => r.verified));
  const stale = Object.fromEntries(keys.map(k => ['0000000000000000' + k.slice(16), { ...first.cache[k], verified: 999 }]));
  assert.ok(evaluate(all, { seeds: 2, cache: stale }).rows.every(r => r.verified !== 999), 'rows from another evaluator version are not reused');
});

test('scoreboard: a failed BASELINE seed leaves every paired verdict in that case unscored', () => {
  const row = { verified: 3, precision: 1, claims: 1, reopenDetected: 0, reopenEvents: 0, meanReopenDelay: 0, fetches: 1, wasted: 0, cpuMs: 1, error: null };
  const all = { mechs: { [BASELINE]: 'b', 'claude-x': 'x' }, cases: { [small.name]: small } };
  const rows = [{ ...row, case: small.name, mechanism: BASELINE, seed: 101 }, { ...row, case: small.name, mechanism: BASELINE, seed: 102, error: 'boom' },
    ...[101, 102].map(seed => ({ ...row, case: small.name, mechanism: 'claude-x', seed, verified: 50 }))];
  const b = scoreboard({ rows, truncated: false, ms: 1, seeds: 2 }, all);
  assert.ok(b.cases[small.name][BASELINE].incomplete);
  assert.equal(b.cases[small.name]['claude-x'].verifiedVsBaseline, undefined);
  assert.equal(b.cases[small.name]['claude-x'].verified.mean, 50);
});

test('realm: the input channel cannot be turned into a setter; making it read-only only fails the mechanism itself', () => {
  const setter = 'function create(api){ try { Object.defineProperty(globalThis,"__in",{set(v){for(;;){}},get(){return "1"}}) } catch {} return {choose(){return {fetch:api.seeds[0].id}},observe(){}} }';
  const t0 = Date.now(), r = runOne(small, setter, 7);
  assert.ok(Date.now() - t0 < 10000); assert.equal(r.error, null, 'redefinition is refused (non-configurable), the run is normal');
  const ro = 'function create(api){ Object.defineProperty(globalThis,"__in",{writable:false}); return {choose(){return {fetch:api.seeds[0].id}},observe(){}} }';
  assert.match(runOne(small, ro, 7).error, /read-only|choose failed/);
});
