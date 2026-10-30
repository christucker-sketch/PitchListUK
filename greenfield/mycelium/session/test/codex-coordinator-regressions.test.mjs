// Desired contracts: intentionally RED on Claude f7d54. Temporary local canaries only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openBus } from '../bus.mjs';
import { runSession, analyze } from '../coordinator.mjs';
const exec = promisify(execFile);
const temp = () => mkdtempSync(join(tmpdir(), 'myc-codex-'));
async function repo() {
  const d = temp(), git = (...args) => exec('git', args, { cwd: d });
  await git('init', '-q', '-b', 'main'); await git('config', 'user.name', 'offline'); await git('config', 'user.email', 'offline@invalid');
  mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'base');
  await git('add', '-A'); await git('commit', '-qm', 'base'); return d;
}
const fake = script => ({ adapter: 'fake', script });

test('P0-01 bus byte limit must use UTF-8 bytes, not UTF-16 length', () => {
  const p = join(temp(), 'events'), b = openBus(p, { session: 'x', maxBytes: 500 });
  try { try { b.append({ actor: 'codex', kind: 'note', body: '菇'.repeat(150) }); } catch {} assert.ok(Buffer.byteLength(readFileSync(p)) <= 500); } finally { b.close(); }
});
test('P0-02 duplicate ID with changed actor/body must be rejected, not cross-agent aliasing', () => {
  const b = openBus(join(temp(), 'events'), { session: 'x' });
  try { b.append({ actor: 'claude', kind: 'finding', body: 'a', id: 'shared' }); assert.throws(() => b.append({ actor: 'codex', kind: 'reply', body: 'b', id: 'shared' }), /collision|duplicate|changed/i); } finally { b.close(); }
});
test('P0-03 second writer must not allocate duplicate seq numbers', () => {
  const p = join(temp(), 'events'), a = openBus(p, { session: 'x' }); let b;
  try { assert.throws(() => { b = openBus(p, { session: 'x' }); }, /lock|writer|open/i); } finally { a.close(); b?.close(); }
});
test('P0-04 recovery must validate persisted session/seq/schema before accepting more writes', () => {
  const p = join(temp(), 'events'); writeFileSync(p, JSON.stringify({ seq: 900, session: 'wrong', id: 'x', actor: 'unknown' }) + '\n');
  let b; try { assert.throws(() => { b = openBus(p, { session: 'x' }); }, /invalid|session|seq|actor/i); } finally { b?.close(); }
});
test('P0-05 zero allowance means zero dispatches, not one finished call', async () => {
  const r = await runSession({ dir: temp(), repo: await repo(), id: 'zero', agents: { claude: fake([{ call: 20 }, { done: 'x' }]), codex: fake([{ done: 'x' }]) }, limits: { maxCallsPerAgent: 0, maxWallMs: 3000 } });
  assert.equal(r.events.filter(e => e.kind === 'call').length, 0);
});
test('P0-06 queued integration must not publish changes after STOP', async () => {
  const dir = temp();
  const stopper = setInterval(() => { if (existsSync(join(dir, 'events.jsonl')) && readFileSync(join(dir, 'events.jsonl'), 'utf8').includes('committed')) { writeFileSync(join(dir, 'STOP'), ''); clearInterval(stopper); } }, 10);
  try {
    const r = await runSession({ dir, repo: await repo(), id: 'queued', agents: { claude: fake([{ files: { 'artifact/a': 'x' }, message: 'x' }, { call: 5000 }]), codex: fake([{ call: 5000 }]) }, testCmd: ['bash', '-c', 'sleep 1'], limits: { maxWallMs: 4000, graceMs: 100 } });
    const stop = r.events.find(e => e.kind === 'stop'); assert.ok(stop);
    assert.deepEqual(r.events.filter(e => e.seq > stop.seq && ['commit', 'merged'].includes(e.kind)), []);
  } finally { clearInterval(stopper); }
});
test('P0-07 artifact tests must not write outside their integration sandbox', async () => {
  const canary = join(temp(), 'outside'), source = `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(canary)}, 'outside');`;
  await runSession({ dir: temp(), repo: await repo(), id: 'sandbox', agents: { claude: fake([{ files: { 'artifact/probe.mjs': source }, message: 'canary' }, { call: 500 }]), codex: fake([{ call: 500 }]) }, testCmd: [process.execPath, 'artifact/probe.mjs'], limits: { maxWallMs: 3000 } });
  assert.equal(existsSync(canary), false, 'temporary outside canary was written');
});
test('P0-08 crashed worker lifetime cannot be extended through peer events to fabricate overlap', () => {
  const e = (seq, actor, kind, ms, refs = [], data) => ({ seq, actor, kind, at: new Date(ms).toISOString(), refs, data });
  const r = analyze([e(1, 'claude', 'start', 0), e(2, 'codex', 'start', 1), e(3, 'claude', 'finding', 2), e(4, 'coordinator', 'error', 3, [], { agent: 'claude' }), e(5, 'codex', 'reply', 100, [3]), e(6, 'codex', 'done', 101)]);
  assert.deepEqual(r.midSessionReactions, []);
});
test('P0-09 STOP must terminate descendants, not just worker PIDs', async () => {
  const dir = temp(), canary = join(temp(), 'descendant');
  const stopper = setInterval(() => { if (existsSync(join(dir, 'events.jsonl')) && readFileSync(join(dir, 'events.jsonl'), 'utf8').includes('offline descendant started')) { writeFileSync(join(dir, 'STOP'), ''); clearInterval(stopper); } }, 10);
  try {
    await runSession({ dir, repo: await repo(), id: 'descendant', agents: { claude: { adapter: 'codex-stop-probe', canary }, codex: fake([{ call: 5000 }]) }, limits: { maxWallMs: 3000, graceMs: 100 } });
    await new Promise(r => setTimeout(r, 1100));
    assert.equal(existsSync(canary), false, 'temporary descendant canary written after STOP');
  } finally { clearInterval(stopper); }
});
