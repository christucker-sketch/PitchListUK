// D5 counterexample for Claude's analyzer ownership. Expected FAIL until newest-merge identity is checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../coordinator.mjs';
const e=(seq,kind,data)=>({seq,actor:'coordinator',kind,at:new Date(seq).toISOString(),refs:[],data});
test('D5: a passing test of an older integration must not certify the newest untested merge',()=>{
 const old='a'.repeat(40),latest='b'.repeat(40);
 const r=analyze([e(1,'merged',{integration:old,agent:'codex'}),e(2,'tested',{integration:old,agent:'codex',ok:true}),e(3,'merged',{integration:latest,agent:'claude'})]);
 assert.equal(r.pass.criteria.sharedTestsPass,false,'latest integration has no test receipt, even though an earlier version passed');
});
