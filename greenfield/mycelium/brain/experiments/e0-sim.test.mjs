// E0 harness checks: determinism, budget, and that no policy is ever told the hidden families.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, run, policies, experiment } from './e0-sim.mjs';

test('deterministic per seed; every policy stays within budget', () => {
  for (const f of [() => policies.fixed(), () => policies.bandit(), () => policies.bandit({ memory: false }), () => policies.activation()]) {
    const a = run(makeWorld(7, 600), f(), { seed: 3 }), b = run(makeWorld(7, 600), f(), { seed: 3 });
    assert.deepEqual(a, b);
    assert.ok(a.unique <= 600 && a.revisits <= 600 && a.per100 >= 0);
  }
});

test('policies observe only fetch results: the state they receive carries no family label', () => {
  let seen = null;
  const spy = { name: 'spy', session() {}, learn() {}, choose: s => { seen ??= s; return s.frontier.keys().next().value ?? null; } };
  run(makeWorld(9, 50), spy, { seed: 1 });
  assert.deepEqual(Object.keys(seen).sort(), ['frontier', 'lastFetch', 'now', 'r', 'wordOf', 'yielded']);
  for (const [, w] of seen.frontier) assert.equal(typeof w, 'string');   // anchor words only
});

test('experiment returns every policy and metric', () => {
  const r = experiment({ runs: 2, budget: 300 });
  assert.equal(Object.keys(r).length, 4);
  for (const v of Object.values(r)) assert.deepEqual(Object.keys(v).sort(), ['afterChange', 'entropy', 'novel', 'per100', 'reopened', 'revisits', 'unique']);
});
