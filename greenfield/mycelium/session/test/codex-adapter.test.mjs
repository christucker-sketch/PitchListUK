import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { CodexRpc } from '../adapters/codex-rpc.mjs';
import { CodexSession, agentRun } from '../adapters/codex-app-server.mjs';

function fixture({ reserve = async () => ({ id: 'permit' }), maxContextBytes } = {}) {
  const wire = [], audit = [], ac = new AbortController();
  const rpc = {
    async request(method, params) {
      wire.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') { await rpc.onNotification({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1' } } }); return { turn: { id: 'turn-1' } }; }
      if (method === 'turn/steer') return { turnId: 'turn-1' };
      return {};
    },
    notify(method, params) { wire.push({ method, params }); }
  };
  const s = new CodexSession({ rpc, reserve: async i => { audit.push({ reservation: i.method }); return reserve(i); }, publish: async e => { audit.push(e); return { seq: audit.length }; }, signal: ac.signal, worktree: '/offline/fixture', maxContextBytes });
  return { s, rpc, wire, audit, ac };
}

test('one persistent thread receives deduplicated same-turn steering before completion', async () => {
  const { s, wire, audit } = fixture();
  await s.start('Investigate shared link normalisation.');
  await s.deliver([{ id: 'claude-17', body: 'Relative URLs fail.', kind: 'finding' }]);
  await s.deliver([{ id: 'claude-17', body: 'Relative URLs fail.', kind: 'finding' }]);
  assert.deepEqual(wire.map(x => x.method), ['initialize', 'initialized', 'thread/start', 'turn/start', 'turn/steer']);
  assert.equal(wire.at(-1).params.expectedTurnId, 'turn-1');
  assert.equal(wire.at(-1).params.threadId, 'thread-1');
  assert.equal(s.completed, undefined);
  assert.deepEqual(audit.filter(x => x.reservation).map(x => x.reservation), ['turn/start', 'turn/steer']);
  assert.equal(wire[2].params.sandbox, 'read-only');
  assert.equal(wire[2].params.approvalPolicy, 'never');
});

test('zero allowance prevents dispatch, including steering that may trigger additional inference', async () => {
  const { s, wire } = fixture({ reserve: async () => null });
  await assert.rejects(s.start('x'), /allowance refused/);
  assert.ok(!wire.some(x => x.method === 'turn/start'));
});
test('concurrent duplicate deliveries are serialized into one same-turn steer', async () => {
  const { s, wire } = fixture(); await s.start('x');
  await Promise.all([s.deliver([{ id: 'peer-1' }, { id: 'peer-1' }]), s.deliver([{ id: 'peer-1' }])]);
  assert.equal(wire.filter(x => x.method === 'turn/steer').length, 1);
});

test('no exec/resume fallback when active turn rejects steering; ambiguity is not retried', async () => {
  const { s, rpc, wire } = fixture(); await s.start('x');
  const original = rpc.request;
  rpc.request = async (m, p) => { if (m === 'turn/steer') { wire.push({ method: m, params: p }); throw new Error('turn ended during steer'); } return original(m, p); };
  await assert.rejects(s.deliver([{ id: 'e1' }]), /turn ended/);
  assert.equal(s.seen.size, 0);
  assert.equal(wire.filter(x => x.method === 'turn/start').length, 1);
  assert.equal(wire.filter(x => x.method === 'turn/steer').length, 1);
});

test('context overflow fails explicitly before inference; no silent oldest-event drop', async () => {
  const { s, wire } = fixture({ maxContextBytes: 100 }); await s.start('x');
  await assert.rejects(s.deliver([{ id: 'e1', body: 'x'.repeat(200) }]), /context byte budget/);
  assert.ok(!wire.some(x => x.method === 'turn/steer'));
});

test('dynamic tool publication happens during active turn, ACKed once and linked to peer event', async () => {
  const { s, rpc, audit } = fixture(); await s.start('x');
  const req = { id: 9, method: 'item/tool/call', params: { threadId: 'thread-1', turnId: 'turn-1', callId: 'c1', tool: 'myc_publish', arguments: { kind: 'challenge', body: 'Fragment stripping must follow URL resolution.', refIds: ['claude-17'] } } };
  const [a, b] = await Promise.all([rpc.onRequest(req), rpc.onRequest(req)]);
  assert.deepEqual(a, b); assert.equal(a.success, true);
  assert.equal(audit.filter(x => x.kind === 'challenge').length, 1);
  assert.deepEqual(audit.find(x => x.kind === 'challenge').refIds, ['claude-17']);
  await assert.rejects(rpc.onRequest({ ...req, params: { ...req.params, arguments: { ...req.params.arguments, body: 'changed' } } }), /reused/);
  await assert.rejects(rpc.onRequest({ ...req, method: 'item/commandExecution/requestApproval' }), /fail closed/);
});

test('submit uses broker, never edits worker filesystem; token costs remain unknown', async () => {
  const { s, rpc, audit } = fixture(); await s.start('x');
  await rpc.onRequest({ method: 'item/tool/call', params: { threadId: 'thread-1', turnId: 'turn-1', callId: 'c2', tool: 'myc_submit', arguments: { files: [{ path: 'artifact/links.mjs', content: 'export const x=1;' }], message: 'fix', refIds: ['claude-17'] } } });
  assert.equal(audit.find(x => x.type === 'files').message, 'fix');
  await rpc.onNotification({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { total: { inputTokens: 100, outputTokens: 20 } } } });
  assert.equal(audit.at(-1).data.costUsd, null);
  await rpc.onNotification({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await s.finished;
  await assert.rejects(s.deliver([{ id: 'late' }]), /no active turn/);
});

test('abort sends turn/interrupt; old worker without trusted runtime cannot activate adapter', async () => {
  const { s, wire, ac } = fixture(); await s.start('x'); ac.abort();
  await assert.rejects(s.finished, /stopped/);
  assert.equal(wire.at(-1).method, 'turn/interrupt');
  const g = agentRun({ agent: 'codex', config: {}, inbox: {} });
  await assert.rejects(g.next(), /trusted runtime/);
});

test('JSONL transport handles split UTF-8, out-of-order responses and server tool requests', async () => {
  const input = new PassThrough(), output = new PassThrough(); let sent = '';
  output.on('data', d => { sent += d; });
  const rpc = new CodexRpc({ readable: input, writable: output });
  const p1 = rpc.request('a', {}), p2 = rpc.request('b', {});
  const bytes = Buffer.from(JSON.stringify({ id: 2, result: '蘑菇' }) + '\n');
  input.write(bytes.subarray(0, bytes.length - 4)); input.write(bytes.subarray(bytes.length - 4));
  input.write('{"id":1,"result":"a"}\n');
  assert.deepEqual(await Promise.all([p1, p2]), ['a', '蘑菇']);
  rpc.onRequest = async () => ({ success: true });
  input.write('{"id":99,"method":"item/tool/call","params":{}}\n');
  await new Promise(r => setImmediate(r));
  assert.match(sent, /"id":99,"result":/); rpc.close();
});

test('transport closes on loss, bad JSON, excessive frame, or timeout; never retries', async () => {
  for (const mode of ['end', 'json', 'size', 'timeout']) {
    const input = new PassThrough(), output = new PassThrough(); let sent = '';
    output.on('data', d => { sent += d; });
    const rpc = new CodexRpc({ readable: input, writable: output, timeoutMs: 20, maxBytes: 100 });
    const pending = rpc.request('turn/start', {});
    if (mode === 'end') input.end();
    if (mode === 'json') input.write('bad\n');
    if (mode === 'size') input.write('x'.repeat(101));
    await assert.rejects(pending);
    assert.equal(sent.trim().split('\n').length, 1);
  }
});
test('transport bounds server-request flood instead of accumulating unbounded async work', async () => {
  const input = new PassThrough(), output = new PassThrough(); output.resume();
  const rpc = new CodexRpc({ readable: input, writable: output, maxPending: 2 });
  rpc.onRequest = () => new Promise(() => {});
  input.write([1, 2, 3].map(id => JSON.stringify({ id, method: 'item/tool/call', params: {} }) + '\n').join(''));
  assert.match(rpc.closed.message, /inbound work limit/);
});
test('wire-level fake app-server publishes and reacts to steering before its one turn completes', async () => {
  const input = new PassThrough(), output = new PassThrough(), received = [], audit = [];
  const send = m => input.write(JSON.stringify(m) + '\n');
  let startRequest;
  output.on('data', data => {
    for (const line of data.toString().trim().split('\n')) {
      const m = JSON.parse(line); received.push(m);
      if (m.method === 'initialize') send({ id: m.id, result: {} });
      if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: 't' } } });
      if (m.method === 'turn/start') {
        startRequest = m;
        send({ method: 'turn/started', params: { threadId: 't', turn: { id: 'u' } } });
        send({ id: m.id, result: { turn: { id: 'u' } } });
      }
      if (m.method === 'turn/steer') {
        send({ id: m.id, result: { turnId: 'u' } });
        send({ id: 'tool-7', method: 'item/tool/call', params: { threadId: 't', turnId: 'u', callId: 'publish-7', tool: 'myc_publish', arguments: { kind: 'reply', body: 'The fragment counterexample changes my normalization test.', refIds: ['claude-mid'] } } });
      }
      if (m.id === 'tool-7' && m.result) send({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'u', status: 'completed' } } });
    }
  });
  const rpc = new CodexRpc({ readable: input, writable: output });
  const s = new CodexSession({ rpc, reserve: async () => ({ id: 'offline-permit' }), publish: async e => { audit.push(e); return { seq: audit.length }; }, signal: new AbortController().signal, worktree: '/offline/fixture' });
  await s.start('Work together on the same artifact.');
  assert.ok(startRequest); assert.equal(s.completed, undefined);
  await s.deliver([{ id: 'claude-mid', body: 'A URL fragment duplicates a frontier node.' }]);
  await s.finished;
  assert.equal(received.filter(m => m.method === 'turn/start').length, 1);
  const reply = audit.find(e => e.kind === 'reply'); assert.deepEqual(reply.refIds, ['claude-mid']);
  assert.ok(audit.indexOf(reply) < audit.findIndex(e => e.body === 'Codex turn completed'));
  rpc.close();
});
