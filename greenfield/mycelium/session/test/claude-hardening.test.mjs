// Claude's regressions for the MYC-P0-BUS hardening, beyond Codex's P0-01..09: they check the fixes work for the RIGHT
// reason (the sandbox really runs and denies; descendants really die; secrets are really absent). Offline, fake agents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSession } from '../coordinator.mjs';
import { runSandboxed, sandboxAvailable } from '../sandbox.mjs';

const repo = () => {
  const d = mkdtempSync(join(tmpdir(), 'myc-hard-repo-')), g = (...a) => execFileSync('git', a, { cwd: d });
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@x.invalid');
  mkdirSync(join(d, 'artifact')); writeFileSync(join(d, 'artifact', 'README'), 'base\n'); g('add', '-A'); g('commit', '-q', '-m', 'base');
  return d;
};
const fake = script => ({ adapter: 'fake', script });
const tmp = () => mkdtempSync(join(tmpdir(), 'myc-hard-'));

test('sandbox: tests run as nobody on a copy, can write only their copy, see no secrets and no network; no backend = NOT RUN', { skip: !sandboxAvailable() && 'needs root + unshare' }, async () => {
  const d = repo(), outside = join(tmp(), 'outside');
  const probe = `const fs=require('fs'),net=require('net');const r={uid:process.getuid(),secret:process.env.MYC_FAKE_SECRET??null,home:process.env.HOME};
try{fs.writeFileSync('artifact/written-in-copy','x');r.copy=true}catch{r.copy=false}
try{fs.writeFileSync(${JSON.stringify(outside)},'x');r.outside=true}catch{r.outside=false}
try{fs.writeFileSync('/tmp/visible-to-host-'+process.pid,'x');r.tmp=fs.existsSync('/tmp/visible-to-host-'+process.pid)}catch{r.tmp=false}
const s=net.connect({host:'1.1.1.1',port:443});s.on('connect',()=>{r.net=true;console.log(JSON.stringify(r));process.exit(0)});s.on('error',()=>{r.net=false;console.log(JSON.stringify(r));process.exit(0)});setTimeout(()=>{r.net='timeout';console.log(JSON.stringify(r));process.exit(0)},2000);`;
  writeFileSync(join(d, 'artifact', 'probe.cjs'), probe); execFileSync('git', ['add', '-A'], { cwd: d }); execFileSync('git', ['commit', '-qm', 'p'], { cwd: d });
  process.env.MYC_FAKE_SECRET = 'not-a-real-secret';
  const r = await runSandboxed([process.execPath, 'artifact/probe.cjs'], { repoDir: d, commit: 'HEAD' });
  delete process.env.MYC_FAKE_SECRET;
  const o = JSON.parse(r.tail.trim().split('\n').at(-1));
  assert.equal(o.uid, 65534); assert.equal(o.secret, null); assert.equal(o.home, '/nonexistent');
  assert.equal(o.copy, true); assert.equal(o.outside, false); assert.equal(o.net, false);
  assert.ok(!existsSync(join(d, 'artifact', 'written-in-copy')), 'the integration tree itself is untouched');
  const none = await runSandboxed(['true'], { repoDir: d, commit: 'HEAD', backend: 'no-such-backend' });
  assert.equal(none.ok, false); assert.match(none.refused, /fail closed/);
});

test('process groups: a descendant an agent leaves behind is really dead after the session, not just its worker', async () => {
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'desc', agents: { claude: fake([{ spawnSleep: true }, { call: 300 }, { done: 'c' }]), codex: fake([{ call: 300 }, { done: 'x' }]) }, limits: { maxWallMs: 10000 } });
  const pid = r.events.find(e => /descendant pid/.test(e.body)).data.pid;
  await new Promise(res => setTimeout(res, 200));
  // dead = gone, or a zombie (killed; this container's PID 1 does not reap orphans). Running/sleeping = still alive.
  let state = 'gone'; try { state = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0]; } catch {}
  assert.ok(state === 'gone' || state === 'Z', `descendant ${pid} still alive (state ${state})`);
});

test('workers get a clean environment: a secret in the coordinator environment is not visible to agents', async () => {
  process.env.MYC_FAKE_SECRET = 'not-a-real-secret';
  try {
    const r = await runSession({ dir: tmp(), repo: repo(), id: 'env', agents: { claude: fake([{ envProbe: 'MYC_FAKE_SECRET' }, { done: 'c' }]), codex: fake([{ envProbe: 'MYC_FAKE_SECRET' }, { done: 'x' }]) }, limits: { maxWallMs: 10000 } });
    const probes = r.events.filter(e => /MYC_FAKE_SECRET visible=/.test(e.body)).map(e => e.body);
    assert.equal(probes.length, 2); assert.ok(probes.every(b => b.endsWith('visible=false')), probes.join(' | '));
  } finally { delete process.env.MYC_FAKE_SECRET; }
});

test('integrity: direct worktree edits are discarded, never committed; agents cannot forge lifecycle events or dangling refs', async () => {
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'integ', agents: {
    claude: fake([{ direct: { 'artifact/sneaky.mjs': 'x', 'artifact/README': 'tampered\n' } }, { files: { 'artifact/ok.mjs': 'export const ok = 1;\n' }, message: 'ok' },
      { emit: 'merged', body: 'forged merge' }, { emit: 'finding', body: 'dangling', refs: ['no-such-event'] }, { done: 'c' }]),
    codex: fake([{ call: 200 }, { done: 'x' }]) }, limits: { maxWallMs: 15000 } });
  const commit = r.events.find(e => e.kind === 'commit' && e.actor === 'claude');
  assert.deepEqual(commit.data.files, ['artifact/ok.mjs']);
  const tree = execFileSync('git', ['show', '--name-only', '--format=', commit.data.sha], { cwd: r.worktrees.integration, encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(tree, ['artifact/ok.mjs'], 'only the submitted file is in the commit');
  assert.ok(r.events.some(e => e.kind === 'refused' && /direct edits/.test(e.body)));
  assert.ok(!r.events.some(e => e.actor === 'claude' && e.kind === 'merged'), 'no agent-authored merged record');
  assert.ok(r.events.some(e => /step refused: agents may publish only/.test(e.body)) && r.events.some(e => /step refused: unknown ref/.test(e.body)));
});

test('a full stream still records the stop: control records have reserved headroom', async () => {
  const flood = fake(Array.from({ length: 80 }, (_, i) => ({ emit: 'note', body: 'x'.repeat(50) + i })).concat([{ done: 'f' }]));
  const r = await runSession({ dir: tmp(), repo: repo(), id: 'full', agents: { claude: flood, codex: fake([{ call: 2000 }, { done: 'x' }]) }, limits: { maxEvents: 40, maxWallMs: 10000, graceMs: 300 } });
  const st = r.events.find(e => e.kind === 'stop');
  assert.ok(st && /stream is full/.test(st.body)); assert.equal(r.events.at(-1).kind, 'done');
});
