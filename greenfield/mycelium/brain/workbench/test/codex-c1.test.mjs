import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { runOne } from '../evaluate.mjs';
const source = await readFile(new URL('../mechanisms/codex-c1.js', import.meta.url), 'utf8');
const create = api => { const c = vm.createContext({}); vm.runInContext(source, c); c.input = JSON.stringify(api); return vm.runInContext('create(JSON.parse(input))', c); };
test('C1 prepares a prospective discriminator and scores it before updating models', () => {
  const m = create({ budget: 100, seeds: [{ id: 0, text: 'unknown' }] });
  assert.equal(m.choose(0).fetch, 0);
  m.observe({ t: 0, id: 0, status: 'closed', key: 'k', links: [] });
  assert.equal(m.diagnostics().checks, 0);
  assert.equal(m.choose(49).fetch, 0);
  m.observe({ t: 49, id: 0, status: 'open', key: 'k', links: [] });
  const d = m.diagnostics();
  assert.equal(d.checks, 1);
  assert.ok(d.loss.persistence > d.loss.frequency, 'an unexpected opening penalises persistence more than the rival frequency model');
});
test('C1 aliases share one watch and newly observed links on a revisit remain usable', () => {
  const m = create({ budget: 100, seeds: [{ id: 0, text: 'x' }, { id: 1, text: 'x' }] });
  m.observe({ t: 0, id: 0, status: 'closed', key: 'same', links: [] });
  m.observe({ t: 1, id: 1, status: 'closed', key: 'same', links: [{ to: 2, text: 'unanticipated' }] });
  assert.equal(m.diagnostics().watches, 1);
  assert.equal(m.choose(2).fetch, 2);
});
test('C1 obeys the observation-only contract and deterministically completes a bounded case', () => {
  assert.ok(Buffer.byteLength(source) <= 8192);
  const c = { name: 'codex-unit', author: 'codex', description: 'contract', budget: 90,
    families: { a: { n: 30, yield: 0.4, out: 2, to: { a: 1 }, words: ['x'], seeds: 2, schedule: 'cycle:15' } } };
  const a = runOne(c, source, 7), b = runOne(c, source, 7);
  assert.equal(a.error, null); assert.ok(a.fetches <= c.budget);
  assert.deepEqual({ ...a, cpuMs: 0 }, { ...b, cpuMs: 0 });
});
