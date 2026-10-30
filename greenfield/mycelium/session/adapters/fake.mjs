// Scripted fake agent for OFFLINE proofs of the concurrent session (no model, no network). A script is a list of steps
// run in order; the agent keeps reading its inbox the whole time, so steps can react to what the other agent publishes
// mid-session. Steps:
//   { call: ms }                                    simulated model call: time passes, a ledger record is published
//   { emit: kind, body, id?, refs?: [label|id] }    publish an event (refs by label of a matched event, or by id)
//   { files: { path: content }, message, refs? }    commit files to this agent's branch (coordinator integrates them)
//   { await: { actor?, kind?, match?, data? }, label, timeoutMs }   block until a matching event arrives (label it)
//   { busy: ms }                                    time passes WITHOUT reading the inbox (an agent that cannot keep up)
//   { report: 'dropped' }                           publish how many inbox events were dropped
//   { done: body }
// Matching looks at every event delivered so far, so an event that arrived during an earlier call still counts.
export async function* agentRun({ agent, config, inbox, acks }) {
  const seen = [], labels = new Map();
  const pull = () => { for (const e of inbox.take()) seen.push(e); };
  const ref = r => labels.get(r) ?? r;
  const matches = (e, q) => (!q.actor || e.actor === q.actor) && (!q.kind || e.kind === q.kind) && (!q.match || new RegExp(q.match).test(e.body))
    && (!q.data || Object.entries(q.data).every(([k, v]) => JSON.stringify(k.split('.').reduce((o, x) => o?.[x], e.data)) === JSON.stringify(v)));
  let n = 0;
  for (const step of config.script ?? []) {
    if (inbox.stopped) return;
    pull();
    if (step.call !== undefined) {
      const startedAt = new Date().toISOString(), t0 = Date.now();
      while (Date.now() - t0 < step.call && !inbox.stopped) { await inbox.wait(step.call - (Date.now() - t0)); pull(); }
      yield { type: 'call', startedAt, endedAt: new Date().toISOString(), ms: Date.now() - t0, model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0 };
    } else if (step.busy !== undefined) { await new Promise(r => setTimeout(r, step.busy));   // busy WITHOUT reading the inbox
    } else if (step.emit) {
      const id = step.id ?? `${agent}-${++n}`;
      yield { type: 'event', kind: step.emit, body: step.body, id, refIds: (step.refs ?? []).map(ref) };
      if (step.label) labels.set(step.label, id);
    } else if (step.files) {
      yield { type: 'files', files: Object.entries(step.files).map(([path, content]) => ({ path, content })), message: step.message, refIds: (step.refs ?? []).map(ref) };
    } else if (step.await) {
      const t0 = Date.now(); let hit;
      while (!(hit = seen.find(e => !e.__used && matches(e, step.await))) && Date.now() - t0 < (step.timeoutMs ?? 10000) && !inbox.stopped) { await inbox.wait(100); pull(); }
      if (!hit) { yield { type: 'event', kind: 'note', body: `${agent}: gave up waiting for ${JSON.stringify(step.await)}` }; continue; }
      hit.__used = true; labels.set(step.label, hit.id);
    } else if (step.report === 'dropped') { pull(); yield { type: 'event', kind: 'note', body: `${agent}: inbox dropped=${inbox.dropped} seen=${seen.length}` };
    } else if (step.done !== undefined) { yield { type: 'done', body: step.done }; return; }
  }
}
