// Regression for claude-h1b's two claimed fixes over claude-h1, on 3 fixed seeds (deterministic per seed): a reliability-
// weighted reward stops funding an unlearnable source, and a learned watch-list share recovers revisit timing on weak cues.
// It does NOT claim H1b beats baseline-fixed there: on the 6-seed board it still trails it (decoy -15.0, weak cues -16.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOne, loadAll } from '../evaluate.mjs';

const mean = (c, m, f) => [1, 2, 3].reduce((s, seed) => s + runOne(c, m, seed)[f], 0) / 3;

test('h1b improves on h1 where h1 lost: unlearnable decoy and weak cues with cycles', async () => {
  const { mechs, cases } = await loadAll();
  for (const name of ['claude-unlearnable-decoy', 'claude-weak-cues-cycles']) {
    const h1 = mean(cases[name], mechs['claude-h1'], 'verified'), h1b = mean(cases[name], mechs['claude-h1b'], 'verified');
    assert.ok(h1b > h1, `${name}: h1b ${h1b} should beat h1 ${h1}`);
  }
});

test('h1b keeps most of h1\'s gain where cues are informative (enumerable source)', async () => {
  const { mechs, cases } = await loadAll(), c = cases['claude-enumerable-source'];
  const fixed = mean(c, mechs['baseline-fixed'], 'verified'), h1b = mean(c, mechs['claude-h1b'], 'verified');
  assert.ok(h1b > fixed + 30, `h1b ${h1b} vs fixed ${fixed}`);
});
