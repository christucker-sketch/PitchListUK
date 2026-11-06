// Independent counterexamples for the 6 Nov fresh-token proposal. Zero models/host changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,freshOf,callTotalOf,callFreshOf} from '../coordinator.mjs';
import {CodexSession} from '../adapters/codex-app-server.mjs';
const e=(seq,actor,kind,data)=>({seq,actor,kind,at:new Date(seq*1000).toISOString(),refs:[],data});
const snapshot={threadId:'t',turnId:'u',usage:{totalTokens:230937,inputTokens:228500,cachedInputTokens:195456,outputTokens:2437}};
test('P1: actual Codex adapter completion must not turn 35,481 fresh into 230,937',async()=>{
 const audit=[];
 const rpc={notify(){},async request(m,p){
  if(m==='thread/start')return {thread:{id:'t'},activePermissionProfile:{id:p.permissions},approvalPolicy:'never',cwd:p.cwd};
  if(m==='mcpServerStatus/list')return {data:[],nextCursor:null};
  if(m==='turn/start')return {turn:{id:'u'}};
  return {};
 }};
 const session=new CodexSession({rpc,reserve:async()=>({id:'p1'}),publish:async out=>{audit.push(out);return {seq:audit.length};},signal:new AbortController().signal,worktree:'/offline/fixture'});
 await session.start('x');
 await rpc.onNotification({method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{total:snapshot.usage}}});
 await rpc.onNotification({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});await session.finished;
 const events=audit.map((out,i)=>e(i+1,'codex',out.type==='call'?'call':out.kind,out.type==='call'?out:out.data));
 const r=analyze(events);assert.equal(r.usage.codex,230937);assert.equal(r.freshUsage.codex,35481);
});
test('provider cache schemas differ: Claude cache creation is fresh, cache reads are excluded',()=>{
 assert.equal(freshOf({kind:'note',data:{usage:{totalTokens:52000,inputTokens:1000,cacheReadInputTokens:45000,cacheCreationInputTokens:5000,outputTokens:1000}}}),7000);
});
test('P2: invalid cache split larger than all input is unknown; conservatively count its full reported total',()=>{
 const p={kind:'note',data:{usage:{totalTokens:110,inputTokens:100,cachedInputTokens:1000,outputTokens:10}}};
 const n=freshOf(p)??110;assert.equal(n,110);
});
test('P2: a cache count without a valid input count must not suppress fresh consumption',()=>{
 const p={kind:'note',data:{usage:{totalTokens:110,cachedInputTokens:50,outputTokens:10}}};
 assert.equal(freshOf(p)??110,110);
});
test('known cache split matches the independently checked first-run fresh arithmetic',()=>assert.equal(freshOf({kind:'note',data:snapshot}),35481));
test('missing cache split is not silently interpreted as all cached',()=>assert.equal(freshOf({kind:'note',data:{usage:{totalTokens:110,inputTokens:100,outputTokens:10}}}),null));

test('terminal metadata stays in matching units: total includes cache, fresh excludes cached reads',()=>{
 const call={totalTokens:52000,freshTokens:7000,inputTokens:1000,outputTokens:1000};
 assert.equal(callTotalOf(call),52000);assert.equal(callFreshOf(call),7000);
});
test('legacy or inconsistent terminal cache metadata falls back to full known total',()=>{
 assert.equal(callFreshOf({inputTokens:100,outputTokens:10}),110);
 assert.equal(callFreshOf({totalTokens:110,freshTokens:-5}),110);
 assert.equal(callFreshOf({totalTokens:110,freshTokens:500}),110);
 assert.equal(callFreshOf({inputTokens:null,outputTokens:null}),null);
});

test('a known all-cached zero-fresh observation is zero, while missing usage stays unknown',()=>{
 const r=analyze([e(1,'codex','note',{threadId:'t',turnId:'u',usage:{totalTokens:50,inputTokens:50,cachedInputTokens:50,outputTokens:0}})]);
 assert.equal(r.usage.codex,50);assert.equal(r.freshUsage.codex,0);assert.equal(r.freshUsage.claude,null);
 const simulated=analyze([e(1,'claude','call',{model:'fake',interval:'simulated',inputTokens:0,outputTokens:0})]);assert.equal(simulated.usage.claude,null);
});
