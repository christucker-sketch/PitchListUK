// Concurrent session coordinator (MYC-P0-BUS). It runs BOTH agent workers at the same time, each a child process in its
// own process group and its own git worktree/branch, and is the single writer of the shared session stream.
//
// Worker <-> coordinator is request/response over IPC:
//   reserve(intent) -> a durable 'grant' event BEFORE the agent may dispatch a model turn or steer (P0-05). Zero allowance
//                      means zero dispatches. A grant whose outcome is unknown stays consumed; nothing is re-issued.
//   publish(out)    -> resolves only after the durable append ('event'), or after commit + merge ('files'), with a receipt.
//                      Model-authored kinds are limited to note/finding/question/challenge/reply; refIds must resolve.
//                      'call' ledger records must carry an unused grant.
//   pull(from)      -> events after a cursor, within a byte budget, never dropped: a slow agent just reads later.
// Files: only the submitted paths, exactly, under the allowlist; no symlinks, no executable modes, no direct worktree edits,
// Git hooks disabled. Each commit is merged into session/<id>/integration and the shared tests run on a COPY of that
// commit inside an OS sandbox (sandbox.mjs; P0-07).
// STOP (file, wall limit, stream exhaustion): the stopping flag is set FIRST; no new mutation starts; an in-flight Git step
// finishes before the 'stop' record, so nothing is committed or merged after it (P0-06); tests are aborted; workers are
// signalled, then their WHOLE process groups are killed after the grace period and again at the end (P0-09). A worker's
// exit is a trusted 'exit' record that ends its live span (P0-08). Workers get a clean environment (no inherited secrets).
// It never calls a model itself.
import { fork, spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, lstatSync, writeFileSync, renameSync, readdirSync, readFileSync, chmodSync, chownSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openBus, AGENT_KINDS } from './bus.mjs';
import { runSandboxed } from './sandbox.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
export const AGENTS = ['claude', 'codex'];
const GIT_ENV = { PATH: process.env.PATH, HOME: '/nonexistent', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C' };
const execFileSyncSafe = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
const git = (cwd, ...args) => run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, maxBuffer: 4 << 20, env: GIT_ENV });

export function checkPath(p, allow) {
  if (typeof p !== 'string' || p.length > 200 || !/^[a-z0-9][a-z0-9._/-]*$/.test(p) || p.split('/').some(s => !s || s === '..' || s.startsWith('.'))) return 'bad path';
  if (!allow.some(a => p.startsWith(a))) return `outside the allowed paths (${allow.join(', ')})`;
  return null;
}
function safeWrite(root, rel, content) {
  let dir = root;
  for (const part of rel.split('/').slice(0, -1)) {
    dir = join(dir, part);
    if (existsSync(dir)) { const s = lstatSync(dir); if (s.isSymbolicLink() || !s.isDirectory()) throw new Error(`${rel}: parent is not a real directory`); }
    else mkdirSync(dir);
  }
  const dst = join(root, rel);
  if (existsSync(dst)) { const s = lstatSync(dst); if (s.isSymbolicLink() || !s.isFile()) throw new Error(`${rel}: destination is not a regular file`); }
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  writeFileSync(tmp, content, { flag: 'wx', mode: 0o644 }); renameSync(tmp, dst);
}

// What an agent is shown: the OTHER agent's findings, questions, challenges, replies and commits, and the coordinator's
// test results, conflicts, refusals and stop. Notes (adapter audit lines), grants, ledger lines, lifecycle and its own
// events are recorded but not delivered.
export const relevantTo = (a, e) => e.actor !== a && ((AGENTS.includes(e.actor) && ['finding', 'question', 'challenge', 'reply', 'commit'].includes(e.kind))
  || (e.actor === 'coordinator' && ['tested', 'conflict', 'refused', 'stop', 'limit'].includes(e.kind)));

// config.env may carry only these (test switches and CLI config-dir pointers); nothing else reaches a worker
const ENV_OK = /^(FAKE_[A-Z0-9_]+|CODEX_HOME|CLAUDE_CONFIG_DIR)$/;
// Kill every process that carries this session's tag in its environment, wherever it went (setsid, double fork). Needs
// the coordinator to be able to read /proc/<pid>/environ (root, or the same user). On fpd-prod the systemd scope's
// cgroup kill is the primary mechanism; this sweep is the backstop that also works offline.
export function sweepSession(tag) {
  let killed = 0;
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let env; try { env = readFileSync(`/proc/${d}/environ`, 'latin1'); } catch { continue; }
    if (env.split('\0').includes(`MYC_SESSION=${tag}`)) { try { process.kill(Number(d), 'SIGKILL'); killed++; } catch {} }
  }
  return killed;
}
// How a worker is started. 'local': a forked child (offline tests). 'runuser': drop to an existing account (e.g. myc)
// with a clean environment; the IPC channel is passed through explicitly. 'systemd-scope': the same, inside a transient
// systemd scope with MemoryMax/TasksMax, so STOP kills the whole cgroup (fpd-prod; not exercised offline).
export function workerCommand({ mode = 'local', user, unit, memoryMax = '2G', tasksMax = 256 }, env, workerPath) {
  if (mode === 'local') return null;
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user ?? '')) throw new Error('launcher.user must name an existing account');
  const pairs = Object.entries({ ...env, NODE_CHANNEL_FD: '3', NODE_CHANNEL_SERIALIZATION_MODE: 'json' }).map(([k, v]) => `${k}=${v}`);
  const inner = ['runuser', '-u', user, '--', 'env', '-i', ...pairs, process.execPath, workerPath];
  if (mode === 'runuser') return inner;
  if (mode === 'systemd-scope') return ['systemd-run', '--scope', '--quiet', '--collect', '--unit', unit, '-p', `MemoryMax=${memoryMax}`, '-p', `TasksMax=${tasksMax}`, '--', ...inner];
  throw new Error(`unknown launcher mode ${mode}`);
}

export async function runSession(opts) {
  const { dir, repo, baseRef = 'HEAD', id = 's' + Date.now().toString(36), agents, allow = ['artifact/'], testCmd = null, sandbox = 'unshare', launcher = { mode: 'local' },
    limits: { maxWallMs = 60000, maxCallsPerAgent = 20, maxEvents = 2000, maxBytes = 4_000_000, maxFileBytes = 64000, maxFiles = 8, pullBytes = 24000, readBytes = 24000, graceMs = 2000, testMs = 60000, requireBase = true, maxSubmissionBytes = 32000, maxObservedTokens = Infinity } = {} } = opts;
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) throw new Error('session id must be a short slug');
  for (const a of AGENTS) {
    if (!/^[a-z0-9-]{1,40}$/.test(agents?.[a]?.adapter ?? '')) throw new Error(`agents.${a}.adapter must name a module in adapters/`);
    for (const k of Object.keys(agents[a].env ?? {})) if (!ENV_OK.test(k)) throw new Error(`agents.${a}.env may not set ${k}`);
  }
  mkdirSync(dir, { recursive: true });
  const bus = openBus(join(dir, 'events.jsonl'), { session: id, maxEvents, maxBytes });
  if (existsSync(join(dir, 'STOP'))) {
    bus.append({ actor: 'coordinator', kind: 'stop', body: 'pre-existing STOP: no workers or dispatches started' });
    bus.append({ actor: 'coordinator', kind: 'done', body: `session ${id} refused before startup` });
    const events = bus.all(); bus.close();
    return { id, events, report: analyze(events), worktrees: {} };
  }
  const wt = {}, branch = a => `session/${id}/${a}`;
  for (const a of [...AGENTS, 'integration']) { wt[a] = join(dir, 'wt-' + a); await git(repo, 'worktree', 'add', '-q', '-b', branch(a), wt[a], baseRef); }
  for (const a of [...AGENTS, 'integration']) { await git(wt[a], 'config', 'user.name', a === 'integration' ? 'session-coordinator' : `${a}-agent`); await git(wt[a], 'config', 'user.email', `${a}@mycelium.invalid`); }
  const calls = { claude: 0, codex: 0 }, permits = new Map(), workers = {}, limited = new Set();
  let observedTokens = 0;
  let stopping = false, stopDone = null, mutex = Promise.resolve(), testAbort = new AbortController(), pidCounter = 0;
  const live = new Set();

  // the ONLY append path; returns the event or null (stream full -> stop)
  const append = (actor, kind, body, { refs = [], id: eid, data } = {}) => {
    try {
      const ev = bus.append({ actor, kind, body: String(body).slice(0, 3900), refs: refs.slice(0, 8), id: eid, data });
      for (const a of AGENTS) send(a, { type: 'wake', head: ev.seq });
      return ev;
    } catch (e) { if (/full/.test(e.message)) stop('session stream is full'); else throw e; return null; }
  };
  const send = (a, msg) => { const w = workers[a]; if (!w?.connected) return; try { w.send(msg, () => {}); } catch {} };
  const killGroup = (a, sig) => {
    const w = workers[a]; if (w?.pid) try { process.kill(-w.pid, sig); } catch {}
    if (launcher.mode === 'systemd-scope') try { execFileSyncSafe('systemctl', ['kill', `--signal=${sig}`, `myc-session-${id}-${a}.scope`]); } catch {}
    if (sig === 'SIGKILL') sweepSession(`${id}-${a}`);
  };
  const mut = fn => { const p = mutex.then(() => (stopping ? Promise.reject(new Error('session stopping: no new changes')) : fn())); mutex = p.catch(() => {}); return p; };
  const resolveRefs = refIds => {
    const refs = [];
    for (const r of refIds ?? []) { const e = bus.byId(r); if (!e) throw new Error(`unknown ref ${String(r).slice(0, 80)}`); refs.push(e.seq); }
    return refs;
  };

  function stop(reason) {
    if (stopDone) return stopDone;
    stopping = true;                          // FIRST: no new grant, publication or Git mutation can start
    testAbort.abort();
    stopDone = (async () => {
      await Promise.race([mutex, new Promise(r => setTimeout(r, graceMs))]);   // an in-flight Git step records itself first
      append('coordinator', 'stop', `session stopping: ${reason}`);
      for (const a of AGENTS) send(a, { type: 'stop', reason });
      await new Promise(r => setTimeout(r, graceMs));
      for (const a of AGENTS) killGroup(a, 'SIGKILL');
    })();
    return stopDone;
  }

  async function integrate(agent, out) {
    const files = out.files, refs = resolveRefs(out.refIds);
    if (!Array.isArray(files) || files.length < 1 || files.length > maxFiles) throw new Error(`a submission has 1-${maxFiles} files`);
    const bad = [];
    for (const f of files) {
      const why = checkPath(f?.path, allow) ?? (typeof f?.content !== 'string' || Buffer.byteLength(f.content) > maxFileBytes ? 'content missing or too large' : null);
      if (why) bad.push(`${String(f?.path).slice(0, 80)}: ${why}`);
    }
    if (new Set(files.map(f => f.path)).size !== files.length) bad.push('duplicate paths');
    const total = files.reduce((n, f) => n + Buffer.byteLength(typeof f?.content === 'string' ? f.content : ''), 0);
    if (total > maxSubmissionBytes) bad.push(`submission is ${total} bytes, over ${maxSubmissionBytes}`);
    if (bad.length) { append('coordinator', 'refused', `refused ${agent}'s submission (nothing written): ${bad.join('; ')}`, { refs, data: { agent } }); throw new Error(`submission refused: ${bad.join('; ')}`); }
    const message = String(out.message || `${agent} change`).slice(0, 200);
    if (requireBase && !/^[0-9a-f]{40}$/.test(out.base ?? '')) { append('coordinator', 'refused', `refused ${agent}'s submission: no base commit (read the integration state first)`, { refs, data: { agent } }); throw new Error('submission needs base: the integration commit it was written against'); }
    const commit = await mut(async () => {
      const pre = (await git(wt[agent], 'status', '--porcelain', '--untracked-files=all')).stdout;
      if (pre.trim()) { await git(wt[agent], 'reset', '-q', '--hard'); await git(wt[agent], 'clean', '-qfdx'); append('coordinator', 'refused', `${agent}'s worktree had direct edits outside a submission; they were discarded, not committed`, { data: { agent, status: pre.slice(0, 500) } }); }
      if (out.base) {   // stale-edit check, atomic under the mutex: the change must be written against the CURRENT integration
        const head = (await git(wt.integration, 'rev-parse', 'HEAD')).stdout.trim();
        if (out.base !== head) { append('coordinator', 'refused', `refused ${agent}'s submission: written against ${out.base.slice(0, 12)}, integration is now ${head.slice(0, 12)}; read again and resubmit`, { refs, data: { agent, stale: true, base: out.base, head } }); throw new Error(`stale submission: integration is now ${head}`); }
        await git(wt[agent], 'merge', '-q', '--ff-only', branch('integration'));   // the agent branch catches up to the base
      }
      for (const f of files) safeWrite(wt[agent], f.path, f.content);
      await git(wt[agent], 'add', '--', ...files.map(f => f.path));
      const raw = (await git(wt[agent], 'diff', '--cached', '--raw', '--no-renames')).stdout.trim().split('\n').filter(Boolean);
      const after = (await git(wt[agent], 'status', '--porcelain', '--untracked-files=all')).stdout.split('\n').filter(l => l && !/^[AM] /.test(l));
      if (raw.some(l => !/^:\d{6} 100644 /.test(l)) || after.length) { await git(wt[agent], 'reset', '-q', '--hard'); throw new Error('staged diff is not exactly the submitted regular files'); }
      if (!raw.length) return null;
      await git(wt[agent], 'commit', '-q', '-m', message);
      const sha = (await git(wt[agent], 'rev-parse', 'HEAD')).stdout.trim();
      return append(agent, 'commit', `${agent} committed ${sha.slice(0, 12)}: ${message}`, { refs, data: { sha, files: files.map(f => f.path) } });
    });
    if (!commit) return { unchanged: true };
    const merged = await mut(async () => {
      try { await git(wt.integration, 'merge', '-q', ...(out.base ? ['--ff-only'] : ['--no-ff', '-m', `merge ${agent} ${commit.data.sha.slice(0, 12)}`]), branch(agent)); }
      catch {
        await git(wt.integration, 'merge', '--abort').catch(() => {});
        return append('coordinator', 'conflict', `merging ${agent} ${commit.data.sha.slice(0, 12)} into integration conflicted; integration unchanged`, { refs: [commit.seq], data: { agent, sha: commit.data.sha } });
      }
      const isha = (await git(wt.integration, 'rev-parse', 'HEAD')).stdout.trim();
      return append('coordinator', 'merged', `integration ${isha.slice(0, 12)} now includes ${agent} ${commit.data.sha.slice(0, 12)}`, { refs: [commit.seq], data: { agent, sha: commit.data.sha, integration: isha } });
    });
    if (merged?.kind === 'merged' && testCmd && !stopping) {
      const t = await runSandboxed(testCmd, { repoDir: wt.integration, commit: merged.data.integration, backend: sandbox, timeoutMs: testMs, signal: testAbort.signal });
      if (!stopping) append('coordinator', 'tested', `shared tests on integration ${merged.data.integration.slice(0, 12)}: ${t.refused ? 'NOT RUN (' + t.refused + ')' : t.ok ? 'PASS' : 'FAIL'}`, { refs: [merged.seq], data: { agent, integration: merged.data.integration, ok: t.refused ? null : t.ok, refused: t.refused ?? null, ms: t.ms ?? null, tail: t.tail ?? '' } });
    }
    return { commit: commit.seq, merged: merged?.kind === 'merged' ? merged.seq : null, conflict: merged?.kind === 'conflict' ? merged.seq : null };
  }

  async function handle(a, m) {
    if (m.op === 'reserve') {
      if (existsSync(join(dir, 'STOP'))) { stop('STOP file'); throw new Error('session stopping'); }
      if (stopping) throw new Error('session stopping');
      if (calls[a] >= maxCallsPerAgent) {
        if (!limited.has(a)) { limited.add(a); append('coordinator', 'limit', `${a} has used its ${maxCallsPerAgent}-dispatch allowance; no further turn or steer`, { data: { agent: a } }); stop(`${a} exhausted its dispatch allowance`); }
        return { permit: null };
      }
      calls[a]++;
      const permit = `${a}-grant-${calls[a]}`;
      const g = append('coordinator', 'grant', `${a} may dispatch ${String(m.intent?.method ?? 'call').slice(0, 40)} (${calls[a]}/${maxCallsPerAgent})`, { id: permit, data: { agent: a, permit, intent: m.intent ?? null } });
      if (!g) throw new Error('grant not recorded');
      permits.set(permit, { agent: a, used: false });
      return { permit: { id: permit, seq: g.seq } };
    }
    if (m.op === 'read') {   // the CURRENT integration state: its commit (the base for the next submission) and allowlisted files
      const head = (await git(wt.integration, 'rev-parse', 'HEAD')).stdout.trim();
      const all = (await git(wt.integration, 'ls-tree', '-r', '--name-only', head, '--', ...allow)).stdout.split('\n').filter(Boolean);
      const want = m.headOnly ? [] : Array.isArray(m.paths) && m.paths.length ? all.filter(p => m.paths.includes(p)) : all;
      const files = []; let bytes = 0, truncated = false;
      for (const p of want) {
        const content = (await git(wt.integration, 'show', `${head}:${p}`)).stdout;
        if (bytes + Buffer.byteLength(content) > readBytes) { truncated = true; continue; }
        files.push({ path: p, content }); bytes += Buffer.byteLength(content);
      }
      return { integration: head, paths: all, files, truncated };
    }
    if (m.op === 'pull') {
      const from = Number.isInteger(m.from) && m.from >= 0 ? m.from : 0, out = []; let bytes = 0, next = from;
      for (const e of bus.since(from)) {
        next = e.seq;
        if (!relevantTo(a, e)) continue;   // peers get findings, not bookkeeping: each delivery may cost a model steer
        const n = Buffer.byteLength(JSON.stringify(e));
        if (out.length && bytes + n > pullBytes) { next = e.seq - 1; break; }
        out.push(e); bytes += n;
      }
      return { events: out, next, head: bus.head };
    }
    if (m.op === 'publish') {
      const out = m.out ?? {};
      if (stopping && out.type !== 'call') throw new Error('session stopping');
      if (out.type === 'event') {
        if (!AGENT_KINDS.includes(out.kind)) throw new Error(`agents may publish only ${AGENT_KINDS.join('/')}`);
        const ev = append(a, out.kind, out.body ?? '', { refs: resolveRefs(out.refIds), id: out.id ? `${a}:${String(out.id).slice(0, 80)}` : undefined, data: out.data });
        if (!ev) throw new Error('not recorded');
        return { seq: ev.seq, id: ev.id };
      }
      if (out.type === 'files') return integrate(a, out);
      if (out.type === 'call') {
        const p = permits.get(out.permit);
        if (!p || p.agent !== a || p.used) throw new Error('a call record needs an unused grant of this agent');
        p.used = true;
        const ev = append(a, 'call', `${a} model dispatch under ${out.permit}: ${out.ms ?? '?'} ms`, { refs: [bus.byId(out.permit).seq], data: { permit: out.permit, startedAt: out.startedAt ?? null, endedAt: out.endedAt ?? null, ms: out.ms ?? null, model: out.model ?? null, inputTokens: out.inputTokens ?? null, outputTokens: out.outputTokens ?? null, costUsd: out.costUsd ?? null, interval: out.interval ?? (agents[a].adapter === 'fake' ? 'simulated' : 'unknown'), outcome: out.outcome ?? null, method: out.method ?? null, threadId: out.threadId ?? null, turnId: out.turnId ?? null } });
        // observed tokens (as reported, possibly after the fact): past the threshold the session stops. Not a hard cap.
        observedTokens += (Number.isFinite(out.inputTokens) ? out.inputTokens : 0) + (Number.isFinite(out.outputTokens) ? out.outputTokens : 0);
        if (observedTokens >= maxObservedTokens && !stopping) stop(`observed tokens ${observedTokens} reached the ${maxObservedTokens} threshold (reported after the fact; in-flight work may overshoot)`);
        return { seq: ev?.seq ?? null };
      }
      throw new Error('unknown publication type');
    }
    throw new Error('unknown request');
  }

  append('coordinator', 'start', `session ${id}: ${AGENTS.join(' and ')} run concurrently; limits wall ${maxWallMs} ms, ${maxCallsPerAgent} dispatches per agent, ${maxEvents} events`, { data: { limits: { maxWallMs, maxCallsPerAgent, maxEvents, maxBytes }, sandbox } });
  const exits = AGENTS.map(a => new Promise(res => {
    const runDir = join(dir, 'run-' + a), home = launcher.home ?? join(dir, 'home-' + a);
    mkdirSync(runDir, { recursive: true, mode: 0o700 }); if (!launcher.home) mkdirSync(home, { recursive: true });
    if (launcher.mode && launcher.mode !== 'local') {   // the dropped-privilege worker must reach its worktree and own its runtime dir
      chmodSync(dir, 0o711); const uid = Number(execFileSyncSafe('id', ['-u', launcher.user])), gid = Number(execFileSyncSafe('id', ['-g', launcher.user]));
      chownSync(runDir, uid, gid); if (!launcher.home) chownSync(home, uid, gid);
    }
    const env = { PATH: launcher.path ?? process.env.PATH, LANG: 'C.UTF-8', HOME: home, MYC_SESSION_AGENT: a, MYC_SESSION: `${id}-${a}`, MYC_RUNTIME_DIR: runDir, ...(agents[a].env ?? {}) };   // clean: nothing inherited but PATH
    const cmd = workerCommand({ ...launcher, unit: `myc-session-${id}-${a}` }, env, join(HERE, 'worker.mjs'));
    const w = cmd ? spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { PATH: process.env.PATH }, detached: true, cwd: wt[a] })
      : fork(join(HERE, 'worker.mjs'), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env, detached: true, cwd: wt[a] });
    workers[a] = w; let errTail = '';
    const log = join(dir, `worker-${a}.log`); let logged = 0;
    const keep = d => { errTail = (errTail + d).slice(-800); if (logged < 1 << 20) { logged += d.length; try { writeFileSync(log, d, { flag: 'a' }); } catch {} } };
    w.stderr.on('data', keep); w.stdout.on('data', keep);
    w.on('error', () => {});
    w.on('message', async m => {
      if (m.type === 'ready') { if (!stopping) { live.add(a); append(a, 'start', `${a} session started (pid ${w.pid})`, { id: `${a}:start`, data: { pid: w.pid } }); } return; }
      if (m.type === 'done') { live.delete(a); if (!stopping) append(a, 'done', String(m.body || `${a} finished`), { id: `${a}:done` }); return; }
      if (m.type !== 'req') return;
      try { send(a, { type: 'res', rid: m.rid, ok: true, value: await handle(a, m) }); }
      catch (e) { send(a, { type: 'res', rid: m.rid, ok: false, error: String(e.message).slice(0, 300) }); }
    });
    w.on('exit', (code, signal) => {
      killGroup(a, 'SIGKILL');                     // reap anything the worker left behind in its group
      live.delete(a);
      append('coordinator', 'exit', `${a} worker exited (code ${code}${signal ? ', ' + signal : ''})${code && !stopping ? ': ' + errTail.slice(-200) : ''}`, { data: { agent: a, code, signal } });
      if ((code !== 0 || signal) && !stopping) stop(`${a} worker failed (code ${code}${signal ? ', ' + signal : ''}): the pair stops together`);
      res();
    });
    send(a, { type: 'init', agent: a, session: id, config: agents[a], worktree: wt[a] });
  }));
  const wall = setTimeout(() => stop(`wall-clock limit ${maxWallMs} ms`), maxWallMs);
  const stopFile = setInterval(() => { if (existsSync(join(dir, 'STOP'))) stop('STOP file'); }, 50);
  await Promise.all(exits);
  clearTimeout(wall); clearInterval(stopFile);
  if (stopDone) await stopDone;
  stopping = true; await mutex;
  for (const a of AGENTS) killGroup(a, 'SIGKILL');
  append('coordinator', 'done', `session ${id} ended`);
  const events = bus.all(); bus.close();
  return { id, events, report: analyze(events), worktrees: wt };
}

// Evidence, computed only from the stream. A live span runs from the agent's start to the FIRST of: its done, its trusted
// exit/error record, or the session stop (P0-08). An event "belongs" to an agent if the agent wrote it or it is the
// coordinator's record of that agent's commit. References are evidence pointers, not proof of substance: `pass` states
// the mechanical criteria only and always requires manual review of the linked chain.
export function analyze(events) {
  const t = e => Date.parse(e.at), by = s => events[s - 1];
  const span = {};
  for (const a of AGENTS) {
    const s = events.find(e => e.actor === a && e.kind === 'start');
    if (!s) continue;
    const ends = events.filter(e => e.seq > s.seq && ((e.actor === a && e.kind === 'done') || (e.actor === 'coordinator' && ['exit', 'error'].includes(e.kind) && e.data?.agent === a) || e.kind === 'stop'));
    span[a] = [t(s), t(ends[0] ?? events.at(-1))];
  }
  const live = (a, at) => !!span[a] && at >= span[a][0] && at <= span[a][1];
  const overlapMs = span.claude && span.codex ? Math.max(0, Math.min(span.claude[1], span.codex[1]) - Math.max(span.claude[0], span.codex[0])) : 0;
  const owner = o => AGENTS.includes(o.actor) ? o.actor : (o.actor === 'coordinator' && AGENTS.includes(o.data?.agent) ? o.data.agent : null);
  const MODEL = ['finding', 'question', 'challenge', 'reply', 'note', 'commit'];
  const crossRefs = events.filter(e => AGENTS.includes(e.actor) && MODEL.includes(e.kind) && (e.refs ?? []).some(r => { const o = by(r); return o && owner(o) && owner(o) !== e.actor; }));
  const midSession = crossRefs.filter(e => { const other = e.actor === 'claude' ? 'codex' : 'claude'; return live(e.actor, t(e)) && live(other, t(e)) && e.refs.some(r => owner(by(r)) === other && live(other, t(by(r)))); });
  const caused = (e, depth = 0) => depth < 4 && (e.refs ?? []).some(r => { const o = by(r); return o && ((owner(o) && owner(o) !== e.actor) || caused(o, depth + 1)); });
  const changedBy = events.filter(e => e.kind === 'commit' && caused(e));
  const ledger = events.filter(e => e.kind === 'call').map(e => ({ agent: e.actor, ...e.data }));
  let callOverlapMs = 0;
  const activeCall = c => c.startedAt && (c.interval === 'active-turn' || c.interval === 'simulated');
  for (const x of ledger.filter(c => c.agent === 'claude' && activeCall(c))) for (const y of ledger.filter(c => c.agent === 'codex' && activeCall(c)))
    callOverlapMs += Math.max(0, Math.min(Date.parse(x.endedAt), Date.parse(y.endedAt)) - Math.max(Date.parse(x.startedAt), Date.parse(y.startedAt)));
  const tested = events.filter(e => e.kind === 'tested');
  const lastTest = tested.at(-1);
  const dir = { claudeToCodex: midSession.some(e => e.actor === 'claude'), codexToClaude: midSession.some(e => e.actor === 'codex') };
  const criteria = { overlappingCalls: callOverlapMs > 0, reactionEachDirection: dir.claudeToCodex && dir.codexToClaude, changedByOther: changedBy.length > 0,
    sharedTestsPass: lastTest?.data?.ok === true, noStop: !events.some(e => e.kind === 'stop'), noWorkerFailure: !events.some(e => e.kind === 'exit' && (e.data?.code !== 0 || e.data?.signal)) };
  return { span, overlapMs, callOverlapMs, crossReactions: crossRefs.map(e => e.seq), midSessionReactions: midSession.map(e => e.seq), commitsCausedByOther: changedBy.map(e => e.seq),
    integrationTests: tested.map(e => ({ seq: e.seq, agent: e.data.agent, ok: e.data.ok })), calls: ledger, grants: events.filter(e => e.kind === 'grant').length,
    stopped: events.some(e => e.kind === 'stop'), events: events.length,
    pass: { mechanical: Object.values(criteria).every(Boolean), criteria, requiresManualReview: 'references prove linkage, not substance: review the linked events, diffs and tests by hand' } };
}

