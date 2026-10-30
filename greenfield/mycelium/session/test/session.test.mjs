// Offline proofs for the concurrent session coordinator (fake agents; no model, no network, no host changes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession } from '../coordinator.mjs';
import { openBus } from '../bus.mjs';

const repo = () => {
  const d = mkdtempSync(join(tmpdir(), 'myc-session-repo-'));
  const g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid');
  mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'shared artifact\n'); g('add', '-A'); g('commit', '-q', '-m', 'base');
  return d;
};
import { TESTS, V2, proofAgents } from '../scenarios/links-proof.mjs';

test('PROOF: both agents run at the same time, react to each other mid-session, and the reaction changes the shared artifact', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const { claude, codex } = proofAgents();
  const r = await runSession({ dir, repo: repo(), id: 'proof', agents: { claude, codex }, testCmd: TESTS, limits: { maxWallMs: 30000 } });
  const ev = r.events, rep = r.report, by = s => ev[s - 1];
  if (process.env.SESSION_DEBUG) for (const e of ev) console.log(e.seq, e.at.slice(11), e.actor, e.kind, e.refs.join(','), e.body.slice(0, 80));
  // (1) overlapping execution, measured from the stream: both sessions live together, and model calls in flight together
  assert.ok(rep.overlapMs > 1000, `sessions overlapped ${rep.overlapMs} ms`);
  assert.ok(rep.callOverlapMs > 200, `calls overlapped ${rep.callOverlapMs} ms`);
  // (2) each agent responded to an intermediate event of the other while both sessions were running
  const mid = rep.midSessionReactions.map(by);
  assert.ok(mid.some(e => e.actor === 'codex' && e.kind === 'challenge'), 'Codex challenged Claude mid-session');
  assert.ok(mid.some(e => e.actor === 'claude' && e.kind === 'reply'), 'Claude replied while Codex was still working');
  // (3) the interaction changed the shared implementation: a Claude commit caused by Codex's challenge turned the shared tests from FAIL to PASS
  assert.ok(rep.commitsCausedByOther.map(by).some(e => e.actor === 'claude' && e.data.files.includes('artifact/links.mjs')));
  const claudeMerges = rep.integrationTests.filter(x => x.agent === 'claude').map(x => x.ok);
  assert.deepEqual(claudeMerges, [false, true]);
  const shared = execFileSync('git', ['show', `session/proof/integration:artifact/links.mjs`], { cwd: r.worktrees.integration, encoding: 'utf8' });
  assert.equal(shared, V2);
  // (4) provenance: an append-only stream with monotonic seq and timestamps, and a call ledger
  assert.deepEqual(ev.map(e => e.seq), ev.map((_, i) => i + 1));
  assert.ok(ev.every((e, i) => !i || Date.parse(e.at) >= Date.parse(ev[i - 1].at)));
  assert.equal(readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').length, ev.length);
  assert.ok(rep.calls.length === 5 && rep.calls.every(c => c.startedAt && c.endedAt && c.ms >= 0));
  assert.equal(rep.stopped, false);
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rep, null, 1));
});

test('STOP file halts both agents promptly; nothing enters the stream after the stop except finished-call ledger lines', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const long = a => ({ adapter: 'fake', script: [{ call: 400 }, { files: { [`artifact/${a}.txt`]: 'x\n' }, message: 'x' }, { call: 20000 }, { emit: 'note', body: 'should never appear' }, { done: 'no' }] });
  setTimeout(() => writeFileSync(join(dir, 'STOP'), ''), 1500);
  const t0 = Date.now(), r = await runSession({ dir, repo: repo(), id: 'stop', agents: { claude: long('claude'), codex: long('codex') }, limits: { maxWallMs: 30000, graceMs: 1500 } });
  assert.ok(Date.now() - t0 < 6000, 'stopped within the grace period');
  const st = r.events.find(e => e.kind === 'stop'); assert.match(st.body, /STOP file/);
  assert.ok(r.events.filter(e => e.seq > st.seq).every(e => e.kind === 'call' || (e.actor === 'coordinator' && e.kind === 'done')));
  assert.ok(!r.events.some(e => /should never appear/.test(e.body)));
});

test('limits: the per-agent call limit stops that agent; the wall-clock limit stops the session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const many = { adapter: 'fake', script: Array.from({ length: 6 }, () => ({ call: 50 })).concat([{ emit: 'note', body: 'past the limit' }, { done: 'x' }]) };
  const idle = { adapter: 'fake', script: [{ call: 50 }, { done: 'codex done' }] };
  const r = await runSession({ dir, repo: repo(), id: 'lim', agents: { claude: many, codex: idle }, limits: { maxCallsPerAgent: 2, maxWallMs: 20000 } });
  assert.ok(r.events.some(e => e.kind === 'limit' && /claude reached its 2-call limit/.test(e.body)));
  assert.ok(!r.events.some(e => /past the limit/.test(e.body)));
  assert.ok(r.events.filter(e => e.kind === 'call' && e.actor === 'claude').length <= 3);
  const dir2 = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const slow = { adapter: 'fake', script: [{ call: 20000 }, { done: 'x' }] };
  const r2 = await runSession({ dir: dir2, repo: repo(), id: 'wall', agents: { claude: slow, codex: slow }, limits: { maxWallMs: 800, graceMs: 800 } });
  assert.match(r2.events.find(e => e.kind === 'stop').body, /wall-clock limit/);
});

test('safety: paths outside the allowlist, traversal and symlinks are refused; a merge conflict leaves integration unchanged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const claude = { adapter: 'fake', script: [{ files: { '../escape.js': 'x', 'notes/x.md': 'x', 'artifact/.hidden': 'x', 'artifact/same.mjs': 'export const v = "claude";\n' }, message: 'mixed' }, { call: 600 }, { done: 'c' }] };
  const codex = { adapter: 'fake', script: [{ call: 300 }, { files: { 'artifact/same.mjs': 'export const v = "codex";\n' }, message: 'same file' }, { call: 600 }, { done: 'x' }] };
  const r = await runSession({ dir, repo: repo(), id: 'safe', agents: { claude, codex }, limits: { maxWallMs: 20000 } });
  const refused = r.events.find(e => e.kind === 'refused');
  assert.ok(refused && /\.\.\/escape\.js/.test(refused.body) && /notes\/x\.md/.test(refused.body) && /\.hidden/.test(refused.body));
  assert.ok(!existsSync(join(dir, 'escape.js')) && !existsSync(join(dir, 'wt-claude', 'notes')));
  assert.ok(r.events.some(e => e.kind === 'conflict' && e.data.agent === 'codex'));
  const shared = execFileSync('git', ['show', 'session/safe/integration:artifact/same.mjs'], { cwd: r.worktrees.integration, encoding: 'utf8' });
  assert.match(shared, /claude/);
});

test('bounded inbox: an agent that falls behind loses the oldest undelivered events and is told how many', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-session-'));
  const flood = { adapter: 'fake', script: [...Array.from({ length: 100 }, (_, i) => ({ emit: 'note', body: `n${i}` })), { call: 1500 }, { done: 'f' }] };
  const slow = { adapter: 'fake', script: [{ busy: 1200 }, { report: 'dropped' }, { done: 's' }] };
  const r = await runSession({ dir, repo: repo(), id: 'inbox', agents: { claude: flood, codex: slow }, limits: { maxWallMs: 20000 } });
  const m = r.events.find(e => e.actor === 'codex' && /inbox dropped=/.test(e.body)).body.match(/dropped=(\d+) seen=(\d+)/);
  assert.ok(Number(m[1]) > 0 && Number(m[2]) <= 64, m[0]);
});

test('bus: append-only, deduplicated by id, refs must point backwards, bounded, durable across reopen', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'myc-bus-')), 'e.jsonl');
  const b = openBus(p, { session: 't', maxEvents: 3 });
  const a = b.append({ actor: 'claude', kind: 'note', body: 'a', id: 'x1' });
  assert.equal(b.append({ actor: 'claude', kind: 'note', body: 'retry', id: 'x1' }).seq, a.seq);
  assert.throws(() => b.append({ actor: 'codex', kind: 'reply', body: 'r', refs: [9] }), /does not exist/);
  assert.throws(() => b.append({ actor: 'someone', kind: 'note', body: 'x' }), /actor/);
  b.append({ actor: 'codex', kind: 'reply', body: 'r', refs: [1] }); b.append({ actor: 'codex', kind: 'note', body: 'c' });
  assert.throws(() => b.append({ actor: 'codex', kind: 'note', body: 'd' }), /full/);
  b.close();
  const b2 = openBus(p, { session: 't', maxEvents: 10 });
  assert.deepEqual(b2.all().map(e => e.body), ['a', 'r', 'c']);
  assert.equal(b2.append({ actor: 'claude', kind: 'note', body: 'e' }).seq, 4);
  b2.close();
});

test('NEGATIVE CONTROLS: parallel solo work, or a reply only after the other agent finished, is NOT counted as mid-session collaboration', async () => {
  const solo = a => ({ adapter: 'fake', script: [{ call: 400 }, { files: { [`artifact/${a}.mjs`]: `export const who = "${a}";\n` }, message: `${a} solo` }, { call: 400 }, { done: `${a} done` }] });
  const r = await runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-session-')), repo: repo(), id: 'solo', agents: { claude: solo('claude'), codex: solo('codex') }, limits: { maxWallMs: 20000 } });
  assert.ok(r.report.overlapMs > 0, 'they did run at the same time');
  assert.deepEqual(r.report.midSessionReactions, []); assert.deepEqual(r.report.commitsCausedByOther, []);
  const claude = { adapter: 'fake', script: [{ call: 200 }, { emit: 'finding', body: 'a finding', label: 'f' }, { done: 'claude done' }] };
  const codex = { adapter: 'fake', script: [{ await: { actor: 'claude', kind: 'done' }, label: 'cd', timeoutMs: 10000 }, { await: { actor: 'claude', kind: 'finding' }, label: 'f', timeoutMs: 100 },
    { emit: 'reply', body: 'a reply after Claude had finished (a handoff, not a conversation)', refs: ['f'] }, { files: { 'artifact/late.mjs': 'export const late = 1;\n' }, message: 'late', refs: ['f'] }, { done: 'codex done' }] };
  const r2 = await runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-session-')), repo: repo(), id: 'handoff', agents: { claude, codex }, limits: { maxWallMs: 20000 } });
  assert.ok(r2.report.crossReactions.length >= 1, 'the late reply does reference Claude');
  assert.deepEqual(r2.report.midSessionReactions, [], 'but it came after Claude ended, so it is not mid-session');
});
