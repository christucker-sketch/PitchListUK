import test from 'node:test';
import assert from 'node:assert/strict';
import { runEnrichmentBatch } from '../../platform/findpitches-v2/enrichment/run-batch.mjs';

function db(row){
 const writes=[];
 return {writes,prepare(sql){return {args:[],bind(...a){this.args=a;return this;},async all(){return {results:/FROM enrichment_queue/.test(sql)?[row]:[]};},async run(){writes.push({sql,args:this.args});return {meta:{changes:1}};}};}};
}

test('enrichment directly fetches candidate pages without a search provider',async()=>{
 const store=db({candidate_id:'x',source_last_checked:'2026-09-27T08:00:00Z',canonical_url:'https://event.test/vendors',application_url:'https://event.test/apply',event_name:'Town Fair',organiser:'Town Council',geography_json:'{"location":"Town Hall"}'});
 const fetched=[];
 const fetchProvider={async fetch(url){fetched.push(url);return {final_url:url,body:'<html><body><p>Town Council welcomes vendors to Town Fair at Town Hall.</p><p>Vendor application deadline 20 October 2026.</p></body></html>'};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-27T09:00:00Z')});
 assert.equal(r.complete,1);
 assert.deepEqual(fetched,['https://event.test/vendors','https://event.test/apply']);
 assert.ok(store.writes.some(x=>/INSERT INTO candidate_enrichment/.test(x.sql)));
});

test('enrichment only follows useful same-site links',async()=>{
 const store=db({candidate_id:'x',source_last_checked:'2026-09-27T08:00:00Z',canonical_url:'https://event.test/',application_url:null,event_name:'Fair',organiser:null,geography_json:'{}'});
 const fetched=[];
 const fetchProvider={async fetch(url){fetched.push(url);return {final_url:url,body:url==='https://event.test/'?'<a href="/vendors">Vendor application</a><a href="https://other.test/apply">Apply elsewhere</a>':'Vendor applications for the fair are open.'};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-27T09:00:00Z')});
 assert.equal(r.complete,1);
 assert.deepEqual(fetched,['https://event.test/','https://event.test/vendors']);
});
