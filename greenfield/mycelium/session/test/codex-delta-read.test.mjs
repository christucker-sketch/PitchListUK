import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexSession, TOOLS} from '../adapters/codex-app-server.mjs';
import {createReadGuard} from '../adapters/claude-stream.mjs';

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
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const call=(rpc,args={},id='read')=>rpc.onRequest({method:'item/tool/call',params:{threadId:'thread-1',turnId:'turn-1',callId:id,tool:'myc_read',arguments:args}});
const full=(head=A)=>({integration:head,paths:['artifact/x'],files:[{path:'artifact/x',content:'old'}],truncated:false});
const delta=(extra={})=>({integration:B,since:A,delta:true,changed:['artifact/x'],deleted:['artifact/removed'],files:[{path:'artifact/x',content:'new'}],omitted:[],complete:true,selective:false,...extra});
test('schema exposes sinceIntegration; malformed and conflicting head-only arguments are recoverable',async()=>{
 assert.equal(TOOLS.find(t=>t.name==='myc_read').inputSchema.properties.sinceIntegration.pattern,'^[0-9a-f]{40}$');
 let reads=0;const {s,rpc}=fixture({read:async()=>{reads++;return full();}});await s.start('x');
 for(const [i,args] of [{sinceIntegration:'bad'},{sinceIntegration:A,headOnly:true}].entries())assert.equal((await call(rpc,args,'bad'+i)).success,false);
 assert.equal(reads,0);
});
test('only a fully delivered base enables delta; exact request and deletions survive; no extra inference grant',async()=>{
 const requests=[];const {s,rpc,wire}=fixture({read:async args=>{requests.push(args);return args.sinceIntegration?delta():full();}});await s.start('x');
 const refused=await call(rpc,{sinceIntegration:A},'missing');assert.equal(refused.success,false);assert.match(refused.contentItems[0].text,/base-not-held-completely/);assert.equal(requests.length,0);
 await call(rpc,{},'full');assert.equal(s.heldIntegrations.has(A),true);
 const args={sinceIntegration:A},r=await call(rpc,args,'delta');assert.equal(r.success,true);
 assert.deepEqual(requests,[{},args]);const receipt=JSON.parse(r.contentItems[0].text);assert.deepEqual(receipt.deleted,['artifact/removed']);assert.deepEqual(receipt.files,[{path:'artifact/x',content:'new'}]);assert.ok(s.heldIntegrations.has(B));
 assert.equal(wire.filter(x=>x.method==='turn/start'||x.method==='turn/steer').length,1);
});
test('head-only, selective and truncated full reads never enable a delta and do not cause fallback',async()=>{
 for(const [args,reply] of [[{headOnly:true},full()],[{paths:['artifact/x']},full()],[{},{...full(),truncated:true}]]){
  let reads=0;const {s,rpc}=fixture({read:async()=>{reads++;return reply;}});await s.start('x');await call(rpc,args,'partial');
  assert.equal(s.heldIntegrations.has(A),false);assert.equal((await call(rpc,{sinceIntegration:A},'try')).success,false);assert.equal(reads,1);
 }
});
test('incomplete, selective, refused and mismatched deltas do not promote coverage',async()=>{
 for(const [args,reply] of [[{sinceIntegration:A},delta({complete:false,omitted:['artifact/x'],files:[]})],
  [{sinceIntegration:A,paths:['artifact/x']},delta()],
  [{sinceIntegration:A},delta({refused:'not-ancestor',fullReadRequired:true,complete:false,files:[]})],
  [{sinceIntegration:A},delta({since:C})]]){
  let n=0;const {s,rpc}=fixture({read:async()=>++n===1?full():reply});await s.start('x');await call(rpc,{},'base');await call(rpc,args,'delta');
  assert.equal(s.heldIntegrations.has(B),false);assert.equal(s.heldIntegrations.has(A),true);
 }
});
test('budget-refused delta does not advance; retry from old base may deliver a smaller complete delta',async()=>{
 let n=0;const requests=[];const {s,rpc}=fixture({maxContextBytes:1600,read:async args=>{requests.push(args);n++;return n===1?full():n===2?delta({files:[{path:'artifact/x',content:'x'.repeat(2000)}]}):delta();}});await s.start('x');
 await call(rpc,{},'base');assert.equal((await call(rpc,{sinceIntegration:A},'large')).success,false);assert.equal(s.heldIntegrations.has(B),false);
 assert.equal((await call(rpc,{sinceIntegration:A},'small')).success,true);assert.equal(s.heldIntegrations.has(B),true);assert.equal(requests[2].sinceIntegration,A);assert.ok(s.contextBytes<=1600);
});
test('empty complete delta is cheap and duplicate call does not repeat read or byte charge',async()=>{
 let n=0;const {s,rpc}=fixture({read:async()=>++n===1?full():delta({integration:A,changed:[],deleted:[],files:[]})});await s.start('x');await call(rpc,{},'base');
 const r=await call(rpc,{sinceIntegration:A},'same'),bytes=s.contextBytes;assert.equal(r.success,true);assert.deepEqual(JSON.parse(r.contentItems[0].text).files,[]);
 assert.deepEqual(await call(rpc,{sinceIntegration:A},'same'),r);assert.equal(n,2);assert.equal(s.contextBytes,bytes);
});
test('Codex and Claude coverage guards agree for successful complete and partial delivery sequence',async()=>{
 const guard=createReadGuard();let reply;const {s,rpc}=fixture({read:async()=>reply});await s.start('x');let i=0;
 for(const [args,r] of [[{headOnly:true},full()],[{paths:['artifact/x']},full()],[{},{...full(),truncated:true}],[{},full()],
  [{sinceIntegration:A},delta({complete:false})],[{sinceIntegration:A},delta()]]){
  reply=r;const result=await call(rpc,args,String(i++));assert.equal(result.success,true);guard.delivered(args,r);assert.deepEqual([...s.heldIntegrations],[...guard.held]);
 }
});
test('SYNTHETIC replay: delta delivers equivalent final content within 24KB; repeated full reads hit the unchanged cap',async()=>{
 const initial={'artifact/README':'readme\n','artifact/frontier.mjs':'export function expand() { return []; }\n'};
 const plan=[['artifact/frontier.mjs',4000],['artifact/frontier.test.mjs',3500],['artifact/frontier.mjs',4100],['artifact/extra.test.mjs',1500],['artifact/frontier.mjs',4200]];
 const histories=[initial];plan.forEach(([path,n],i)=>histories.push({...histories.at(-1),[path]:`// ${i}\n`+'y'.repeat(n)}));
 const sha=i=>(i+1).toString(16).padStart(40,'0'),costs={};
 for(const mode of ['full','delta']){
  let index=0,requestedBytes=0;const modelFiles={},f=fixture({read:async args=>{
   const current=histories[index],head=sha(index),paths=Object.keys(current);
   let reply;
   if(args.sinceIntegration){const prev=histories.find((_,i)=>sha(i)===args.sinceIntegration),changed=paths.filter(p=>current[p]!==prev[p]);
    reply={integration:head,since:args.sinceIntegration,delta:true,changed,deleted:[],files:changed.map(path=>({path,content:current[path]})),omitted:[],complete:true,selective:false};
   }else reply={integration:head,paths,files:paths.map(path=>({path,content:current[path]})),truncated:false};
   requestedBytes+=Buffer.byteLength(JSON.stringify(reply));return reply;
  }});await f.s.start('x');let held,completeReads=0;
  for(index=0;index<histories.length;index++){
   const args=mode==='delta'&&held?{sinceIntegration:held}:{};
   const result=await call(f.rpc,args,'r'+index);
   if(!result.success)continue;
   const r=JSON.parse(result.contentItems[0].text);for(const p of r.deleted??[])delete modelFiles[p];for(const file of r.files)modelFiles[file.path]=file.content;
   held=r.integration;completeReads++;
  }
  costs[mode]={requestedBytes,deliveredTextBytes:f.s.contextBytes,completeReads};
  assert.ok(f.s.contextBytes<=24000);
  if(mode==='delta')assert.deepEqual(modelFiles,histories.at(-1));else assert.ok(completeReads<histories.length);
 }
 assert.ok(costs.delta.requestedBytes<costs.full.requestedBytes);assert.equal(costs.delta.completeReads,histories.length);
 console.log('# SYNTHETIC serialized response bytes (not run-4 or token billing): '+JSON.stringify(costs));
});

