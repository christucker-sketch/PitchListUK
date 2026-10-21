import test from 'node:test';import assert from 'node:assert/strict';
import {sourceRSCRecords,sourceRSCObjects} from '../../platform/findpitches-v3/source-rsc.mjs';
const script=body=>`<script>self.__next_f.push(${JSON.stringify([1,body])})</script>`;
test('split RSC streams are inert JSON; reference strings never substitute for source objects',()=>{
 const raw='a:["$","Event",null,{"event":{"id":"source-id"}}]\nb:{"event":"$a:props:event"}\n';const html='<script>self.__next_f.push([0])</script>'+script(raw.slice(0,24))+script(raw.slice(24));assert.equal(sourceRSCRecords(html).length,2);assert.deepEqual(sourceRSCObjects(html,'event'),[{id:'source-id'}]);
});
test('RSC rejects executable expressions, duplicate records, invalid JSON and bounded-depth abuse',()=>{
 globalThis.rscExecuted=false;assert.throws(()=>sourceRSCRecords('<script>self.__next_f.push((globalThis.rscExecuted=true,[1,"x"]))</script>'),/inert_json/);assert.equal(globalThis.rscExecuted,false);delete globalThis.rscExecuted;
 assert.throws(()=>sourceRSCRecords(script('1:{"a":1}\n1:{"a":2}\n')),/duplicate_record/);
 assert.throws(()=>sourceRSCRecords(script('1:{"a":}\n')),/record_json/);
 assert.throws(()=>sourceRSCRecords(script('1:'+JSON.stringify(Array.from({length:105}).reduce(a=>[a],0))+'\n')),/structure_limit/);
});
