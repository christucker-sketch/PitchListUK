// Regressions for the 4 Nov first live proof defects owned by Claude: D2 (EPIPE crash), D3 (interrupted turn ledger,
// Claude half), D4 (observed-token stop blind to usage reports), D5 (final integration untested). Stand-in CLIs, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runSession, analyze } from '../coordinator.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const repo = () => { const d = mkdtempSync(join(tmpdir(), 'myc-lr-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'b\n'); g('add', '-A'); g('commit', '-qm', 'b'); return d; };
const claude = env => ({ adapter: 'claude-stream', prompt: 'p', command: [process.execPath, join(HERE, 'fixtures', 'fake-claude.mjs')], idleMs: 800, env: { FAKE_CLAUDE_STDIN: 'midturn', ...env } });
const codex = { adapter: 'fake', script: [{ call: 200 }, { emit: 'finding', body: 'codex: fragments matter' }, { call: 4000 }, { done: 'codex done' }] };
const run = (id, env, limits = {}) => runSession({ dir: mkdtempSync(join(tmpdir(), 'myc-lr-')), repo: repo(), id, agents: { claude: claude(env), codex }, limits: { maxWallMs: 20000, maxCallsPerAgent: 6, ...limits } });
const exitOf = (r, a) => r.events.find(e => e.kind === 'exit' && e.data?.agent === a)?.data;

test('D2: a bridge client that vanishes before the reply (EPIPE) does not crash the Claude worker', async () => {
  const r = await run('lr-d2', { FAKE_CLAUDE_DROP: '1' });
  assert.deepEqual([exitOf(r, 'claude').code, exitOf(r, 'claude').signal], [0, null], JSON.stringify(exitOf(r, 'claude')));
});

test('D3: a confirmed Claude turn cut off by the stop is ledgered as active-turn/interrupted with its real interval; unconfirmed is unknown', async () => {
  for (const [echo, interval] of [['1', 'active-turn'], ['', 'unknown']]) {
    const r = await run('lr-d3' + (echo ? 'a' : 'b'), { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_ECHO_FIRST: echo }, { maxWallMs: 2500 });
    const c = r.events.find(e => e.kind === 'call' && e.actor === 'claude' && e.data.permit === 'claude-grant-1');
    assert.ok(c, 'the cut-off turn has a call record');
    assert.equal(c.data.interval, interval); assert.equal(c.data.outcome, 'interrupted');
    assert.ok(Date.parse(c.data.endedAt) - Date.parse(c.data.startedAt) >= 1500, 'real start to observed end');
    assert.equal(c.data.inputTokens, null); assert.equal(c.data.costUsd, null);
    assert.deepEqual([exitOf(r, 'claude').code, exitOf(r, 'claude').signal], [0, null]);
  }
});

test('D4: usage reported while a turn is still running reaches the observed-token stop (no double count of repeated blocks)', async () => {
  const r = await run('lr-d4', { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_USAGE: '8000' }, { maxObservedTokens: 20000, maxWallMs: 15000 });
  const stop = r.events.find(e => e.kind === 'stop');
  assert.match(stop.body, /observed tokens 24000 reached the 20000 threshold/, stop.body);   // 3 messages x 8000, each repeated in 2 blocks
  assert.equal(r.report.usage.claude, 24000);
  assert.equal(r.report.usage.codex, null, 'unreported usage is unknown, not zero');
});

test('D4: Codex-style cumulative snapshots per thread/turn count once (latest per key); calls and snapshots are not added twice', () => {
  const ev = [
    { seq: 1, actor: 'codex', kind: 'note', at: '2026-11-04T00:00:01Z', refs: [], data: { threadId: 't', turnId: 'u', usage: { totalTokens: 8327 } } },
    { seq: 2, actor: 'codex', kind: 'note', at: '2026-11-04T00:00:02Z', refs: [], data: { threadId: 't', turnId: 'u', usage: { totalTokens: 230937 } } },
    { seq: 3, actor: 'codex', kind: 'call', at: '2026-11-04T00:00:03Z', refs: [], data: { inputTokens: 1000, outputTokens: 10 } },
    { seq: 4, actor: 'claude', kind: 'call', at: '2026-11-04T00:00:04Z', refs: [], data: { inputTokens: 900, outputTokens: 200 } }];
  const u = analyze(ev).usage;
  assert.equal(u.codex, 230937); assert.equal(u.claude, 1100);
});

test('D5: the newest integration must itself be tested; an untested final merge is reported, never certified', () => {
  const e = (seq, kind, data) => ({ seq, actor: 'coordinator', kind, at: new Date(seq * 1000).toISOString(), refs: [], data });
  const a = 'a'.repeat(40), b = 'b'.repeat(40);
  let r = analyze([e(1, 'merged', { integration: a }), e(2, 'tested', { integration: a, ok: true, agent: 'codex' }), e(3, 'merged', { integration: b }), e(4, 'tested', { integration: b, ok: true, agent: 'claude' })]);
  assert.equal(r.pass.criteria.sharedTestsPass, true); assert.deepEqual([r.finalIntegration.integration, r.finalIntegration.tested, r.finalIntegration.ok], [b, true, true]);
  r = analyze([e(1, 'merged', { integration: a }), e(2, 'tested', { integration: a, ok: true, agent: 'codex' }), e(3, 'merged', { integration: b })]);
  assert.equal(r.pass.criteria.sharedTestsPass, false); assert.deepEqual([r.finalIntegration.tested, r.finalIntegration.ok], [false, null]);
  r = analyze([e(1, 'merged', { integration: b }), e(2, 'tested', { integration: b, ok: null, refused: 'no sandbox', agent: 'claude' })]);
  assert.equal(r.pass.criteria.sharedTestsPass, false, 'NOT RUN is not a pass'); assert.equal(r.finalIntegration.tested, false);
});
