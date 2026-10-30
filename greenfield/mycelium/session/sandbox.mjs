// Run untrusted code (the shared artifact's tests, written by the models) in an OS sandbox (P0-07). Fails closed: if no
// sandbox backend works, the tests are NOT run and the result says so. The code under test gets a fresh COPY of the
// integration tree (git archive of one commit), so it can modify neither the integration worktree nor Git metadata.
//   backend 'unshare' (root; offline and CI): new mount + network + PID namespace; private tmpfs on /tmp, /var/tmp and
//     /dev/shm; runs as nobody (65534) with no new privileges, a clean environment (PATH and HOME=/nonexistent only),
//     rlimits on CPU time, file size, open files and processes; killing it ends the whole PID namespace.
//   backend 'systemd' (fpd-prod): systemd-run as mycexp with the myc-post property set (PrivateNetwork, ProtectSystem=
//     strict, ProtectHome, PrivateTmp, NoNewPrivileges, MemoryMax, TasksMax, RuntimeMaxSec, CPUQuota). Not exercised here.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const SANDBOX_ROOT = process.env.MYC_SANDBOX_ROOT ?? '/run/myc-session-sandbox';   // must NOT be under /tmp (it is replaced inside)
const NOBODY = 65534;
const INNER = `set -e
mount --make-rprivate /
for d in /tmp /var/tmp /dev/shm; do if [ -d "$d" ]; then mount -t tmpfs -o size=64m,mode=1777,nosuid,nodev tmpfs "$d"; fi; done
cd "$MYC_SBX_WORK"
exec setpriv --reuid=${NOBODY} --regid=${NOBODY} --clear-groups --no-new-privs -- \\
  prlimit --cpu=60 --fsize=67108864 --nofile=256 --nproc=256 -- env -i PATH="$MYC_SBX_PATH" HOME=/nonexistent LANG=C.UTF-8 "$@"`;

export function sandboxAvailable(backend = 'unshare') {
  if (backend === 'systemd') return process.getuid?.() === 0 && existsSync('/run/systemd/system');
  if (backend !== 'unshare' || process.getuid?.() !== 0) return false;
  try { execFileSync('unshare', ['--mount', '--net', '--pid', '--fork', '--kill-child', '--', 'true'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; }
}

// cmd: argv array run in the copy's root. Resolves { ok, code, tail, ms } or { ok: false, refused } without running.
export function runSandboxed(cmd, { repoDir, commit, backend = 'unshare', timeoutMs = 60000, signal } = {}) {
  if (!sandboxAvailable(backend)) return Promise.resolve({ ok: false, refused: `no working ${backend} sandbox: tests not run (fail closed)` });
  mkdirSync(SANDBOX_ROOT, { recursive: true, mode: 0o711 }); chmodSync(SANDBOX_ROOT, 0o711);
  const box = mkdtempSync(join(SANDBOX_ROOT, 't-')), work = join(box, 'work');
  mkdirSync(work);
  execFileSync('bash', ['-c', 'git -C "$1" archive "$2" | tar -x -C "$3"', '_', repoDir, commit, work]);
  execFileSync('chown', ['-R', `${NOBODY}:${NOBODY}`, work]); chmodSync(box, 0o711);
  const path = [dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':');
  const t0 = Date.now();
  return new Promise(resolve => {
    let out = '';
    const argv = backend === 'unshare'
      ? ['unshare', '--mount', '--net', '--pid', '--fork', '--kill-child', '--', 'sh', '-c', INNER, 'sbx', ...cmd]
      : ['systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec', '-p', 'User=mycexp', '-p', 'Group=mycexp', '-p', 'PrivateNetwork=yes',
         '-p', 'IPAddressDeny=any', '-p', 'ProtectSystem=strict', '-p', 'ProtectHome=yes', '-p', 'PrivateTmp=yes', '-p', 'NoNewPrivileges=yes', '-p', `ReadWritePaths=${work}`,
         '-p', 'MemoryMax=512M', '-p', 'TasksMax=64', '-p', `RuntimeMaxSec=${Math.ceil(timeoutMs / 1000)}`, '-p', 'CPUQuota=200%', '-p', `WorkingDirectory=${work}`,
         '-p', 'Environment=HOME=/nonexistent', '-p', `Environment=PATH=${path}`, '--', ...cmd];
    const p = spawn(argv[0], argv.slice(1), { env: { PATH: process.env.PATH, MYC_SBX_WORK: work, MYC_SBX_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const kill = () => { try { process.kill(-p.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(kill, timeoutMs);
    const onAbort = () => kill();
    signal?.addEventListener('abort', onAbort, { once: true });
    const keep = d => { out = (out + d).slice(-4000); };
    p.stdout.on('data', keep); p.stderr.on('data', keep);
    p.on('close', (code, sig) => {
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      try { rmSync(box, { recursive: true, force: true }); } catch {}
      resolve({ ok: code === 0, code, signal: sig, aborted: !!signal?.aborted, tail: out.slice(-600), ms: Date.now() - t0 });
    });
  });
}
