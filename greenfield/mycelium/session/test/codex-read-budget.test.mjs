import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexSession } from '../adapters/codex-app-server.mjs';

function fixture({ reserve = async () => ({ id: 'permit' }), maxContextBytes, read } = {}) {
  const wire = [], audit = [], ac = new AbortController();
  const rpc = {
    async request(method, params) {
      wire.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'thread-1' }, activePermissionProfile:{id:params.permissions},approvalPolicy:'never',cwd:params.cwd };
      if (method === 'mcpServerStatus/list') return {data:[],nextCursor:null};
      if (method === 'turn/start') { await rpc.onNotification({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1' } } }); return { turn: { id: 'turn-1' } }; }
      if (method === 'turn/steer') return { turnId: 'turn-1' };
      return {};
    },
    notify(method, params) { wire.push({ method, params }); }
  };
  const s = new CodexSession({ rpc, read, reserve: async i => { audit.push({ reservation: i.method }); return reserve(i); }, publish: async e => { audit.push(e); return { seq: audit.length }; }, signal: ac.signal, worktree: '/offline/fixture', maxContextBytes });
  return { s, rpc, wire, audit, ac };
}

const request = (id, args = {}) => ({method:'item/tool/call', params:{threadId:'thread-1',turnId:'turn-1',callId:id,tool:'myc_read',arguments:args}});

test('oversized read is unsuccessful, charged, deduplicated and followed by selective read and completion', async () => {
  let reads=0;
  const {s,rpc}=fixture({maxContextBytes:1200,read:async a=>{reads++;return {integration:'a'.repeat(40),files:a.paths?{'artifact/a.mjs':'small'}:{'artifact/a.mjs':'PRIVATE'.repeat(1000)}};}});
  await s.start('prompt');
  const before=s.contextBytes;
  const [a,b]=await Promise.all([rpc.onRequest(request('large')),rpc.onRequest(request('large'))]);
  assert.equal(a.success,false); assert.deepEqual(a,b);assert.equal(reads,1);
  assert.match(a.contentItems[0].text,/read_context_budget/);assert.doesNotMatch(a.contentItems[0].text,/PRIVATE/);
  assert.equal(s.contextBytes,before+Buffer.byteLength(a.contentItems[0].text));
  const small=await rpc.onRequest(request('small',{paths:['artifact/a.mjs']}));
  assert.equal(small.success,true);assert.equal(reads,2);assert.ok(s.contextBytes<=1200);
  await rpc.onNotification({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}}});
  await s.finished;
});
test('headOnly uses trusted runtime without returning all files',async()=>{
  let args;
  const {s,rpc}=fixture({read:async a=>{args=a;return {integration:'b'.repeat(40),files:{}};}});
  await s.start('x');const r=await rpc.onRequest(request('head',{headOnly:true}));
  assert.equal(r.success,true);assert.deepEqual(args,{headOnly:true});
  await assert.rejects(rpc.onRequest(request('bad',{headOnly:'yes'})),/bad read/);
});
test('broker failures remain fatal and are not converted to budget refusals',async()=>{
  const {s,rpc}=fixture({read:async()=>{throw Error('broker unavailable');}});await s.start('x');
  await assert.rejects(rpc.onRequest(request('bad')),/broker unavailable/);
});
test('repeated refusals cannot exceed or silently increase the cumulative ceiling',async()=>{
  const {s,rpc}=fixture({maxContextBytes:800,read:async()=>({files:{x:'x'.repeat(2000)}})});await s.start('x');
  let refused=0,exhausted=false;
  for(let i=0;i<10;i++){
    try{assert.equal((await rpc.onRequest(request(String(i)))).success,false);refused++;}
    catch(e){assert.match(e.message,/context byte budget/);exhausted=true;break;}
  }
  assert.ok(refused>1);assert.ok(exhausted);assert.ok(s.contextBytes<=800);assert.equal(s.maxContextBytes,800);
});
