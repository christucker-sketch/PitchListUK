// Reproductions of D1 and Codex D3 from the first live proof. In-memory RPC, zero model/host calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexSession,agentRun} from '../adapters/codex-app-server.mjs';
import {analyze} from '../coordinator.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fixture({confirmed=true,maxDeliveries=5}={}) {
 const calls=[],audit=[],ac=new AbortController();let grants=0;
 const rpc={notify(){},async request(method,p){calls.push({method,p});
 if(method==='thread/start')return {thread:{id:'t'},activePermissionProfile:{id:p.permissions},approvalPolicy:'never',cwd:p.cwd};
 if(method==='mcpServerStatus/list')return {data:[],nextCursor:null};
 if(method==='turn/start'){
   if(confirmed)await rpc.onNotification?.({method:'turn/started',params:{threadId:'t',turn:{id:'u'}}});
   return {turn:{id:'u'}};
 }
 if(method==='turn/steer')return {turnId:'u'};
 return {};
 }};
 const runtime={rpc,signal:ac.signal,reserve:async()=>({id:'p'+ ++grants}),publish:async e=>{audit.push(e);return {seq:audit.length};}};
 const s=new CodexSession({...runtime,worktree:'/offline/fixture',maxDeliveries});
 return {s,rpc,calls,audit,ac,runtime,get grants(){return grants;}};
}
test('D1: sixth peer batch is explicitly withheld, never granted/ACKed or fatal to the active turn',async()=>{
 const f=fixture();await f.s.start('x');
 for(let n=0;n<5;n++)await f.s.deliver([{id:'e'+n,body:'finding'}]);
 const bytes=f.s.contextBytes;
 const withheld=await f.s.deliver([{id:'e5',body:'final implementation'}]);
 assert.equal(withheld.delivered,false);assert.equal(withheld.reason,'delivery-limit');
 assert.equal(f.grants,6);assert.equal(f.s.deliveries,5);assert.equal(f.s.contextBytes,bytes);
 assert.equal(f.s.seen.has('e5'),false);
 assert.equal(f.calls.filter(x=>x.method==='turn/steer').length,5);
 await f.s.deliver([{id:'e6',body:'another finding'}]);
 assert.equal(f.audit.filter(x=>x.data?.deliveryIntakePaused).length,1,'audit once, not one note per withheld event');
 await f.rpc.onNotification({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});await f.s.finished;
});
test('D1: worker adapter stops taking durable peer batches at its cap but lets the active turn complete',async()=>{
 const f=fixture();let takes=0;
 const old=f.rpc.request.bind(f.rpc);
 f.rpc.request=async(method,p)=>{const r=await old(method,p);if(method==='turn/steer')setTimeout(()=>f.rpc.onNotification({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}}),60);return r;};
 const inbox={stopped:false,dropped:0,take(){takes++;return [{id:'batch'+takes,body:'finding'}];},wait:()=>sleep(5)};
 const g=agentRun({agent:'codex',config:{prompt:'x',maxDeliveries:1},worktree:'/offline/fixture',inbox,runtime:f.runtime});
 const result=await g.next();assert.equal(result.value.type,'done');await g.return();
 assert.equal(takes,1,'later batches stay in inbox/bus rather than being consumed and discarded');
 assert.equal(f.grants,2);
});
test('D3: confirmed interrupted turn is ledgered as active BEFORE a slow interrupt acknowledgement',async()=>{
 const f=fixture();await f.s.start('x');await sleep(5);
 const started=f.s.startedAt;let release;
 f.rpc.request=async method=>method==='turn/interrupt'?new Promise(r=>{release=r;}):{};
 const stopped=f.s.interrupt();await sleep(5);
 const records=f.audit.filter(e=>e.type==='call');
 assert.equal(records.length,1);assert.equal(records[0].interval,'active-turn');
 assert.equal(records[0].outcome,'interrupted');assert.equal(records[0].startedAt,started);
 assert.equal(records[0].inputTokens,null);assert.equal(records[0].outputTokens,null);
 assert.ok(records[0].ms>=0);release({});await stopped;
});
test('D3: accepted start response also confirms activity without a started notification',async()=>{
 const f=fixture({confirmed:false});await f.s.start('x');await f.s.interrupt();
 const c=f.audit.find(e=>e.type==='call');assert.equal(c.interval,'active-turn');assert.equal(c.outcome,'interrupted');
});
test('D3: ambiguous start without a confirmation remains unknown; no invented active interval',async()=>{
 const f=fixture({confirmed:false});const old=f.rpc.request.bind(f.rpc);
 f.rpc.request=async(m,p)=>{if(m==='turn/start')throw Error('transport outcome unknown');return old(m,p);};
 await assert.rejects(f.s.start('x'),/transport outcome unknown/);await f.s.interrupt();
 const c=f.audit.filter(e=>e.type==='call');assert.equal(c.length,1);assert.equal(c[0].interval,'unknown');
});
test('D3: concurrent STOP, duplicate started event and late completion cannot replace/duplicate interruption evidence',async()=>{
 const f=fixture();await f.s.start('x');const started=f.s.startedAt;await sleep(3);
 await f.rpc.onNotification({method:'turn/started',params:{threadId:'t',turn:{id:'u'}}});
 await Promise.all([f.s.interrupt(),f.s.interrupt()]);
 await f.rpc.onNotification({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});
 const records=f.audit.filter(e=>e.type==='call');assert.equal(records.length,1);
 assert.equal(records[0].startedAt,started);assert.equal(records[0].interval,'active-turn');assert.equal(records[0].outcome,'interrupted');
});
test('D3: overlap accepts confirmed interrupted intervals but STOP still prevents a mechanical PASS',()=>{
 const event=(seq,actor,kind,ms,data={})=>({seq,actor,kind,refs:[],at:new Date(ms).toISOString(),data});
 const r=analyze([event(1,'claude','start',0),event(2,'codex','start',1),event(3,'coordinator','stop',100),
 event(4,'claude','call',102,{interval:'active-turn',outcome:'interrupted',startedAt:new Date(10).toISOString(),endedAt:new Date(100).toISOString()}),
 event(5,'codex','call',103,{interval:'active-turn',outcome:'interrupted',startedAt:new Date(20).toISOString(),endedAt:new Date(100).toISOString()})]);
 assert.equal(r.callOverlapMs,80);assert.equal(r.pass.mechanical,false);assert.equal(r.pass.criteria.noStop,false);
});

test('D3: transport failure after a confirmed start keeps a conservative active interval, without claiming completion',async()=>{
 const f=fixture();const old=f.rpc.request.bind(f.rpc);
 f.rpc.request=async(m,p)=>{if(m==='turn/start'){await old(m,p);throw Error('reply lost after started notification');}return old(m,p);};
 await assert.rejects(f.s.start('x'),/reply lost/);await f.s.interrupt();
 const c=f.audit.filter(e=>e.type==='call');assert.equal(c.length,1);assert.equal(c[0].interval,'active-turn');assert.equal(c[0].outcome,'unknown');
});
test('D1: unknown steer and explicit allowance refusal still fail closed; no retry or cap relaxation',async()=>{
 for(const refusal of ['quota','transport']){
  const f=fixture();await f.s.start('x');
  if(refusal==='quota')f.s.reserve=async()=>null;
  else {const old=f.rpc.request.bind(f.rpc);f.rpc.request=async(m,p)=>{if(m==='turn/steer')throw Error('unknown steer');return old(m,p);};}
  await assert.rejects(f.s.deliver([{id:'e'}]),refusal==='quota'?/allowance refused/:/unknown steer/);
  assert.equal(f.s.seen.size,0);assert.equal(f.s.deliveryIntakePaused,undefined);
  await f.s.interrupt();
 }
});

test('D3: completed turn ends at its terminal event, not at a later tool ACK or STOP',async()=>{
 const f=fixture();await f.s.start('x');let release;
 f.s.tools.set('pending',{promise:new Promise(r=>{release=r;})});
 const completed=f.rpc.onNotification({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});
 const end=f.s.completedAt;await sleep(5);await f.s.interrupt();release({});await completed;await f.s.finished;
 const rows=f.audit.filter(e=>e.type==='call');assert.equal(rows.length,1);assert.equal(rows[0].endedAt,end);assert.equal(rows[0].outcome,'completed');
});
