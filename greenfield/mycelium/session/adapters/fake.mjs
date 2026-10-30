// Scripted fake agent for OFFLINE proofs of the concurrent session (no model, no network). It uses the same trusted
// runtime as a real adapter: every simulated model call first reserves a grant (refused -> the agent stops), and every
// publication waits for the coordinator's durable receipt. Steps run in order while the inbox keeps filling:
//   { call: ms }                                    reserve a grant, let time pass while reading the inbox, record the call
//   { emit: kind, body, id?, refs?: [label|id], label? }    publish an event; refs by label of a matched event, or by id
//   { files: { path: content }, message, refs? }    submit files (the coordinator commits, merges and tests them)
//   { await: { actor?, kind?, match?, data? }, label, timeoutMs }   block until a matching delivered event arrives
//   { busy: ms }                                    time passes WITHOUT reading the inbox (an agent that cannot keep up)
//   { report: 'inbox' }                             publish how many events it has received so far
//   test probes: { spawnSleep: true } (start a descendant and publish its pid), { envProbe: NAME } (publish whether the
//   variable is visible), { direct: { path: content } } (edit the worktree directly, bypassing submission)
//   { done: body }
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
export async function* agentRun({ agent, config, worktree, inbox, runtime }) {
  const seen = [], labels = new Map(), used = new Set();
  const pull = () => { for (const e of inbox.take()) seen.push(e); };
  const ref = r => labels.get(r) ?? r;
  const get = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);
  const matches = (e, q) => (!q.actor || e.actor === q.actor) && (!q.kind || e.kind === q.kind) && (!q.match || new RegExp(q.match).test(e.body))
    && (!q.data || Object.entries(q.data).every(([k, v]) => JSON.stringify(get(e.data, k)) === JSON.stringify(v)));
  let n = 0;
  for (const step of config.script ?? []) {
    if (inbox.stopped) return;
    pull();
    try {
      if (step.call !== undefined) {
        const permit = await runtime.reserve({ method: 'fake/turn', step: n });
        if (!permit) return;                                          // allowance refused: no dispatch at all
        const startedAt = new Date().toISOString(), t0 = Date.now();
        while (Date.now() - t0 < step.call && !inbox.stopped) { await inbox.wait(step.call - (Date.now() - t0)); pull(); }
        await runtime.publish({ type: 'call', permit: permit.id, startedAt, endedAt: new Date().toISOString(), ms: Date.now() - t0, model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0 });
      } else if (step.busy !== undefined) await new Promise(r => setTimeout(r, step.busy));
      else if (step.emit) {
        const r = await runtime.publish({ type: 'event', kind: step.emit, body: step.body, id: step.id ?? `e${++n}`, refIds: (step.refs ?? []).map(ref) });
        if (step.label) labels.set(step.label, r.id);
      } else if (step.files) {
        await runtime.publish({ type: 'files', files: Object.entries(step.files).map(([path, content]) => ({ path, content })), message: step.message, refIds: (step.refs ?? []).map(ref) });
      } else if (step.await) {
        const t0 = Date.now(); let hit;
        while (!(hit = seen.find(e => !used.has(e.seq) && matches(e, step.await))) && Date.now() - t0 < (step.timeoutMs ?? 10000) && !inbox.stopped) { await inbox.wait(100); pull(); }
        if (!hit) { await runtime.publish({ type: 'event', kind: 'note', body: `${agent}: gave up waiting for ${JSON.stringify(step.await).slice(0, 300)}` }); continue; }
        used.add(hit.seq); labels.set(step.label, hit.id);
      } else if (step.spawnSleep) { const c = spawn('sleep', ['30'], { stdio: 'ignore' }); await runtime.publish({ type: 'event', kind: 'note', body: `descendant pid ${c.pid}`, data: { pid: c.pid } });
      } else if (step.envProbe) { await runtime.publish({ type: 'event', kind: 'note', body: `${step.envProbe} visible=${process.env[step.envProbe] !== undefined}` });
      } else if (step.direct) { for (const [p, c] of Object.entries(step.direct)) { mkdirSync(dirname(join(worktree, p)), { recursive: true }); writeFileSync(join(worktree, p), c); }
      } else if (step.report === 'inbox') { pull(); await runtime.publish({ type: 'event', kind: 'note', body: `${agent}: inbox dropped=${inbox.dropped} seen=${seen.length}` }); }
      else if (step.done !== undefined) { yield { type: 'done', body: step.done }; return; }
    } catch (e) { if (inbox.stopped) return; await runtime.publish({ type: 'event', kind: 'note', body: `${agent}: step refused: ${String(e.message).slice(0, 300)}` }).catch(() => {}); }
  }
}
