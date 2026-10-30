// Claude's tests for the live-readiness fixes Codex asked for (447d4207): least-privilege launch, session-tagged sweep
// (setsid escapes), the pair stopping together, config.env allowlist, integration read, and Claude-adapter abort/ledger
// behaviour. Offline; fake agents; the 'runuser' launcher needs root (it drops to nobody here, to myc on fpd-prod).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession, workerCommand } from '../coordinator.mjs';
import { agentRun as claudeRun } from '../adapters/claude-stream.mjs';

const repo = () => { const d = mkdtempSync(join(tmpdir(), 'myc-l-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid'); mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'b\n'); g('add', '-A'); g('commit', '-qm', 'b'); return d; };
const fake = script => ({ adapter: 'fake', script });
const tmp = () => mkdtempSync(join(tmpdir(), 'myc-l-'));
const state = pid => { try { return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0]; } catch { return 'gone'; } };

test('launcher runuser: workers run as the target account with a clean env and their own runtime dir; IPC still works', { skip: process.getuid() !== 0 && 'needs root' }, async () => {
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'ru', launcher: { mode: 'runuser', user: 'nobody' }, agents: { claude: fake([{ whoami: true }, { call: 200 }, { done: 'c' }]), codex: fake([{ whoami: true }, { call: 200 }, { done: 'x' }]) }, limits: { maxWallMs: 15000 } });
  const who = r.events.filter(e => /^uid=/.test(e.body)).map(e => e.body);
  assert.equal(who.length, 2, JSON.stringify(r.events.map(e => e.body)));
  assert.ok(who.every(b => b.startsWith('uid=65534 ') && /runtime=set/.test(b)), who.join(' | '));
  assert.equal(r.report.grants, 2); assert.ok(r.events.filter(e => e.kind === 'exit').every(e => e.data.code === 0));
});

test('workerCommand: systemd-scope wraps runuser in a transient scope with memory/task caps; bad users refused', () => {
  const c = workerCommand({ mode: 'systemd-scope', user: 'myc', unit: 'myc-session-x-claude', memoryMax: '1500M', tasksMax: 128 }, { HOME: '/home/myc' }, '/opt/w.mjs');
  assert.deepEqual(c.slice(0, 11), ['systemd-run', '--scope', '--quiet', '--collect', '--unit', 'myc-session-x-claude', '-p', 'MemoryMax=1500M', '-p', 'TasksMax=128', '--']);
  assert.deepEqual(c.slice(11, 17), ['runuser', '-u', 'myc', '--', 'env', '-i']);
  assert.ok(c.includes('HOME=/home/myc') && c.includes('NODE_CHANNEL_FD=3') && c.at(-1) === '/opt/w.mjs');
  assert.throws(() => workerCommand({ mode: 'runuser', user: 'root; rm' }, {}, 'w'), /existing account/);
});

test('sweep: a descendant that escaped the process group with setsid is still killed at the end of the session', async () => {
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'sid', agents: { claude: fake([{ spawnSleep: 'setsid' }, { call: 300 }, { done: 'c' }]), codex: fake([{ call: 300 }, { done: 'x' }]) }, limits: { maxWallMs: 10000 } });
  const pid = r.events.find(e => /descendant pid/.test(e.body)).data.pid;
  await new Promise(res => setTimeout(res, 200));
  assert.ok(['gone', 'Z'].includes(state(pid)), `setsid descendant ${pid} alive (${state(pid)})`);
});

test('the pair stops together: one worker crashing, or one agent exhausting its allowance, stops the other promptly', async () => {
  const t0 = Date.now();
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'crash', agents: { claude: fake([{ call: 200 }, { crash: 3 }]), codex: fake([{ call: 20000 }, { done: 'x' }]) }, limits: { maxWallMs: 30000, graceMs: 500 } });
  assert.ok(Date.now() - t0 < 8000, 'did not wait for the peer or the wall clock');
  assert.match(r.events.find(e => e.kind === 'stop').body, /claude worker failed \(code 3\)/);
  assert.equal(r.report.pass.mechanical, false);
  const r2 = await runSession({ dir: tmp(), repo: repo(), id: 'exh', agents: { claude: fake([{ call: 50 }, { call: 50 }, { done: 'c' }]), codex: fake([{ call: 20000 }, { done: 'x' }]) }, limits: { maxWallMs: 30000, maxCallsPerAgent: 1, graceMs: 500 } });
  assert.match(r2.events.find(e => e.kind === 'stop').body, /claude exhausted its dispatch allowance/);
});

test('config.env is an allowlist: HOME, PATH or credentials cannot be injected through it', async () => {
  await assert.rejects(runSession({ dir: tmp(), repo: repo(), id: 'envx', agents: { claude: { adapter: 'fake', script: [], env: { HOME: '/root' } }, codex: fake([]) } }), /may not set HOME/);
  await assert.rejects(runSession({ dir: tmp(), repo: repo(), id: 'envy', agents: { claude: { adapter: 'fake', script: [], env: { GITHUB_TOKEN: 'x' } }, codex: fake([]) } }), /may not set GITHUB_TOKEN/);
});

test('integration read: an agent sees the other agent\'s merged files and the commit to build on', async () => {
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'read', agents: {
    claude: fake([{ files: { 'artifact/claude.mjs': 'export const c = 1;\n' }, message: 'c' }, { emit: 'finding', body: 'claude file is in' }, { call: 300 }, { done: 'c' }]),
    codex: fake([{ await: { actor: 'claude', kind: 'finding' }, label: 'f', timeoutMs: 8000 }, { readState: 'b' }, { files: { 'artifact/codex.mjs': 'export const x = 2;\n' }, message: 'x', base: 'b' }, { done: 'x' }]) }, limits: { maxWallMs: 15000 } });
  const read = r.events.find(e => e.actor === 'codex' && /^read integration/.test(e.body));
  assert.match(read.body, /artifact\/claude\.mjs/);
  const c = r.events.find(e => e.actor === 'codex' && e.kind === 'commit');
  assert.ok(c, 'a submission against the current base is accepted');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'session/read/integration', 'artifact'], { cwd: r.worktrees.integration, encoding: 'utf8' });
  assert.match(files, /claude\.mjs/); assert.match(files, /codex\.mjs/);
});

test('Claude adapter: a grant issued just before STOP launches nothing; a refused ledger line is fatal, not swallowed', async () => {
  const ac = new AbortController(); ac.abort();
  const inbox = { take: () => [], wait: ms => new Promise(r => setTimeout(r, ms)), stopped: false, dropped: 0 };
  const runtime = { reserve: async () => ({ id: 'claude-grant-1' }), publish: async () => ({}), read: async () => ({}), signal: ac.signal };
  const out = []; for await (const o of claudeRun({ agent: 'claude', config: { prompt: 'x', command: ['/bin/false-not-launched'] }, worktree: tmp(), inbox, runtime })) out.push(o);
  assert.deepEqual(out, [], 'returned without spawning the CLI (a spawn of a missing binary would have thrown)');
  const HERE = new URL('.', import.meta.url).pathname;
  const ac2 = new AbortController();
  const rt2 = { reserve: async () => ({ id: 'g1' }), publish: async o => { if (o.type === 'call') throw new Error('refused by coordinator'); return { id: 'x', seq: 1 }; }, read: async () => ({ integration: '0'.repeat(40) }), signal: ac2.signal };
  process.env.FAKE_CLAUDE_STDIN = 'queue';
  const run = (async () => { for await (const _ of claudeRun({ agent: 'claude', config: { prompt: 'x', command: [process.execPath, join(HERE, 'fixtures', 'fake-claude.mjs')], idleMs: 300 }, worktree: tmp(), inbox, runtime: rt2 })) {} })();
  await assert.rejects(run, /ledger record refused/);
  delete process.env.FAKE_CLAUDE_STDIN;
});

test('limits: one submission over 32 KB in total is refused; the observed-token threshold stops the session', async () => {
  const big = 'x'.repeat(17000);
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'subb', agents: { claude: fake([{ files: { 'artifact/a.txt': big, 'artifact/b.txt': big }, message: 'big' }, { done: 'c' }]), codex: fake([{ done: 'x' }]) }, limits: { maxWallMs: 10000 } });
  assert.ok(r.events.some(e => e.kind === 'refused' && /over 32000/.test(e.body)) && !r.events.some(e => e.kind === 'commit'));
  const tok = { adapter: 'fake', script: [{ call: 50 }, { call: 50 }, { call: 20000 }, { done: 'c' }] };   // the fake reports 0 tokens: use a threshold of 0
  const r2 = await runSession({ dir: tmp(), repo: repo(), id: 'tok', agents: { claude: tok, codex: fake([{ call: 20000 }, { done: 'x' }]) }, limits: { maxWallMs: 30000, maxObservedTokens: 0, graceMs: 300 } });
  assert.match(r2.events.find(e => e.kind === 'stop').body, /observed tokens 0 reached the 0 threshold/);
});
