// Offline tests of the independent OS watchdog (watchdog.mjs) with stand-in systemd-run/systemctl that log what PID1
// would be asked to do. They check the ORDER (deadline armed before anything starts), the refusals, that cleanup and
// verification always run, and the run.mjs/coordinator/sandbox slice plumbing. PID1 itself is exercised on fpd-prod
// by brix-rehearsal.sh step 4 (fake agents, shortened deadline), not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, watch } from '../watchdog.mjs';
import { workerCommand, sessionSlice } from '../coordinator.mjs';
import { runSandboxed } from '../sandbox.mjs';
import { manifest as candidate } from '../scenarios/breadcrumb-proof.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const FAKE_RUN = `#!/usr/bin/env node
const fs=require('fs'),{spawn}=require('child_process');const D=process.env.FAKE_WD_DIR,a=process.argv.slice(2);
fs.appendFileSync(D+'/calls.jsonl',JSON.stringify(['systemd-run',...a])+'\\n');
if(a.some(x=>x.startsWith('--on-active='))){process.exit(fs.existsSync(D+'/arm-fails')?1:0);}
const env={...process.env};let out=null;
for(let i=0;i<a.length;i++){if(a[i].startsWith('--setenv=')){const [k,...v]=a[i].slice(9).split('=');env[k]=v.join('=');}
 if(a[i]==='-p'&&a[i+1].startsWith('StandardOutput=append:'))out=a[i+1].slice(22);}
const cmd=a.slice(a.indexOf('--')+1),fd=fs.openSync(out,'a');
const c=spawn(cmd[0],cmd.slice(1),{env,stdio:['ignore',fd,fd]});
process.on('SIGTERM',()=>{c.kill('SIGKILL');process.exit(143);});
c.on('close',code=>{process.stderr.write('Finished with result: '+(code?'exit-code':'success')+'\\n');process.exit(code??1);});
`;
const FAKE_CTL = `#!/usr/bin/env node
const fs=require('fs');const D=process.env.FAKE_WD_DIR,a=process.argv.slice(2);
fs.appendFileSync(D+'/calls.jsonl',JSON.stringify(['systemctl',...a])+'\\n');
if(a[0]==='list-units'&&fs.existsSync(D+'/units'))process.stdout.write(fs.readFileSync(D+'/units'));
if(a[0]==='show')process.stdout.write(fs.existsSync(D+'/fired')?fs.readFileSync(D+'/fired','utf8'):'n/a');
`;
function rig() {
  const d = mkdtempSync(join(tmpdir(), 'wd-')), bin = join(d, 'bin'), cg = join(d, 'cgroup');
  mkdirSync(bin); mkdirSync(cg);
  writeFileSync(join(bin, 'systemd-run'), FAKE_RUN); writeFileSync(join(bin, 'systemctl'), FAKE_CTL);
  chmodSync(join(bin, 'systemd-run'), 0o755); chmodSync(join(bin, 'systemctl'), 0o755);
  writeFileSync(join(d, 'calls.jsonl'), '');
  const m = { id: 'wd-test', limits: { maxWallMs: 600000, graceMs: 5000 } };
  writeFileSync(join(d, 'm.json'), JSON.stringify(m));
  process.env.FAKE_WD_DIR = d;
  const broker = body => { const p = join(d, 'broker.cjs'); writeFileSync(p, body); return p; };
  const calls = () => readFileSync(join(d, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { d, cg, calls, broker, opts: { manifestPath: join(d, 'm.json'), out: join(d, 'out'), bin: { systemdRun: join(bin, 'systemd-run'), systemctl: join(bin, 'systemctl'), sh: '/bin/sh' }, cgroupRoot: cg, settleMs: 300, log: () => {}, signals: false } };
}

test('plan: the candidate gets an absolute 605 s PID1 deadline on its own slice, broker limit 635 s, slice passed to run.mjs', () => {
  const m = candidate(), p = plan({ manifest: m, manifestPath: '/x/m.json', out: '/x/out' });
  assert.equal(p.deadlineS, 605); assert.equal(p.brokerMaxS, 635); assert.equal(p.slice, 'mycp_myc_p0_first_live.slice');
  assert.equal(p.slice, sessionSlice(m.id));
  assert.ok(p.arm.includes('--on-active=605s') && p.arm.includes('--unit=myc-watchdog-myc-p0-first-live'));
  assert.match(p.arm.at(-1), /^date -u \S+ >> \/x\/out\/deadline-fired; /); assert.ok(!p.killCmd.includes('deadline-fired'), 'cleanup kill does not fake a firing');
  assert.throws(() => plan({ manifest: m, manifestPath: 'm', out: '/x/o ut;rm' }), /plain absolute/);
  assert.match(p.killCmd, /cgroup\/mycp_myc_p0_first_live\.slice\/cgroup\.kill/); assert.match(p.killCmd, /systemctl kill --signal=SIGKILL mycp_myc_p0_first_live\.slice/);
  assert.ok(p.start.includes('RuntimeMaxSec=635') && p.start.includes('--setenv=MYC_SESSION_SLICE=mycp_myc_p0_first_live.slice') && p.start.includes('--unit=myc-session-myc-p0-first-live-broker'));
  assert.equal(p.start.at(-1), '/x/out/run'); assert.equal(p.start.at(-2), '/x/m.json'); assert.match(p.start.at(-3), /run\.mjs$/);
});

test('plan: overrides may only shorten; bad ids and missing limits are refused', () => {
  const m = candidate();
  assert.throws(() => plan({ manifest: m, manifestPath: 'm', out: '/o', deadlineS: 606 }), /only shorten/);
  assert.equal(plan({ manifest: m, manifestPath: 'm', out: '/o', deadlineS: 5 }).brokerMaxS, 35);
  assert.throws(() => plan({ manifest: m, manifestPath: 'm', out: '/o', deadlineS: 10, brokerMaxS: 9 }), /broker limit/);
  assert.throws(() => plan({ manifest: m, manifestPath: 'm', out: '/o', brokerMaxS: 636 }), /broker limit/);
  assert.throws(() => plan({ manifest: { ...m, id: 'Bad id' }, manifestPath: 'm', out: '/o' }), /slug/);
  assert.throws(() => plan({ manifest: { id: 'x', limits: {} }, manifestPath: 'm', out: '/o' }), /required/);
});

test('normal end: deadline armed BEFORE the broker starts; cleanup, timer stop and verification always follow; CLEAN', async () => {
  const r = rig(), b = r.broker('console.log("slice=" + process.env.MYC_SESSION_SLICE);');
  const rec = await watch({ ...r.opts, runPath: b });
  const c = r.calls(), arm = c.findIndex(x => x.some(a => a.startsWith('--on-active='))), start = c.findIndex(x => x.includes('--wait'));
  assert.ok(arm >= 0 && start > arm, 'armed first');
  assert.ok(c.slice(0, arm).every(x => x[1] === 'list-units'), 'only the reuse check precedes arming');
  const after = c.slice(start + 1).map(x => x.slice(1).join(' '));
  assert.ok(after.some(s => s === 'kill --signal=SIGKILL mycp_wd_test.slice'));
  assert.ok(after.some(s => s === 'stop myc-watchdog-wd-test.timer') && after.some(s => s === 'stop mycp_wd_test.slice') && after.some(s => s === 'stop myc-session-wd-test-broker.service'));
  assert.equal(rec.brokerExit.code, 0); assert.equal(rec.fired, false); assert.equal(rec.clean, true);
  assert.match(readFileSync(join(r.opts.out, 'broker.log'), 'utf8'), /slice=mycp_wd_test\.slice/);
  assert.equal(JSON.parse(readFileSync(join(r.opts.out, 'watchdog.json'), 'utf8')).clean, true);
});

test('a deadline that fired is known from the PID1 marker even though the one-shot timer is gone (fpd-prod 4 Nov finding)', async () => {
  const r = rig(), b = r.broker(`require('fs').writeFileSync(process.argv[3].replace(/run$/, 'deadline-fired'), '2026-11-04T14:18:22.500Z\\n');process.exit(1);`);
  const rec = await watch({ ...r.opts, runPath: b });
  assert.equal(rec.fired, true); assert.equal(rec.firedAt, '2026-11-04T14:18:22.500Z'); assert.equal(rec.clean, true);
});

test('broker failure and a fired deadline are recorded; cleanup still runs', async () => {
  const r = rig(), b = r.broker('process.exit(3);');
  writeFileSync(join(r.d, 'fired'), 'Wed 2026-11-04 14:00:00 UTC');
  const rec = await watch({ ...r.opts, runPath: b });
  assert.equal(rec.brokerExit.code, 3); assert.equal(rec.fired, true); assert.equal(rec.clean, true);
  assert.ok(r.calls().some(x => x.join(' ') === 'systemctl kill --signal=SIGKILL mycp_wd_test.slice'));
});

test('refusals start NOTHING: reused output folder, existing session units, unarmable deadline', async () => {
  let r = rig(); mkdirSync(r.opts.out);
  await assert.rejects(watch(r.opts), /already exists/); assert.equal(r.calls().length, 0);
  r = rig(); writeFileSync(join(r.d, 'units'), 'myc-session-wd-test-claude.scope loaded active running x\n');
  await assert.rejects(watch(r.opts), /already has units/); assert.ok(!r.calls().some(x => x[0] === 'systemd-run')); assert.ok(!existsSync(r.opts.out));
  r = rig(); mkdirSync(join(r.cg, 'mycp_wd_test.slice')); writeFileSync(join(r.cg, 'mycp_wd_test.slice', 'cgroup.procs'), '4242\n');
  await assert.rejects(watch(r.opts), /already has units or processes/); assert.ok(!r.calls().some(x => x[0] === 'systemd-run'));
  r = rig(); writeFileSync(join(r.d, 'arm-fails'), '');
  await assert.rejects(watch({ ...r.opts, runPath: r.broker('') }), /could not arm/); assert.ok(!r.calls().some(x => x.includes('--wait')), 'no broker without a deadline');
});

test('leftover processes in the slice cgroup make the run NOT CLEAN; the slice cgroup.kill is written', async () => {
  const r = rig(), sl = join(r.cg, 'mycp_wd_test.slice');
  const b = r.broker(`const fs=require('fs');fs.mkdirSync(${JSON.stringify(join(sl, 'myc-session-wd-test-codex.scope'))},{recursive:true});fs.writeFileSync(${JSON.stringify(join(sl, 'myc-session-wd-test-codex.scope', 'cgroup.procs'))},'999999\\n');`);
  const rec = await watch({ ...r.opts, runPath: b });
  assert.equal(rec.clean, false); assert.equal(rec.leftovers.sliceProcs, 1);
  assert.equal(readFileSync(join(sl, 'cgroup.kill'), 'utf8').trim(), '1');
});

test('SIGTERM to the watchdog: it stops waiting, kills the session and records the interruption', async () => {
  const r = rig(), b = r.broker('setTimeout(() => {}, 60000);');
  const script = `import { watch } from ${JSON.stringify(join(ROOT, 'watchdog.mjs'))};
const o = ${JSON.stringify({ ...r.opts, runPath: b, signals: true })}; o.log = () => {};
const rec = await watch(o); console.log(JSON.stringify(rec));`;
  const t0 = Date.now();
  const res = await new Promise(done => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', script], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', d => out += d);
    setTimeout(() => c.kill('SIGTERM'), 1500);
    c.on('close', () => done(out));
  });
  const rec = JSON.parse(res.trim().split('\n').at(-1));
  assert.equal(rec.interrupted, 'SIGTERM'); assert.ok(Date.now() - t0 < 15000);
  assert.ok(r.calls().some(x => x.join(' ') === 'systemctl kill --signal=SIGKILL mycp_wd_test.slice'));
  assert.ok(r.calls().some(x => x.join(' ') === 'systemctl stop myc-watchdog-wd-test.timer'));
});

test('run.mjs: real model adapters under systemd-scope are refused without the watchdog slice, or with a foreign one', () => {
  const d = mkdtempSync(join(tmpdir(), 'wdr-')); writeFileSync(join(d, 'm.json'), JSON.stringify(candidate()));
  const env = { PATH: process.env.PATH };
  let p = spawnSync(process.execPath, [join(ROOT, 'run.mjs'), join(d, 'm.json'), join(d, 'out')], { env, encoding: 'utf8' });
  assert.equal(p.status, 2); assert.match(p.stderr, /only through watchdog\.mjs/); assert.ok(!existsSync(join(d, 'out')), 'nothing created');
  p = spawnSync(process.execPath, [join(ROOT, 'run.mjs'), join(d, 'm.json'), join(d, 'out')], { env: { ...env, MYC_SESSION_SLICE: 'mycp_other.slice' }, encoding: 'utf8' });
  assert.equal(p.status, 2); assert.match(p.stderr, /not this session/); assert.ok(!existsSync(join(d, 'out')));
});

test('slice plumbing: worker scopes and test units join the session slice; misuse is refused', async () => {
  const cmd = workerCommand({ mode: 'systemd-scope', user: 'myc', unit: 'myc-session-a-claude', slice: 'mycp_a.slice' }, { A: '1' }, '/w.mjs');
  assert.deepEqual(cmd.slice(0, 8), ['systemd-run', '--scope', '--quiet', '--collect', '--unit', 'myc-session-a-claude', '--slice', 'mycp_a.slice']);
  assert.ok(!workerCommand({ mode: 'systemd-scope', user: 'myc', unit: 'u' }, {}, '/w').includes('--slice'));
  assert.throws(() => workerCommand({ mode: 'runuser', user: 'myc', slice: 'mycp_a.slice' }, {}, '/w'), /systemd-scope/);
  assert.throws(() => workerCommand({ mode: 'systemd-scope', user: 'myc', unit: 'u', slice: 'system.slice' }, {}, '/w'), /mycp_/);
  const t = await runSandboxed(['true'], { repoDir: '/nonexistent', commit: 'x', backend: 'unshare', slice: 'mycp_a.slice' });
  assert.equal(t.ok, false); assert.match(t.refused, /systemd backend/);
});
