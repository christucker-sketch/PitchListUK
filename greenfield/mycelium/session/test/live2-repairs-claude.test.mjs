// Regressions for the 6 Nov second live proof, Claude-owned: L3 (the agents' own tests run in-session, after and apart
// from the immutable fixed checks) and L4 (Claude in-turn usage is reported as a lower bound). Real unshare sandbox, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession, analyze, testPhases } from '../coordinator.mjs';
import { sandboxAvailable } from '../sandbox.mjs';
const node = process.execPath;
const repo = fixedOk => { const d = mkdtempSync(join(tmpdir(), 'myc-l3-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact')); mkdirSync(join(d, 'checks'));
  writeFileSync(join(d, 'artifact', 'README'), 'b\n');
  writeFileSync(join(d, 'checks', 'fixed.test.mjs'), `import test from 'node:test';import assert from 'node:assert/strict';test('fixed oracle',()=>assert.ok(${fixedOk}));\n`);
  g('add', '-A'); g('commit', '-qm', 'b'); return d; };
const cmd = { fixed: [node, '--test', 'checks/fixed.test.mjs'], supplemental: [node, '--test', '--test-concurrency=1', 'artifact/**/*.test.mjs'] };
const agentTest = body => `import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';test('agent test',()=>{${body}});\n`;
const run = (id, fixedOk, files) => runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-l3-')), repo: repo(fixedOk), id, testCmd: cmd, sandbox: 'unshare',
  agents: { claude: { adapter: 'fake', script: [{ call: 50 }, { files, message: 'submit' }, { done: 'c' }] }, codex: { adapter: 'fake', script: [{ call: 50 }, { done: 'x' }] } },
  limits: { maxWallMs: 30000 } });
const tested = r => r.events.find(e => e.kind === 'tested');
const skip = !sandboxAvailable('unshare') && 'needs root unshare sandbox';

test('L3: the agents\' own tests run in-session; a failing agent test fails the integration although the fixed checks pass', { skip }, async () => {
  const t = tested(await run('l3-a', true, { 'artifact/x.test.mjs': agentTest('assert.equal(1, 2)') }));
  assert.equal(t.data.ok, false); assert.deepEqual(t.data.phases.map(p => [p.phase, p.ok]), [['fixed', true], ['supplemental', false]]);
  assert.match(t.body, /FAIL \[fixed pass, supplemental fail\]/);
});

test('L3: both pass -> PASS; no agent tests at all -> the supplemental phase passes with nothing to run', { skip }, async () => {
  let t = tested(await run('l3-b', true, { 'artifact/x.test.mjs': agentTest('assert.ok(true)') }));
  assert.equal(t.data.ok, true); assert.deepEqual(t.data.phases.map(p => p.ok), [true, true]);
  t = tested(await run('l3-c', true, { 'artifact/impl.mjs': 'export const x = 1;\n' }));
  assert.equal(t.data.ok, true); assert.equal(t.data.phases.length, 2);
});

test('L3: the fixed checks run first in their own copy: an agent test that rewrites them cannot turn a FAIL into a PASS', { skip }, async () => {
  const tamper = agentTest(`fs.writeFileSync('checks/fixed.test.mjs', "import test from 'node:test';test('fake',()=>{});\\n");`);
  const t = tested(await run('l3-d', false, { 'artifact/tamper.test.mjs': tamper }));
  assert.equal(t.data.ok, false); assert.deepEqual(t.data.phases.map(p => [p.phase, p.ok]), [['fixed', false]], 'supplemental never runs after a fixed failure');
});

test('L3: a malformed testCmd is refused before the session starts', async () => {
  assert.throws(() => testPhases({ fixed: 'node --test' }), /argv/); assert.throws(() => testPhases({ supplemental: ['x'] }), /argv/);
  assert.deepEqual(testPhases(['a']), [['fixed', ['a']]]);
  await assert.rejects(runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-l3-')), repo: repo(true), id: 'l3-e', testCmd: { fixed: [] }, agents: { claude: { adapter: 'fake', script: [] }, codex: { adapter: 'fake', script: [] } } }), /testCmd/);
});

test('L4: Claude usage resting on in-turn snapshots is flagged as a lower bound; a final result total clears the flag', () => {
  const snap = { seq: 1, actor: 'claude', kind: 'note', at: '2026-11-06T00:00:01Z', refs: [], data: { sessionId: 's', lowerBound: true, usage: { totalTokens: 77802, inputTokens: 18, outputTokens: 166, cacheReadInputTokens: 55544, cacheCreationInputTokens: 22074 } } };
  let r = analyze([snap]);
  assert.equal(r.usageLowerBound.claude, true); assert.equal(r.usage.claude, 77802); assert.equal(r.usageLowerBound.codex, false);
  r = analyze([snap, { seq: 2, actor: 'claude', kind: 'call', at: '2026-11-06T00:00:02Z', refs: [], data: { interval: 'active-turn', model: 'claude', inputTokens: 20, outputTokens: 9000, totalTokens: 90000, freshTokens: 31000 } }]);
  assert.equal(r.usageLowerBound.claude, false); assert.equal(r.usage.claude, 90000); assert.equal(r.freshUsage.claude, 31000);
});

test('L4 coverage: every finished turn with a terminal total clears the flag; any later unfinished turn sets it again (fresh too)', () => {
  const ev = (seq, kind, data) => ({ seq, actor: 'claude', kind, at: `2026-11-06T00:00:0${seq}Z`, refs: [], data });
  const snap = n => ev(n, 'note', { sessionId: 's', lowerBound: true, usage: { inputTokens: 0, cacheCreationInputTokens: 40, cacheReadInputTokens: 450, outputTokens: 10, totalTokens: 500 } });
  const done = (n, p) => ev(n, 'call', { permit: p, interval: 'active-turn', outcome: 'completed', totalTokens: 900, freshTokens: 90 });
  let r = analyze([snap(1), done(2, 'a'), done(3, 'b')]);
  assert.equal(r.usageLowerBound.claude, false); assert.equal(r.freshUsageLowerBound.claude, false);
  r = analyze([snap(1), done(2, 'a'), ev(3, 'call', { permit: 'b', interval: 'unknown', outcome: 'interrupted', totalTokens: null })]);
  assert.equal(r.usageLowerBound.claude, true); assert.equal(r.freshUsageLowerBound.claude, true);
  r = analyze([snap(1)]);
  assert.equal(r.usageLowerBound.claude, true, 'snapshots with no turn record at all (crash before ledger) are a lower bound');
  r = analyze([snap(1), done(2, 'a'), ev(3, 'call', { permit: 'c', interval: 'stdin-ack', totalTokens: null })]);
  assert.equal(r.usageLowerBound.claude, false, 'a mid-turn stdin ACK is not a turn and carries no usage of its own');
});
