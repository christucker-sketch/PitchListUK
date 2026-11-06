// Codex review 8775082 + follow-ups: Claude adapter context charging is transactional. A refused payload spends nothing;
// a refused inbox read loses no events; a stdin delivery that would overflow pauses intake instead of crashing.
// Real adapter with the memory-only harness (no process, socket or model).
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterHarness } from '../../test/helpers/claude-inmemory.mjs';

async function harness({ maxContextBytes, maxDeliveries = 0, events = [], readFiles = 0 }) {
  let ready; const started = new Promise(r => (ready = r)), ac = new AbortController(), published = [], reserved = [];
  const h = await adapterHarness((m, { output }) => { output({ type: 'user', uuid: m.uuid, message: m.message }); ready(); });
  let queue = [...events];
  const runtime = { signal: ac.signal, reserve: async i => { reserved.push(i); return { id: `p${reserved.length}` }; }, publish: async o => { published.push(o); return {}; },
    read: async a => ({ integration: 'a'.repeat(40), truncated: false, files: a.headOnly ? [] : [{ path: 'artifact/x', content: 'x'.repeat(readFiles) }] }) };
  const inbox = { stopped: false, take: () => { const q = queue; queue = []; return q; }, wait: ms => new Promise(r => setTimeout(r, Math.min(ms, 5))) };
  const g = h.run({ agent: 'claude', config: { prompt: 'x', command: ['/fake'], maxContextBytes, maxDeliveries }, worktree: '/offline', inbox, runtime });
  const pending = g.next();
  await started;
  return { h, published, reserved, push: e => queue.push(e), async end() { ac.abort(); h.cleanup(); await pending.catch(() => {}); await g.return().catch(() => {}); } };
}
const ev = (id, n) => ({ id, actor: 'codex', kind: 'finding', body: 'b'.repeat(n), refs: [] });

test('a refused oversized read spends nothing: later headOnly reads still succeed, repeatedly', async () => {
  const t = await harness({ maxContextBytes: 1500, readFiles: 2000 });
  try {
    assert.equal((await t.h.bridge({ op: 'read', args: {} })).ok, false);
    assert.equal((await t.h.bridge({ op: 'read', args: { headOnly: true } })).ok, true);
    assert.equal((await t.h.bridge({ op: 'read', args: { headOnly: true } })).ok, true, 'repeatable: nothing was poisoned');
  } finally { await t.end(); }
});

test('inbox under budget pressure: a too-large event is withheld (named, still pending), smaller ones behind it are delivered', async () => {
  const t = await harness({ maxContextBytes: 1500 });
  try {
    t.push(ev('big', 2000)); t.push(ev('small', 20)); await new Promise(r => setTimeout(r, 30));
    const r1 = await t.h.bridge({ op: 'inbox', args: {} });
    assert.equal(r1.ok, true); assert.deepEqual(r1.value.events.map(e => e.id), ['small']); assert.deepEqual(r1.value.withheld, ['big']);
    const r2 = await t.h.bridge({ op: 'inbox', args: {} });
    assert.deepEqual(r2.value.events, []); assert.deepEqual(r2.value.withheld, ['big'], 'never silently dropped');
  } finally { await t.end(); }
});

test('a stdin delivery that would overflow pauses stdin intake before any grant; events stay for myc_inbox; no crash', async () => {
  const t = await harness({ maxContextBytes: 1500, maxDeliveries: 5 });
  try {
    t.push(ev('huge', 2000)); await new Promise(r => setTimeout(r, 50));
    assert.equal(t.reserved.filter(i => i.method === 'claude/stdin-delivery').length, 0, 'no grant reserved for an undeliverable batch');
    assert.ok(t.published.some(o => o.data?.deliveryIntakePaused && o.data.reason === 'context-budget' && o.data.withheldEventIds.includes('huge')));
    t.push(ev('small', 10)); await new Promise(r => setTimeout(r, 50));
    assert.equal(t.reserved.filter(i => i.method === 'claude/stdin-delivery').length, 0, 'intake stays paused (bounded, no retry loop)');
    assert.equal((await t.h.bridge({ op: 'read', args: { headOnly: true } })).ok, true, 'the adapter is still alive and serving tools');
  } finally { await t.end(); }
});
