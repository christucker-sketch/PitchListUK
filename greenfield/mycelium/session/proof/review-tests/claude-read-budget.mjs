// Independent real-adapter bridge branch, memory-only OS/CLI. No model/socket/process.
// Intentionally failing regression on 89aabc60: rejected read poisons cumulative budget.
import test from 'node:test';import assert from 'node:assert/strict';
import {adapterHarness} from '../../test/helpers/claude-inmemory.mjs';
test('Claude oversized read must not consume unseen bytes or prevent a later small head-only read',async()=>{
 let ready;const started=new Promise(r=>ready=r),ac=new AbortController();
 const h=await adapterHarness((m,{output})=>{output({type:'user',uuid:m.uuid,message:m.message});ready();});
 const runtime={signal:ac.signal,reserve:async()=>({id:'p'}),publish:async()=>({}),
  read:async a=>({integration:'a'.repeat(40),truncated:false,files:a.headOnly?[]:[{path:'artifact/x',content:'x'.repeat(2000)}]})};
 const g=h.run({agent:'claude',config:{prompt:'x',command:['/fake'],maxContextBytes:1000,maxDeliveries:0},worktree:'/offline',
  inbox:{stopped:false,take:()=>[],wait:ms=>new Promise(r=>setTimeout(r,Math.min(ms,5)))},runtime});
 const pending=g.next();
 try{
  await started;
  const refused=await h.bridge({op:'read',args:{}});assert.equal(refused.ok,false);
  const small=await h.bridge({op:'read',args:{headOnly:true}});
  assert.equal(small.ok,true,'unseen oversized payload must not spend the allowance required for cheap metadata recovery');
 }finally{ac.abort();h.cleanup();await pending;await g.return();}
});
