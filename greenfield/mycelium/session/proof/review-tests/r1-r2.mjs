// Run: node --experimental-vm-modules proof/review-tests/r1-r2.mjs
// Real adapter, memory-only CLI/OS mocks. Complements, never substitutes for, process/host tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {adapterHarness} from '../../test/helpers/claude-inmemory.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const event={id:'peer',kind:'finding',actor:'codex',body:'counterexample'};
function runtime(audit,publish) {let n=0;const ac=new AbortController();return {signal:ac.signal,reserve:async()=>({id:'p'+ ++n}),publish:async out=>{audit.push(out);return publish?publish(out):{seq:audit.length};},read:async()=>({files:[]})};}
async function drain(h,cfg,inbox,rt){const g=h.run({agent:'claude',config:{prompt:'x',command:['/fake/claude'],idleMs:0,...cfg},worktree:'/offline/worktree',inbox,runtime:rt});for await(const _ of g){}}
const empty={stopped:false,take:()=>[],wait:sleep};
test('R1 independent: delayed initial CLI acceptance bounds interval; send time remains separately recorded',async()=>{
 const audit=[];const h=await adapterHarness((m,{output,later})=>{later(()=>output({type:'user',uuid:m.uuid,message:m.message}),35);later(()=>output({type:'result',usage:{input_tokens:20,output_tokens:5}}),65);});
 try{await drain(h,{},empty,runtime(audit));const c=audit.find(x=>x.type==='call');assert.equal(c.interval,'active-turn');assert.ok(Date.parse(c.startedAt)-Date.parse(c.sentAt)>=25);assert.equal(c.ms,Date.parse(c.endedAt)-Date.parse(c.startedAt));}finally{h.cleanup();}
});
test('R1 independent: a terminal result without acceptance keeps activity unknown and preserves usage',async()=>{
 const audit=[];const h=await adapterHarness((_m,{output,later})=>{later(()=>output({type:'result',usage:{input_tokens:20,output_tokens:5}}),30);});
 try{await drain(h,{},empty,runtime(audit));const c=audit.find(x=>x.type==='call');assert.equal(c.interval,'unknown');assert.equal(c.inputTokens,20);}finally{h.cleanup();}
});
test('R1 independent: queued delivery starts at replay consumption, not earlier send or the prior active turn',async()=>{
 const audit=[];let inputs=0,queued,first;
 const h=await adapterHarness((m,{output,later})=>{if(++inputs===1){first=m;later(()=>output({type:'user',uuid:m.uuid,message:m.message}),2);later(()=>output({type:'result',usage:{input_tokens:20,output_tokens:5}}),35);later(()=>{assert.ok(queued);output({type:'user',uuid:queued.uuid,message:queued.message});},65);later(()=>output({type:'result',usage:{input_tokens:30,output_tokens:5}}),90);}else queued=m;});
 let pending=true;const inbox={stopped:false,take:()=>pending?(pending=false,[event]):[],wait:sleep};
 try{await drain(h,{},inbox,runtime(audit));const cs=audit.filter(x=>x.type==='call');assert.equal(cs.length,2);const queuedCall=cs.find(x=>x.permit==='p2');const note=audit.find(x=>x.data?.mode==='queued');assert.ok(note);assert.equal(queuedCall.startedAt,note.data.consumedAt);assert.ok(Date.parse(queuedCall.startedAt)>Date.parse(queuedCall.sentAt));assert.ok(Date.parse(queuedCall.startedAt)>=Date.parse(cs[0].endedAt));}finally{h.cleanup();}
});
test('R2 independent: rejected live usage publication is fatal, exactly once; no silent continuation',async()=>{
 const audit=[];let attempts=0;const h=await adapterHarness((m,{output,later})=>{output({type:'user',uuid:m.uuid,message:m.message});later(()=>output({type:'assistant',message:{id:'msg1',usage:{input_tokens:1000,output_tokens:3}}}),5);});
 const rt=runtime(audit,out=>{if(out.data?.usage){attempts++;throw Error('synthetic missing ACK');}return {seq:audit.length};});
 try{await assert.rejects(drain(h,{},empty,rt),/usage report refused/);assert.equal(attempts,1);}finally{h.cleanup();}
});
test('R2 independent: pending usage ACK is serialized and repeated message blocks do not double count',async()=>{
 const audit=[];let inFlight=0,peak=0,attempts=0;
 const h=await adapterHarness((m,{output,later})=>{output({type:'user',uuid:m.uuid,message:m.message});
  later(()=>{for(let i=0;i<2;i++)output({type:'assistant',message:{id:'one',usage:{input_tokens:100,output_tokens:0}}});},5);
  later(()=>output({type:'assistant',message:{id:'two',usage:{input_tokens:200,output_tokens:0}}}),10);
  later(()=>output({type:'result',usage:{input_tokens:300,output_tokens:0}}),60);
 });
 const rt=runtime(audit,async out=>{if(out.data?.usage){attempts++;inFlight++;peak=Math.max(peak,inFlight);await sleep(25);inFlight--;}return {seq:audit.length};});
 try{await drain(h,{},empty,rt);const notes=audit.filter(x=>x.data?.usage);assert.equal(peak,1);assert.equal(attempts,2);assert.equal(notes.at(-1).data.usage.totalTokens,300);}finally{h.cleanup();}
});

test('Claude terminal usage normalizes cache reads/writes without losing raw input/output',async()=>{
 const audit=[];const h=await adapterHarness((m,{output,later})=>{output({type:'user',uuid:m.uuid,message:m.message});later(()=>output({type:'result',subtype:'success',usage:{input_tokens:1000,cache_read_input_tokens:45000,cache_creation_input_tokens:5000,output_tokens:1000}}),15);});
 try{await drain(h,{},empty,runtime(audit));const c=audit.find(x=>x.type==='call');assert.equal(c.totalTokens,52000);assert.equal(c.freshTokens,7000);assert.equal(c.inputTokens,1000);assert.equal(c.outputTokens,1000);assert.equal(c.outcome,'completed');}finally{h.cleanup();}
});
