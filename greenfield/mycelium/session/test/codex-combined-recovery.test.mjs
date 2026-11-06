// Combined real transport + real adapter rehearsal. Broker replies are explicit
// stand-ins: no model, child, socket, Git mutation, artifact execution or live service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {CodexRpc} from '../adapters/codex-rpc.mjs';
import {CodexSession} from '../adapters/codex-app-server.mjs';

function rig({maxContextBytes=24000,pull,read,publish}={}) {
 const input=new PassThrough(),output=new PassThrough(),rpc=new CodexRpc({readable:input,writable:output});
 const ac=new AbortController(),wire=[],audit=[],answers=new Map();let buffer='',id=100,grants=0;
 const send=m=>input.write(JSON.stringify(m)+'\n');
 output.on('data',b=>{buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);wire.push(m);
  if(m.method&&m.id!==undefined){let result={};
   if(m.method==='thread/start')result={thread:{id:'t'},activePermissionProfile:{id:m.params.permissions},approvalPolicy:'never',cwd:m.params.cwd};
   if(m.method==='mcpServerStatus/list')result={data:[],nextCursor:null};
   if(m.method==='turn/start')result={turn:{id:'u'}};
   if(m.method==='turn/steer')result={turnId:'u'};
   queueMicrotask(()=>send({id:m.id,result}));
  } else if(m.id!==undefined) {const fn=answers.get(m.id);answers.delete(m.id);fn(m);}
 }});
 const s=new CodexSession({rpc,signal:ac.signal,worktree:'/offline/fixture',maxContextBytes,maxDeliveries:5,
  reserve:async()=>{if(grants>=6)throw Error('seventh grant forbidden');return {id:'p'+ ++grants};},
  publish:async e=>{audit.push(e);return publish?publish(e):{seq:audit.length};},read,pull});
 return {s,rpc,ac,wire,audit,send,get grants(){return grants;},
  call(tool,args={},callId='c'+id){const n=id++;return new Promise(resolve=>{answers.set(n,resolve);send({id:n,method:'item/tool/call',params:{threadId:'t',turnId:'u',callId,tool,arguments:args}});});},
  async finish(){send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});await rpc.notifications;await s.finished;rpc.close();}
 };
}
const result=r=>{assert.ok(r.result,JSON.stringify(r));return r.result;};
test('combined recovery: all steering grants spent, late peer/test inbox, malformed tools, stale base, selective read, duplicate submit and completion',async()=>{
 let head='a'.repeat(40),pulls=0,commits=0;
 const later=[{id:'peer-late',seq:70,kind:'challenge',body:'late peer counterexample'}, {id:'test-late',seq:71,kind:'tested',body:'newest integration tests failed',data:{integration:head,ok:false}}];
 const f=rig({pull:async from=>{pulls++;return {events:from<71?later:[],next:71,head:71};},
  read:async a=>({integration:head,files:a.headOnly?[]:[{path:'artifact/x',content:a.paths?'small':'x'.repeat(24000)}]}),
  publish:async out=>{if(out.type==='files'){if(out.base!==head)throw Error('stale submission: integration is now '+head);commits++;head='b'.repeat(40);return {commit:72,merged:73};}return {seq:1};}});
 await f.s.start('offline rehearsal');
 for(let i=0;i<5;i++)await f.s.deliver([{id:'early'+i,body:'early peer event'}]);
 await f.s.pauseDeliveries();assert.equal(f.grants,6);
 const inbox=result(await f.call('myc_inbox'));assert.equal(inbox.success,true);assert.deepEqual(JSON.parse(inbox.contentItems[0].text).events,later);
 assert.equal(result(await f.call('myc_publish',{kind:'reply',body:1,refIds:[]})).success,false);
 assert.equal(result(await f.call('myc_submit',{files:[null],message:'bad',refIds:[]})).success,false);
 assert.equal(result(await f.call('myc_read',{headOnly:'yes'})).success,false);
 const tooBig=result(await f.call('myc_read'));assert.equal(tooBig.success,false);
 const metadata=result(await f.call('myc_read',{headOnly:true}));assert.equal(metadata.success,true);
 const files=result(await f.call('myc_read',{paths:['artifact/x']}));assert.equal(files.success,true);
 const args={base:'0'.repeat(40),files:[{path:'artifact/x',content:'fixed'}],message:'repair after late evidence',refIds:['peer-late','test-late']};
 assert.equal(result(await f.call('myc_submit',args)).success,false);
 const accepted=result(await f.call('myc_submit',{...args,base:head},'once'));assert.equal(accepted.success,true);
 assert.deepEqual(result(await f.call('myc_submit',{...args,base:'a'.repeat(40)},'once')),accepted);
 assert.equal(commits,1);assert.equal(f.grants,6);assert.equal(pulls,1);
 assert.equal(f.s.seen.has('peer-late'),true);assert.ok(f.s.contextBytes<=24000);
 await f.finish();assert.equal(f.s.completionStatus,'completed');
});
test('true context exhaustion returns zero-text refusals and permits normal terminal completion',async()=>{
 const f=rig({maxContextBytes:500,read:async()=>({files:[{content:'x'.repeat(1000)}]})});await f.s.start('x');
 let empty=0;
 for(let i=0;i<8;i++){const r=result(await f.call('myc_read'));assert.equal(r.success,false);if(!r.contentItems.length)empty++;}
 assert.ok(empty>0);assert.ok(f.s.contextBytes<=500);assert.equal(f.grants,1);await f.finish();
});
test('malformed argument matrix is recoverable and never reaches a mutation capability',async()=>{
 let writes=0;const f=rig({publish:async out=>{if(out.type==='files')writes++;return {};},read:async()=>({integration:'a'.repeat(40),files:[]})});await f.s.start('x');
 const submit={base:'a'.repeat(40),files:[{path:'artifact/x',content:'x'}],message:'m',refIds:[]};
 for(const [tool,args] of [
  ['myc_submit',null],['myc_submit',[]],['myc_submit','{}'],['myc_submit',{...submit,base:undefined}],
  ['myc_submit',{...submit,files:[null]}],['myc_submit',{...submit,files:[{}]}],['myc_submit',{...submit,files:[]}],
  ['myc_submit',{...submit,refIds:'peer'}],['myc_submit',{...submit,message:3}],['myc_submit',{...submit,extra:true}],
  ['myc_publish',{kind:'wrong',body:'x',refIds:[]}],['myc_publish',{kind:'note',body:'x'.repeat(4001),refIds:[]}],
  ['myc_read',{paths:[3]}],['myc_read',{headOnly:3}],['myc_inbox',{from:0}],
  ['myc_submit',{...submit,message:'x'.repeat(32001)}]
 ])assert.equal(result(await f.call(tool,args)).success,false);
 assert.equal(writes,0);assert.equal(f.rpc.closed,undefined);assert.equal(f.grants,1);await f.finish();
});
test('definitive broker validation refusal is recoverable but not automatically retried',async()=>{
 let refused=0;const f=rig({publish:async out=>{if(out.type==='files'){refused++;throw Error('submission refused: outside allowlist');}return {};}});await f.s.start('x');
 const args={base:'a'.repeat(40),files:[{path:'checks/x',content:'x'}],message:'m',refIds:[]};
 const a=result(await f.call('myc_submit',args,'refused'));assert.equal(a.success,false);
 assert.deepEqual(result(await f.call('myc_submit',args,'refused')),a);assert.equal(refused,1);await f.finish();
});
test('concurrent inbox reads serialize cursors, deduplicate call IDs and never consume steering grants',async()=>{
 const cursors=[];const f=rig({pull:async from=>{cursors.push(from);await Promise.resolve();return {events:[{id:'e'+(from+1),seq:from+1}],next:from+1,head:3};}});await f.s.start('x');
 const [a,b,c]=await Promise.all([f.call('myc_inbox',{},'same'),f.call('myc_inbox',{},'same'),f.call('myc_inbox',{},'next')]);
 assert.deepEqual(result(a),result(b));assert.equal(result(c).success,true);assert.deepEqual(cursors,[0,1]);assert.equal(f.grants,1);await f.finish();
});
test('inbox oversized refusal retains cursor for a later small read; STOP still interrupts',async()=>{
 let large=true;const cursors=[];const f=rig({maxContextBytes:1200,pull:async from=>{cursors.push(from);return {events:[{id:'e',body:large?'x'.repeat(2000):'small'}],next:1,head:1};}});await f.s.start('x');
 assert.equal(result(await f.call('myc_inbox')).success,false);assert.equal(f.s.inboxCursor,0);assert.equal(f.s.seen.has('e'),false);
 large=false;assert.equal(result(await f.call('myc_inbox')).success,true);assert.deepEqual(cursors,[0,0]);
 f.ac.abort();await assert.rejects(f.s.finished,/stopped/);assert.ok(f.wire.some(x=>x.method==='turn/interrupt'));f.rpc.close();
});
test('unknown broker refusal and changed duplicate payload remain fatal, not recoverable model errors',async()=>{
 for(const mode of ['broker','duplicate']){
  const f=rig({publish:async out=>{if(mode==='broker'&&out.body==='x')throw Error('ack outcome unknown');return {};}});await f.s.start('x');
  const args={kind:'note',body:'x',refIds:[]};
  if(mode==='duplicate'){assert.equal(result(await f.call('myc_publish',args,'same')).success,true);const failed=assert.rejects(f.s.finished,/reused/);await f.call('myc_publish',{...args,body:'changed'},'same');await failed;}
  else {const failed=assert.rejects(f.s.finished,/ack outcome unknown/);await f.call('myc_publish',args);await failed;}
  assert.ok(f.rpc.closed);assert.equal(f.grants,1);
 }
});
