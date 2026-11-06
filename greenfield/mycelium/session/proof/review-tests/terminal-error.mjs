// Run: node --experimental-vm-modules proof/review-tests/terminal-error.mjs
// Source-level stop-condition regression. In-memory CLI error frame, no model/host/socket call.
import test from 'node:test';import assert from 'node:assert/strict';
import {adapterHarness} from '../../test/helpers/claude-inmemory.mjs';
test('P3: an explicit terminal CLI error must fail the worker, not finish as a normal session',async()=>{
 const h=await adapterHarness((m,{output,later})=>{output({type:'user',uuid:m.uuid,message:m.message});later(()=>output({type:'result',subtype:'error_during_execution',is_error:true,errors:['synthetic quota refusal'],usage:{input_tokens:10,output_tokens:0}}),10);});
 let n=0;const audit=[],runtime={signal:new AbortController().signal,reserve:async()=>({id:'p'+ ++n}),publish:async out=>{audit.push(out);return {seq:audit.length};}};
 const inbox={stopped:false,take:()=>[],wait:ms=>new Promise(r=>setTimeout(r,ms))};
 try{await assert.rejects((async()=>{for await(const _ of h.run({agent:'claude',config:{prompt:'x',command:['/fake/claude'],idleMs:0},worktree:'/offline/worktree',inbox,runtime})) {}})(),/error|quota|fail/i);}finally{h.cleanup();}
});
