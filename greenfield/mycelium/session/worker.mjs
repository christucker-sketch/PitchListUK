// One agent worker (child process of the coordinator, leader of its own process group). It hosts the agent's adapter and
// gives it the trusted runtime the coordinator controls:
//   runtime.reserve(intent) -> { id } | null    a durable grant BEFORE any model dispatch (turn start or steer); null = refused
//   runtime.publish(out)    -> receipt           resolves after the coordinator durably recorded / integrated it; throws if refused
//   runtime.signal          AbortSignal          aborted when the coordinator says stop
//   runtime.rpc             (optional)           a bounded JSON-lines connection to a CLI process this worker launched in
//                                                its own process group (config.launch = { command: [...] }), for the Codex
//                                                app-server adapter
// The inbox is fed by PULLING from the coordinator's cursor (after a wake-up), within a byte budget and a bounded local
// buffer: a slow adapter just reads later, nothing is ever dropped (inbox.dropped stays 0), and the coordinator never
// buffers on the worker's behalf.
// Adapter contract (adapters/<name>.mjs): export async function* agentRun({ agent, session, config, worktree, inbox, acks, runtime })
//   may yield { type:'event'|'files'|'call', ... } (published through runtime.publish) and finally { type:'done', body }.
import { spawn } from 'node:child_process';
import { CodexRpc } from './adapters/codex-rpc.mjs';

const MAX_BUFFER = 64;
let buffer = [], waiters = [], cursor = 0, head = 0, pulling = false, stopped = false, rid = 0;
const pending = new Map(), ac = new AbortController();
const wake = () => { const w = waiters; waiters = []; for (const f of w) f(); };
function request(op, payload) {
  if (!process.connected) return Promise.reject(new Error('coordinator gone'));
  const id = ++rid;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); process.send({ type: 'req', rid: id, op, ...payload }); });
}
async function pump() {
  if (pulling || stopped) return; pulling = true;
  try {
    while (!stopped && cursor < head && buffer.length < MAX_BUFFER) {
      const r = await request('pull', { from: cursor });
      buffer.push(...r.events); cursor = r.next; head = Math.max(head, r.head);
      if (r.events.length) wake();
      if (r.next <= cursor && !r.events.length && cursor >= r.head) break;
    }
  } catch {} finally { pulling = false; }
}
const inbox = {
  take() { const q = buffer; buffer = []; queueMicrotask(pump); return q; },
  wait(ms) {
    if (buffer.length || stopped) return Promise.resolve();
    return new Promise(res => { let t; const f = () => { clearTimeout(t); res(); }; t = setTimeout(() => { waiters = waiters.filter(x => x !== f); res(); }, ms); waiters.push(f); });
  },
  get dropped() { return 0; }, get stopped() { return stopped; }
};
const runtime = {
  async reserve(intent) { if (stopped) return null; const r = await request('reserve', { intent }); return r.permit; },
  publish(out) { return request('publish', { out }); },
  signal: ac.signal, rpc: null
};
process.on('message', async m => {
  if (m.type === 'res') { const p = pending.get(m.rid); if (!p) return; pending.delete(m.rid); m.ok ? p.resolve(m.value) : p.reject(new Error(m.error)); return; }
  if (m.type === 'wake') { head = Math.max(head, m.head); pump(); return; }
  if (m.type === 'stop') { stopped = true; ac.abort(); wake(); return; }
  if (m.type !== 'init') return;
  let done = false;
  try {
    if (!/^[a-z0-9-]{1,40}$/.test(m.config?.adapter ?? '')) throw new Error('bad adapter name');
    if (m.config.launch) {   // the CLI process stays inside this worker's process group, so STOP kills it with the worker
      const [cmd, ...args] = m.config.launch.command;
      const child = spawn(cmd, args, { cwd: m.worktree, stdio: ['pipe', 'pipe', 'ignore'], env: process.env });
      runtime.rpc = new CodexRpc({ readable: child.stdout, writable: child.stdin, timeoutMs: m.config.launch.timeoutMs ?? 10000 });
      ac.signal.addEventListener('abort', () => { setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000); }, { once: true });
    }
    const { agentRun } = await import(new URL(`./adapters/${m.config.adapter}.mjs`, import.meta.url));
    process.send({ type: 'ready' });
    for await (const out of agentRun({ agent: m.agent, session: m.session, config: m.config, worktree: m.worktree, inbox, acks: { seqOf: () => undefined }, runtime })) {
      if (out.type === 'done') { process.send({ type: 'done', body: out.body }); done = true; break; }
      if (stopped && out.type !== 'call') break;
      try { await runtime.publish(out); } catch (e) { if (!stopped) process.stderr.write(`publication refused: ${e.message}\n`); }
    }
    if (!done && !stopped) process.send({ type: 'done', body: `${m.agent} adapter returned` });
  } catch (e) { process.stderr.write(String(e?.stack || e)); process.exitCode = 1; }
  setTimeout(() => process.exit(), 50);
});
