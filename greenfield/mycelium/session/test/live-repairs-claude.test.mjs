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
import { agentRun } from '../adapters/claude-stream.mjs';
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
  for (const [noEcho, interval] of [['', 'active-turn'], ['1', 'unknown']]) {
    const r = await run('lr-d3' + (noEcho ? 'b' : 'a'), { FAKE_CLAUDE_HANG: '1', ...(noEcho ? { FAKE_CLAUDE_NO_ECHO: '1' } : {}) }, { maxWallMs: 2500 });
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

// ---- R1 / R2 (Codex review of the repairs, 4 Nov) ----
const call1 = r => r.events.find(e => e.kind === 'call' && e.actor === 'claude' && e.data.permit === 'claude-grant-1').data;

test('R1: a confirmed interval starts at the CLI acceptance (delayed echo), not at the send; send time kept as sentAt', async () => {
  const r = await run('lr-r1a', { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_ECHO_DELAY: '1200' }, { maxWallMs: 3000 });
  const c = call1(r);
  assert.equal(c.interval, 'active-turn'); assert.equal(c.outcome, 'interrupted');
  assert.ok(Date.parse(c.startedAt) - Date.parse(c.sentAt) >= 1100, `start ${c.startedAt} vs sent ${c.sentAt}`);
  assert.equal(c.ms, Date.parse(c.endedAt) - Date.parse(c.startedAt));
});

test('R1: a turn whose start was never accepted stays unknown even when a result arrives later', async () => {
  const r = await run('lr-r1b', { FAKE_CLAUDE_NO_ECHO: '1' });
  const c = call1(r);
  assert.equal(c.interval, 'unknown'); assert.equal(c.outcome, 'completed'); assert.equal(c.inputTokens, 900, 'the reported usage is still kept');
});

test('R1: a queued stdin delivery is active only from its consumption after the running turn ended; mid-turn ACKs are not activity', async () => {
  const r = await run('lr-r1c', { FAKE_CLAUDE_STDIN: 'queue' });
  const notes = r.events.filter(e => e.actor === 'claude' && /stdin delivery .* consumed/.test(e.body) && e.data.mode === 'queued');
  assert.ok(notes.length >= 1, 'a delivery was queued');
  const first = call1(r);
  for (const n of notes) {
    const permit = r.events.find(e => e.kind === 'grant' && e.data.agent === 'claude' && JSON.stringify(e.data.intent?.ids) === JSON.stringify(n.data.ids)).data.permit;
    const c = r.events.find(e => e.kind === 'call' && e.data.permit === permit).data;
    assert.equal(c.interval, 'active-turn'); assert.equal(c.startedAt, n.data.consumedAt); assert.equal(c.sentAt, n.data.sentAt);
    assert.ok(Date.parse(c.startedAt) >= Date.parse(first.endedAt), 'not counted while the earlier turn was still running');
  }
  assert.ok(!r.events.some(e => e.kind === 'call' && e.data.interval === 'stdin-ack'), 'queue mode folds nothing mid-turn');
});

test('R2: a refused usage report while the session is live stops the Claude adapter; no retry, no further sampling', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myc-r2-')); const wt = join(dir, 'wt'); mkdirSync(wt);
  const ac = new AbortController(); let usageAttempts = 0, grants = 0, t0 = Date.now();
  const runtime = { signal: ac.signal,
    reserve: async () => ({ id: `claude-grant-${++grants}` }),
    read: async () => ({ integration: 'a'.repeat(40), paths: [], files: [] }),
    publish: async out => { if (out.kind === 'note' && out.data?.usage) { usageAttempts++; throw new Error('not recorded'); } return { seq: 1, id: 'x' }; } };
  const inbox = { stopped: false, take: () => [], wait: ms => new Promise(r => setTimeout(r, ms)) };
  process.env.MYC_RUNTIME_DIR = dir;
  const cfg = { prompt: 'p', command: [process.execPath, join(HERE, 'fixtures', 'fake-claude.mjs')], idleMs: 500 };
  const prev = { ...process.env }; Object.assign(process.env, { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_USAGE: '1000', FAKE_CLAUDE_STDIN: 'midturn' });
  try {
    await assert.rejects((async () => { for await (const _ of agentRun({ agent: 'claude', config: cfg, worktree: wt, inbox, runtime })) {} })(), /usage report refused/);
  } finally { for (const k of ['FAKE_CLAUDE_HANG', 'FAKE_CLAUDE_USAGE', 'FAKE_CLAUDE_STDIN', 'MYC_RUNTIME_DIR']) if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  assert.equal(usageAttempts, 1, 'one refused publication, never retried'); assert.ok(Date.now() - t0 < 10000, 'stopped promptly although the turn would never end');
});

// ---- fresh-token cap (6 Nov proposal; owner: the budget must be enough to do real work) ----
test('fresh tokens: cached re-reads do not count; the first live Codex usage was ~35k fresh of 230,937 total', () => {
  const ev = [{ seq: 1, actor: 'codex', kind: 'note', at: '2026-11-04T00:01:56Z', refs: [], data: { threadId: 't', turnId: 'u', usage: { totalTokens: 230937, inputTokens: 228500, cachedInputTokens: 195456, outputTokens: 2437 } } },
    { seq: 2, actor: 'claude', kind: 'note', at: '2026-11-04T00:01:57Z', refs: [], data: { sessionId: 's', usage: { totalTokens: 52000, inputTokens: 1000, cacheReadInputTokens: 45000, cacheCreationInputTokens: 5000, outputTokens: 1000 } } }];
  const r = analyze(ev);
  assert.equal(r.freshUsage.codex, 35481); assert.equal(r.freshUsage.claude, 7000);
  assert.equal(r.usage.codex, 230937); assert.equal(r.usage.claude, 52000);
});

test('fresh tokens: the per-agent cap stops the pair; Claude-style usage without cache reads counts in full', async () => {
  const r = await run('lr-fresh', { FAKE_CLAUDE_HANG: '1', FAKE_CLAUDE_USAGE: '8000' }, { maxFreshTokensPerAgent: 20000, maxWallMs: 15000 });
  assert.match(r.events.find(e => e.kind === 'stop').body, /claude fresh tokens 24000 reached the 20000 per-agent cap/);
  assert.equal(r.report.freshUsage.claude, 24000); assert.equal(r.report.freshUsage.codex, null);
});
