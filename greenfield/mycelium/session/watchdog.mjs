// Independent OS watchdog for a live session on fpd-prod (P0 live-readiness gate). The coordinator's own wall-clock limit
// is a JavaScript timer inside the broker: if the broker hangs or dies, nothing would stop the separately scoped workers.
// This wrapper hands the absolute deadline to PID1 BEFORE anything starts, so it holds even if this process, the broker
// and the workers all hang:
//   1. refuse a reused output folder, or any unit/slice/cgroup this session id already has (no reuse, no foreign units);
//   2. ARM a transient systemd timer myc-watchdog-<id> (deadline = maxWallMs + graceMs, rounded up): when it fires, PID1
//      kills the whole session slice mycp_<id>.slice (cgroup.kill, then systemctl kill/stop), i.e. both worker scopes and
//      any test unit, wherever their processes went (the CLIs drop the MYC_SESSION tag via myc-run's env -i, the cgroup
//      does not let them out);
//   3. start the broker (run.mjs) as transient service myc-session-<id>-broker with RuntimeMaxSec (deadline + 30 s for
//      the report), MYC_SESSION_SLICE set so run.mjs places workers and tests in the slice (run.mjs refuses real model
//      adapters under systemd-scope without it);
//   4. ALWAYS afterwards (normal end, broker failure, SIGINT/SIGTERM): kill the slice, stop the broker unit and the timer,
//      sweep tagged processes (backstop), then verify zero processes in the slice and broker cgroups and zero session units;
//      evidence in <out>/watchdog.json. It touches only units named for this session id. No model, network or install.
//   sudo node watchdog.mjs <manifest.json> <new output dir> [--deadline-s N] [--broker-max-s M]   (overrides only shorten)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionSlice, sweepSession } from './coordinator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BIN = { systemdRun: '/usr/bin/systemd-run', systemctl: '/usr/bin/systemctl', sh: '/bin/sh' };
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function plan({ manifest, manifestPath, out, node = process.execPath, runPath = join(HERE, 'run.mjs'), deadlineS, brokerMaxS, bin = BIN, cgroupRoot = '/sys/fs/cgroup' }) {
  const id = manifest?.id;
  if (!ID_RE.test(id ?? '')) throw new Error('manifest id must be a short slug');
  const { maxWallMs, graceMs } = manifest.limits ?? {};
  if (!Number.isInteger(maxWallMs) || maxWallMs < 1000 || !Number.isInteger(graceMs) || graceMs < 0) throw new Error('manifest limits.maxWallMs and limits.graceMs are required');
  const fullDeadline = Math.ceil((maxWallMs + graceMs) / 1000);
  const d = deadlineS ?? fullDeadline;
  if (!Number.isInteger(d) || d < 1 || d > fullDeadline) throw new Error(`deadline override must be 1..${fullDeadline} s (it may only shorten)`);
  const b = brokerMaxS ?? d + 30;
  if (!Number.isInteger(b) || b < d || b > fullDeadline + 30) throw new Error(`broker limit must be ${d}..${fullDeadline + 30} s`);
  const slice = sessionSlice(id), broker = `myc-session-${id}-broker`, timer = `myc-watchdog-${id}`;
  const kill = `echo 1 > ${cgroupRoot}/${slice}/cgroup.kill 2>/dev/null; ${bin.systemctl} kill --signal=SIGKILL ${slice}; ${bin.systemctl} stop --no-block ${slice}; true`;
  return { id, slice, broker, timer, deadlineS: d, brokerMaxS: b, killCmd: kill,
    arm: [bin.systemdRun, '--quiet', `--unit=${timer}`, `--description=myc session ${id} absolute deadline`, `--on-active=${d}s`, '--timer-property=AccuracySec=100ms', '--', bin.sh, '-c', kill],
    start: [bin.systemdRun, '--wait', `--unit=${broker}`, `--description=myc session ${id} broker`, '--collect', '--service-type=exec', '-p', `RuntimeMaxSec=${b}`, '-p', 'KillMode=control-group',
      `--setenv=MYC_SESSION_SLICE=${slice}`, `--working-directory=${HERE}`, '-p', `StandardOutput=append:${join(out, 'broker.log')}`, '-p', `StandardError=append:${join(out, 'broker.log')}`,
      '--', node, runPath, manifestPath, join(out, 'run')] };
}

function procsUnder(dir) {   // every pid in a cgroup subtree (cgroup v2); missing cgroup = 0
  let n = 0;
  const walk = d => {
    let entries; try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      if (e === 'cgroup.procs') { try { n += readFileSync(p, 'utf8').split('\n').filter(Boolean).length; } catch {} }
      else { try { if (statSync(p).isDirectory()) walk(p); } catch {} }
    }
  };
  walk(dir); return n;
}

export async function watch({ manifestPath, out, bin = BIN, cgroupRoot = '/sys/fs/cgroup', node, runPath, deadlineS, brokerMaxS, settleMs = 5000, log = console.log, signals = true }) {
  manifestPath = resolve(manifestPath); out = resolve(out);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (existsSync(out)) throw new Error(`REFUSED: ${out} already exists (a session never reuses an output folder)`);
  const p = plan({ manifest, manifestPath, out, node, runPath, deadlineS, brokerMaxS, bin, cgroupRoot });
  const sc = (...a) => { try { return execFileSync(bin.systemctl, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch (e) { return e.stdout?.toString().trim() ?? ''; } };
  const units = (states) => sc('list-units', '--all', '--plain', '--no-legend', ...(states ? [`--state=${states}`] : []), `myc-session-${p.id}-*`, `${p.timer}.*`, p.slice).split('\n').filter(Boolean).map(l => l.split(/\s+/)[0]);
  const existing = units();
  if (existing.length || procsUnder(join(cgroupRoot, p.slice)) > 0) throw new Error(`REFUSED: session ${p.id} already has units or processes (${existing.join(', ') || 'slice cgroup'}); use a new id`);
  mkdirSync(out, { recursive: true }); chmodSync(out, 0o711);
  const rec = { schema: 'myc-watchdog-v1', id: p.id, slice: p.slice, broker: p.broker, timer: p.timer, deadlineS: p.deadlineS, brokerMaxS: p.brokerMaxS, manifest: manifestPath,
    armedAt: null, startedAt: null, endedAt: null, brokerExit: null, interrupted: null, fired: null, leftovers: null, clean: false };
  const save = () => writeFileSync(join(out, 'watchdog.json'), JSON.stringify(rec, null, 1) + '\n');
  // 2. arm FIRST: if PID1 does not hold the deadline, nothing starts
  try { execFileSync(p.arm[0], p.arm.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }); }
  catch (e) { rec.error = `could not arm the PID1 deadline timer: ${String(e.stderr ?? e.message).slice(0, 300)}`; save(); throw new Error(`REFUSED: ${rec.error}; nothing was started`); }
  rec.armedAt = new Date().toISOString(); save();
  log(`watchdog armed: ${p.timer}.timer kills ${p.slice} after ${p.deadlineS} s; broker limit ${p.brokerMaxS} s`);
  // 3. broker as a PID1-limited service; wait for it, but leave on a signal
  let interrupted = null, child = null;
  const onSig = s => { interrupted = s; try { child?.kill('SIGTERM'); } catch {} };
  if (signals) for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, onSig);
  rec.startedAt = new Date().toISOString(); save();
  let summary = '';
  rec.brokerExit = await new Promise(res => {
    child = spawn(p.start[0], p.start.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', d => { summary = (summary + d).slice(-2000); });
    child.on('error', e => res({ code: null, error: String(e.message).slice(0, 200) }));
    child.on('close', (code, signal) => res({ code, signal }));
  });
  rec.brokerSummary = summary.trim().split('\n').slice(-4);
  if (signals) for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(s, onSig);
  rec.interrupted = interrupted;
  // 4. always: record whether the deadline fired, then take everything of this session down and verify
  const trig = sc('show', '-p', 'LastTriggerUSec', '--value', `${p.timer}.timer`);
  rec.fired = !!trig && trig !== 'n/a' && trig !== '0';
  try { execFileSync(bin.sh, ['-c', p.killCmd], { stdio: 'ignore', timeout: 15000 }); } catch {}
  sc('stop', `${p.broker}.service`); sc('stop', p.slice); sc('stop', `${p.timer}.timer`);
  sc('reset-failed', `${p.broker}.service`, `${p.timer}.service`, `${p.timer}.timer`, p.slice, `myc-session-${p.id}-claude.scope`, `myc-session-${p.id}-codex.scope`);
  const tagged = () => sweepSession(`${p.id}-claude`) + sweepSession(`${p.id}-codex`);
  rec.taggedKilled = tagged();
  const count = () => ({ sliceProcs: procsUnder(join(cgroupRoot, p.slice)), brokerProcs: procsUnder(join(cgroupRoot, 'system.slice', `${p.broker}.service`)), units: units('active,activating,deactivating,reloading,failed'), tagged: tagged() });
  let left = count();
  for (const t0 = Date.now(); (left.sliceProcs || left.brokerProcs || left.units.length || left.tagged) && Date.now() - t0 < settleMs;) { await new Promise(r => setTimeout(r, 200)); left = count(); }
  rec.leftovers = left;
  rec.clean = !left.sliceProcs && !left.brokerProcs && !left.units.length && !left.tagged;
  rec.endedAt = new Date().toISOString(); save();
  log(`watchdog: broker ${JSON.stringify(rec.brokerExit)}${interrupted ? `, interrupted by ${interrupted}` : ''}; deadline ${rec.fired ? 'FIRED' : 'not reached'}; leftovers ${JSON.stringify(left)}; ${rec.clean ? 'CLEAN' : 'NOT CLEAN'}`);
  log(`evidence ${join(out, 'watchdog.json')}  broker log ${join(out, 'broker.log')}  session ${join(out, 'run')}`);
  return rec;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); if (i < 0) return undefined; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
  const deadlineS = opt('--deadline-s'), brokerMaxS = opt('--broker-max-s');
  const [manifestPath, out] = args;
  if (!manifestPath || !out || args.length !== 2) { console.error('usage: sudo node watchdog.mjs <manifest.json> <new output dir> [--deadline-s N] [--broker-max-s M]'); process.exit(2); }
  if (process.getuid?.() !== 0 || !existsSync('/run/systemd/system')) { console.error('REFUSED: root on a systemd host only'); process.exit(2); }
  try { const r = await watch({ manifestPath, out, deadlineS, brokerMaxS }); process.exit(r.clean && r.brokerExit?.code === 0 && !r.interrupted ? 0 : 1); }
  catch (e) { console.error(String(e.message).slice(0, 500)); process.exit(2); }
}
