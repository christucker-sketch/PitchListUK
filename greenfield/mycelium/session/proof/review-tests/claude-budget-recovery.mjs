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
  const runtime = { signal: ac.signal, reserve: async i => { reserved.push(i); return { id: `p${reserved.length}` }; }, publish: async o => { published.push(o); return { seq: published.length, id: 'evt-' + 'x'.repeat(60) }; },
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

// ---- whole-reply accounting (Codex review 97572ab) ----
test('many withheld events: bounded summary (count + 3 IDs), every reply fits, nothing pending is lost across polls', async () => {
  const t = await harness({ maxContextBytes: 1500 });
  try {
    for (let i = 0; i < 30; i++) t.push(ev('long-id-' + i + 'x'.repeat(70), 2000));
    await new Promise(r => setTimeout(r, 30));
    for (let poll = 0; poll < 2; poll++) {
      const r = await t.h.bridge({ op: 'inbox', args: {} });
      assert.equal(r.ok, true); assert.equal(r.value.withheldCount, 30); assert.equal(r.value.withheld.length, 3); assert.deepEqual(r.value.events, []);
      assert.ok(Buffer.byteLength(JSON.stringify(r.value)) < 1500);
    }
  } finally { await t.end(); }
});

test('repeated empty polls are charged in full: successes are bounded by the budget, then a short refusal, then an empty one', async () => {
  const t = await harness({ maxContextBytes: 400 });
  try {
    const replies = [];
    for (let i = 0; i < 30; i++) replies.push(await t.h.bridge({ op: 'inbox', args: {} }));
    const okBytes = replies.filter(r => r.ok).reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r.value)), 0);
    const errBytes = replies.filter(r => !r.ok).reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r.error)), 0);
    assert.ok(replies.some(r => !r.ok), 'the budget eventually refuses');
    assert.ok(okBytes <= 400, `successful replies ${okBytes} bytes within the 400-byte budget (the initial prompt is charged too)`);
    assert.ok(replies.filter(r => !r.ok).every(r => r.error === '' || /budget/.test(r.error)));
    assert.ok(okBytes + errBytes <= 400 + 2 * replies.length, 'beyond the budget only 2-byte empty refusals are sent');
  } finally { await t.end(); }
});

test('a receipt that no longer fits is reduced to {} (the publication itself already happened), never an unaccounted body', async () => {
  const t = await harness({ maxContextBytes: 400 });
  try {
    for (let i = 0; i < 40; i++) await t.h.bridge({ op: 'inbox', args: {} });   // spend the budget down to its last bytes
    const r = await t.h.bridge({ op: 'publish', args: { kind: 'note', body: 'x', refIds: [] } });
    assert.equal(r.ok, true); assert.ok(t.published.some(o => o.type === 'event' && o.body === 'x'));
    assert.deepEqual(r.value, {}, 'the receipt body is dropped rather than supplied uncharged');
  } finally { await t.end(); }
});
