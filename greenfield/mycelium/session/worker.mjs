// One agent worker (child process of the coordinator). It hosts the agent's adapter, gives it an INBOX that the
// coordinator fills the moment the other agent publishes anything, and forwards the adapter's outputs. The inbox is
// bounded: if the adapter falls behind, the oldest undelivered events are dropped and counted, never buffered forever.
// Adapter contract (adapters/<name>.mjs):  export async function* agentRun({ agent, session, config, worktree, inbox, acks })
//   yields { type:'event', kind, body, refIds?, id?, data? } | { type:'files', files:[{path, content}], message, refIds? }
//        | { type:'call', startedAt, endedAt, ms, model?, inputTokens?, outputTokens?, costUsd? } | { type:'done', body }
//   inbox.take() -> new events since the last take (array); inbox.wait(ms) -> resolves when something new arrives or after ms;
//   inbox.dropped -> how many events were dropped for falling behind; inbox.stopped -> true once the coordinator says stop.
//   acks.seqOf(id) -> the seq the stream gave an event this agent published (or undefined yet).
const MAX_INBOX = 64;
let queue = [], waiters = [], dropped = 0, stopped = false;
const acks = new Map();
const wake = () => { const w = waiters; waiters = []; for (const f of w) f(); };
const inbox = {
  take() { const q = queue; queue = []; return q; },
  wait(ms) { if (queue.length || stopped) return Promise.resolve(); return new Promise(res => { const t = setTimeout(res, ms); waiters.push(() => { clearTimeout(t); res(); }); }); },
  get dropped() { return dropped; }, get stopped() { return stopped; }
};
process.on('message', async m => {
  if (m.type === 'deliver') { for (const e of m.events) { queue.push(e); if (queue.length > MAX_INBOX) { queue.shift(); dropped++; } } wake(); }
  else if (m.type === 'ack') acks.set(m.id, m.seq);
  else if (m.type === 'stop') { stopped = true; wake(); }
  else if (m.type === 'init') {
    try {
      const { agentRun } = await import(new URL(`./adapters/${m.config.adapter}.mjs`, import.meta.url));
      process.send({ type: 'ready' });
      let done = false;
      for await (const out of agentRun({ agent: m.agent, session: m.session, config: m.config, worktree: m.worktree, inbox, acks: { seqOf: id => acks.get(id) } })) {
        process.send(out);
        if (out.type === 'done') { done = true; break; }
        if (stopped && out.type !== 'call') break;
      }
      if (!done && !stopped) process.send({ type: 'done', body: `${m.agent} adapter returned` });
    } catch (e) { process.stderr.write(String(e?.stack || e)); process.exitCode = 1; }
    setTimeout(() => process.exit(), 50);
  }
});
