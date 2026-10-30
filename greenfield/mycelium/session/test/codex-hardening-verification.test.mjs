// Independent follow-up of Claude 1eb0ca67. Async Git avoids this workspace's spawnSync restriction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runSession, analyze } from '../coordinator.mjs';
import { CodexSession } from '../adapters/codex-app-server.mjs';
const exec = promisify(execFile), temp = () => mkdtempSync(join(tmpdir(), 'myc-verify-'));
async function repo() {
  const d = temp(), git = (...a) => exec('git', a, { cwd: d });
  await git('init', '-qb', 'main'); await git('config', 'user.name', 'offline'); await git('config', 'user.email', 'offline@invalid');
  mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'base'); await git('add', '-A'); await git('commit', '-qm', 'base'); return d;
}
const HERE = dirname(fileURLToPath(import.meta.url));
test('V-01 real Codex adapter runtime must ledger the active turn and consumed steering grants', async () => {
  const outputs = [], permits = [];
  const rpc = { notify() {}, async request(m) {
    if (m === 'thread/start') return { thread: { id: 't' } };
    if (m === 'turn/start') return { turn: { id: 'u' } };
    if (m === 'turn/steer') return { turnId: 'u' };
    return {};
  } };
  const s = new CodexSession({ rpc, reserve: async i => { const p = { id: 'permit-' + permits.length }; permits.push(i); return p; }, publish: async e => { outputs.push(e); return { seq: outputs.length }; }, signal: new AbortController().signal, worktree: '/offline/fixture' });
  await s.start('offline'); await s.deliver([{ id: 'peer-1', body: 'counterexample' }]);
  await rpc.onNotification({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'u', status: 'completed' } } });
  await s.finished;
  const ledger = outputs.filter(e => e.type === 'call');
  assert.equal(ledger.length, permits.length);
  assert.equal(ledger.filter(e => e.interval === 'active-turn').length, 1);
  assert.equal(ledger.filter(e => e.interval === 'steer-ack').length, 1);
  assert.ok(ledger.every(e => e.costUsd === null));
});
test('V-02 pre-existing STOP must refuse all dispatches at startup', async () => {
  const dir = temp(); writeFileSync(join(dir, 'STOP'), '');
  const a = { adapter: 'fake', script: [{ call: 5 }, { done: 'x' }] };
  const r = await runSession({ dir, repo: await repo(), id: 'prestop', agents: { claude: a, codex: a }, limits: { maxWallMs: 2000, graceMs: 50 } });
  assert.equal(r.events.filter(e => e.kind === 'grant').length, 0);
});
test('V-03 SIGKILL exit must fail mechanical acceptance even when exit code is null', () => {
  const e = (seq, actor, kind, ms, refs = [], data = {}) => ({ seq, actor, kind, at: new Date(ms).toISOString(), refs, data });
  const r = analyze([
    e(1, 'claude', 'start', 0), e(2, 'codex', 'start', 1),
    e(3, 'claude', 'finding', 2), e(4, 'codex', 'reply', 3, [3]), e(5, 'claude', 'reply', 4, [4]), e(6, 'claude', 'commit', 5, [4]),
    e(7, 'claude', 'call', 6, [], { startedAt: new Date(0).toISOString(), endedAt: new Date(7).toISOString() }),
    e(8, 'codex', 'call', 7, [], { startedAt: new Date(1).toISOString(), endedAt: new Date(8).toISOString() }),
    e(9, 'coordinator', 'tested', 8, [], { ok: true }), e(10, 'coordinator', 'exit', 9, [], { agent: 'codex', code: null, signal: 'SIGKILL' }), e(11, 'claude', 'done', 10)
  ]);
  assert.equal(r.pass.criteria.noWorkerFailure, false);
});
