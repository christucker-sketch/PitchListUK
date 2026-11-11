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

test('whole inbox reply, including withheld metadata, stays within remaining context',async()=>{
 const t=await harness({maxContextBytes:1500});
 try {
  for(let i=0;i<30;i++)t.push(ev('long-id-'+i+'x'.repeat(70),2000));
  await new Promise(r=>setTimeout(r,30));
  const r=await t.h.bridge({op:'inbox',args:{}});
  const bytes=Buffer.byteLength(JSON.stringify(r.value));
  console.log('serialized inbox reply bytes:',bytes);
  assert.ok(r.ok!==true||bytes<=1499,'a successful reply must fit including withheld IDs and explanatory text');
 }finally{await t.end();}
});
