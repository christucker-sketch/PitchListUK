import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {CodexRpc} from '../adapters/codex-rpc.mjs';
import {CodexSession} from '../adapters/codex-app-server.mjs';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const rig=options=>{const input=new PassThrough(),output=new PassThrough();return {input,output,rpc:new CodexRpc({readable:input,writable:output,...options}),send(m){input.write(JSON.stringify(m)+'\n');}};};
test('100 ordered notifications survive a blocked handler; responses and requests remain responsive',async()=>{
 const {rpc,send}=rig(),wait=gate(),seen=[];
 rpc.onNotification=async m=>{await wait.promise;seen.push(m.params.n);};
 rpc.onRequest=async()=>({success:true});
 const reply=rpc.request('probe',{});
 for(let n=0;n<100;n++)send({method:'usage',params:{n}});
 send({id:1,result:'ok'});send({id:70,method:'tool',params:{}});
 assert.equal(await reply,'ok');assert.equal(rpc.closed,undefined);
 wait.resolve();await rpc.notifications;
 assert.deepEqual(seen,Array.from({length:100},(_,i)=>i));assert.equal(rpc.notificationBytes,0);assert.equal(rpc.notificationCount,0);rpc.close();
});
test('notification count and byte bounds independently fail closed, without dispatch retries',async()=>{
 for(const options of [{maxNotifications:2},{maxNotificationBytes:60}]){
  const {rpc,send}=rig(options),wait=gate();rpc.onNotification=()=>wait.promise;
  for(let n=0;n<4;n++)send({method:'usage',params:{body:'x'.repeat(20)}});
  assert.match(rpc.closed?.message??'',/notification backlog/);
  wait.resolve();await rpc.notifications;assert.equal(rpc.notificationCount,0);assert.equal(rpc.notificationBytes,0);
 }
});
test('request flood still has the original tight independent limit',async()=>{
 const {rpc,send}=rig(),wait=gate();rpc.onRequest=()=>wait.promise;
 for(let n=0;n<9;n++)send({id:n,method:'tool',params:{}});
 assert.match(rpc.closed?.message??'',/inbound work limit/);wait.resolve();
});
test('Codex adapter bypasses ignored methods while preserving its three meaningful notification methods',async()=>{
 const {rpc,send}=rig(),wait=gate(),seen=[];
 new CodexSession({rpc,worktree:'/offline',reserve:async()=>({id:'p'}),publish:async()=>({}),signal:new AbortController().signal});
 const filter=rpc.notificationFilter;
 for(const method of ['turn/started','thread/tokenUsage/updated','turn/completed'])assert.equal(filter({method}),true);
 assert.equal(filter({method:'item/agentMessage/delta'}),false);
 rpc.onNotification=async m=>{await wait.promise;seen.push(m.method);};
 send({method:'turn/started'});
 for(let n=0;n<1000;n++)send({method:'item/agentMessage/delta',params:{delta:'text'}});
 send({method:'thread/tokenUsage/updated'});send({method:'turn/completed'});
 assert.equal(rpc.closed,undefined);assert.equal(rpc.notificationCount,3);
 wait.resolve();await rpc.notifications;assert.deepEqual(seen,['turn/started','thread/tokenUsage/updated','turn/completed']);rpc.close();
});
test('notification handler failure stops further queued handlers and rejects outstanding requests',async()=>{
 const {rpc,send}=rig(),seen=[];rpc.onNotification=async m=>{seen.push(m.params.n);throw Error('broker refused');};
 const outstanding=rpc.request('probe',{});const rejected=assert.rejects(outstanding,/broker refused/);
 send({method:'usage',params:{n:1}});send({method:'usage',params:{n:2}});
 await rejected;await rpc.notifications;assert.deepEqual(seen,[1]);assert.equal(rpc.notificationCount,0);
});
