// Concurrent session coordinator (offline proof first; MYC-P0-BUS). It runs BOTH agent workers at the same time, each in
// its own child process and its own git worktree/branch, and is the single writer of the shared session stream:
//   worker output (event | files | call | done) -> validate -> append to the stream -> deliver to the OTHER worker at once
//   files -> safe write into that agent's worktree -> commit on its branch -> merge into the integration branch -> run the
//            shared tests there -> publish commit / merged (with test result) / conflict events to both
// Hard controls: STOP file, wall-clock limit, per-agent call limit, stream size limit, bounded inboxes in the workers,
// path allowlist, no symlinks. Every adapter call is a ledger event (timestamps, duration, tokens, cost when known).
// It never calls a model itself; which adapter a worker runs (fake here; real CLI adapters are MYC-P0-AGENT) is config.
import { fork, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, lstatSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openBus } from './bus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const AGENTS = ['claude', 'codex'];
const git = (cwd, ...args) => run('git', args, { cwd, maxBuffer: 4 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });

// paths an agent may write: inside the allowlisted prefixes, plain segments, no '..', no dotfiles, no symlinks on the way
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
  writeFileSync(tmp, content, { flag: 'wx' }); renameSync(tmp, dst);
}

export async function runSession(opts) {
  const { dir, repo, baseRef = 'HEAD', id = 's' + Date.now().toString(36), agents, allow = ['artifact/'], testCmd = null,
    limits: { maxWallMs = 60000, maxCallsPerAgent = 20, maxEvents = 2000, maxFileBytes = 64000, graceMs = 2000 } = {} } = opts;
  mkdirSync(dir, { recursive: true });
  const bus = openBus(join(dir, 'events.jsonl'), { session: id, maxEvents });
  const wt = {}, branch = a => `session/${id}/${a}`;
  for (const a of AGENTS) if (!/^[a-z0-9-]{1,40}$/.test(agents?.[a]?.adapter ?? '')) throw new Error(`agents.${a}.adapter must name a module in adapters/`);
  for (const a of [...AGENTS, 'integration']) { wt[a] = join(dir, 'wt-' + a); await git(repo, 'worktree', 'add', '-q', '-b', branch(a), wt[a], baseRef); }
  for (const a of [...AGENTS, 'integration']) { await git(wt[a], 'config', 'user.name', a === 'integration' ? 'session-coordinator' : `${a}-agent`); await git(wt[a], 'config', 'user.email', `${a}@mycelium.invalid`); }
  const idToSeq = new Map(), calls = { claude: 0, codex: 0 }, active = new Set(), workers = {};
  let stopping = null, gitQ = Promise.resolve();
  const serial = fn => (gitQ = gitQ.then(fn, fn));
  const send = (a, msg) => { const w = workers[a]; if (!w?.connected) return; try { w.send(msg, () => {}); } catch {} };   // a worker may exit at any moment

  const emit = (actor, kind, body, { refIds = [], refs = [], id: eid, data } = {}) => {
    try {
      const r = [...refs, ...refIds.map(x => idToSeq.get(x)).filter(Boolean)].slice(0, 8);
      const ev = bus.append({ actor, kind, body: String(body).slice(0, 4000), refs: r, id: eid, data });
      idToSeq.set(ev.id, ev.seq);
      for (const a of AGENTS) if (a !== actor) send(a, { type: 'deliver', events: [ev] });   // immediate, event-driven delivery (coordinator events go to both)
      if (AGENTS.includes(actor)) send(actor, { type: 'ack', id: ev.id, seq: ev.seq });
      return ev;
    } catch (e) { if (!stopping) stop(`stream refused an event: ${e.message}`); return null; }
  };

  const integrate = (agent, files, message, refIds) => serial(async () => {
    const refused = [];
    for (const f of files) {
      const why = checkPath(f.path, allow) ?? (typeof f.content !== 'string' || Buffer.byteLength(f.content) > maxFileBytes ? 'content missing or too large' : null);
      if (why) { refused.push(`${f.path}: ${why}`); continue; }
      try { safeWrite(wt[agent], f.path, f.content); } catch (e) { refused.push(e.message); }
    }
    if (refused.length) emit('coordinator', 'refused', `refused for ${agent}: ${refused.join('; ')}`, { refIds, data: { agent } });
    await git(wt[agent], 'add', '-A');
    const { stdout: st } = await git(wt[agent], 'status', '--porcelain');
    if (!st.trim()) return;
    await git(wt[agent], 'commit', '-q', '-m', String(message || `${agent} change`).slice(0, 200));
    const sha = (await git(wt[agent], 'rev-parse', 'HEAD')).stdout.trim();
    const c = emit(agent, 'commit', `${agent} committed ${sha.slice(0, 12)}: ${message}`, { refIds, data: { sha, files: files.map(f => f.path) } });
    try { await git(wt.integration, 'merge', '-q', '--no-ff', '-m', `merge ${agent} ${sha.slice(0, 12)}`, branch(agent)); }
    catch (e) {
      await git(wt.integration, 'merge', '--abort').catch(() => {});
      emit('coordinator', 'conflict', `merging ${agent} ${sha.slice(0, 12)} into the integration branch conflicted; integration unchanged. ${agent} should rebase on the other agent's work.`, { refs: c ? [c.seq] : [], data: { agent, sha } });
      return;
    }
    const isha = (await git(wt.integration, 'rev-parse', 'HEAD')).stdout.trim();
    let tests = null;
    // a clean environment: an inherited NODE_TEST_CONTEXT (set when the coordinator itself runs under node --test) makes a
    // nested `node --test` report success regardless of results
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST')));
    if (testCmd) { try { const r = await run(testCmd[0], testCmd.slice(1), { cwd: wt.integration, timeout: 60000, maxBuffer: 4 << 20, env }); tests = { ok: true, tail: r.stdout.slice(-600) }; }
      catch (e) { tests = { ok: false, tail: String((e.stdout || '') + (e.stderr || '')).slice(-600) }; } }
    emit('coordinator', 'merged', `integration ${isha.slice(0, 12)} now includes ${agent} ${sha.slice(0, 12)}${tests ? `; shared tests ${tests.ok ? 'PASS' : 'FAIL'}` : ''}`, { refs: c ? [c.seq] : [], data: { agent, sha, integration: isha, tests } });
  });

  function stop(reason) {
    if (stopping) return stopping;
    emit('coordinator', 'stop', `session stopping: ${reason}`);
    stopping = new Promise(res => {
      for (const a of AGENTS) send(a, { type: 'stop', reason });
      setTimeout(() => { for (const a of AGENTS) if (workers[a] && workers[a].exitCode === null) workers[a].kill('SIGKILL'); res(); }, graceMs);
    });
    return stopping;
  }

  emit('coordinator', 'start', `session ${id}: ${AGENTS.join(' and ')} run concurrently; limits wall ${maxWallMs} ms, ${maxCallsPerAgent} calls per agent, ${maxEvents} events`, { data: { limits: { maxWallMs, maxCallsPerAgent, maxEvents } } });
  const exits = AGENTS.map(a => new Promise(res => {
    const w = fork(join(HERE, 'worker.mjs'), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, MYC_SESSION_AGENT: a } });
    workers[a] = w; let errTail = '';
    w.stderr.on('data', d => { errTail = (errTail + d).slice(-800); });
    w.on('message', m => {
      if (stopping && m.type !== 'call') return;   // after STOP nothing new enters the stream (a finished call is still ledgered)
      if (m.type === 'ready') { active.add(a); emit(a, 'start', `${a} session started`, { id: `${a}-start` }); }
      else if (m.type === 'event') emit(a, m.kind, m.body, { refIds: m.refIds, id: m.id, data: m.data });
      else if (m.type === 'files') integrate(a, m.files ?? [], m.message, m.refIds ?? []);
      else if (m.type === 'call') {
        calls[a]++;
        emit(a, 'call', `${a} model call ${calls[a]}: ${m.ms} ms`, { data: { startedAt: m.startedAt, endedAt: m.endedAt, ms: m.ms, model: m.model ?? null, inputTokens: m.inputTokens ?? null, outputTokens: m.outputTokens ?? null, costUsd: m.costUsd ?? null } });
        if (calls[a] >= maxCallsPerAgent && !stopping) { emit('coordinator', 'limit', `${a} reached its ${maxCallsPerAgent}-call limit; its session is stopped`); send(a, { type: 'stop', reason: 'call limit' }); }
      }
      else if (m.type === 'done') { active.delete(a); emit(a, 'done', m.body || `${a} finished`, { id: `${a}-done` }); }
    });
    w.on('exit', code => { if (active.has(a)) { active.delete(a); if (!stopping) emit('coordinator', 'error', `${a} worker exited (${code}) without finishing: ${errTail.slice(-300)}`); } res(); });
    w.on('error', () => {});
    send(a, { type: 'init', agent: a, session: id, config: agents[a], worktree: wt[a] });
  }));
  const wall = setTimeout(() => stop(`wall-clock limit ${maxWallMs} ms`), maxWallMs);
  const stopFile = setInterval(() => { if (existsSync(join(dir, 'STOP'))) stop('STOP file'); }, 100);
  await Promise.all(exits);
  clearTimeout(wall); clearInterval(stopFile);
  await gitQ;
  emit('coordinator', 'done', `session ${id} ended`);
  const events = bus.all(); bus.close();
  return { id, events, report: analyze(events), worktrees: wt };
}

// Evidence, computed only from the stream: when each agent was active, how long both were, which events answered the
// other agent WHILE both sessions were live, and which commits were caused by the other agent's events.
export function analyze(events) {
  const t = e => Date.parse(e.at), by = s => events[s - 1];
  const span = {};
  for (const a of AGENTS) {
    const s = events.find(e => e.actor === a && e.kind === 'start'), d = events.findLast(e => e.actor === a && e.kind === 'done');
    const stopEv = events.find(e => e.kind === 'stop'), end = d ?? stopEv ?? events.at(-1);
    if (s) span[a] = [t(s), t(end)];
  }
  const live = (a, at) => span[a] && at >= span[a][0] && at <= span[a][1];
  const overlapMs = span.claude && span.codex ? Math.max(0, Math.min(span.claude[1], span.codex[1]) - Math.max(span.claude[0], span.codex[0])) : 0;
  // an event "belongs" to an agent if that agent wrote it, or it is the coordinator's report on that agent's commit
  const owner = o => AGENTS.includes(o.actor) ? o.actor : (o.actor === 'coordinator' && AGENTS.includes(o.data?.agent) ? o.data.agent : null);
  const crossRefs = events.filter(e => AGENTS.includes(e.actor) && e.kind !== 'call' && e.refs.some(r => { const o = by(r); return o && owner(o) && owner(o) !== e.actor; }));
  const midSession = crossRefs.filter(e => { const other = e.actor === 'claude' ? 'codex' : 'claude'; return live(e.actor, t(e)) && live(other, t(e)) && e.refs.some(r => owner(by(r)) === other && live(other, t(by(r)))); });
  const caused = (e, depth = 0) => depth < 4 && e.refs.some(r => { const o = by(r); return o && ((owner(o) && owner(o) !== e.actor) || caused(o, depth + 1)); });
  const changedBy = events.filter(e => e.kind === 'commit' && caused(e));
  const merged = events.filter(e => e.kind === 'merged');
  const ledger = events.filter(e => e.kind === 'call').map(e => ({ agent: e.actor, ...e.data }));
  // the strongest overlap evidence: model calls of the two agents that were IN FLIGHT at the same time
  let callOverlapMs = 0;
  for (const x of ledger.filter(c => c.agent === 'claude')) for (const y of ledger.filter(c => c.agent === 'codex'))
    callOverlapMs += Math.max(0, Math.min(Date.parse(x.endedAt), Date.parse(y.endedAt)) - Math.max(Date.parse(x.startedAt), Date.parse(y.startedAt)));
  return { span, overlapMs, callOverlapMs, crossReactions: crossRefs.map(e => e.seq), midSessionReactions: midSession.map(e => e.seq), commitsCausedByOther: changedBy.map(e => e.seq),
    integrationTests: merged.map(e => ({ seq: e.seq, agent: e.data.agent, ok: e.data.tests?.ok ?? null })),
    calls: ledger, stopped: events.some(e => e.kind === 'stop'), events: events.length };
}
