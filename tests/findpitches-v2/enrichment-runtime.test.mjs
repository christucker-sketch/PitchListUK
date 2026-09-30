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
 const fetchProvider={async fetch(url){
  fetched.push(url);
  if(url.endsWith('/vendors')) return {final_url:url,body:'<html><body><p>Town Council welcomes vendors to Town Fair at Town Hall.</p><p>Event date: 14 November 2026.</p></body></html>'};
  return {final_url:url,body:'<html><body><p>Applications close: 20 October 2026.</p></body></html>'};
 }};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-27T09:00:00Z')});
 assert.equal(r.complete,1);
 assert.deepEqual(fetched,['https://event.test/vendors','https://event.test/apply']);
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 assert.ok(stored);
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.event_start.value,'14 November 2026');
 assert.equal(enrichment.event_start.evidence[0].source,'https://event.test/vendors');
 assert.equal(enrichment.application_deadline.value,'20 October 2026');
 assert.equal(enrichment.application_deadline.evidence[0].source,'https://event.test/apply');
});

test('enrichment only follows useful same-site links',async()=>{
 const store=db({candidate_id:'x',source_last_checked:'2026-09-27T08:00:00Z',canonical_url:'https://event.test/',application_url:null,event_name:'Fair',organiser:null,geography_json:'{}'});
 const fetched=[];
 const fetchProvider={async fetch(url){fetched.push(url);return {final_url:url,body:url==='https://event.test/'?'<a href="/vendors">Vendor application</a><a href="https://other.test/apply">Apply elsewhere</a>':'Vendor applications for the fair are open.'};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-27T09:00:00Z')});
 assert.equal(r.complete,1);
 assert.deepEqual(fetched,['https://event.test/','https://event.test/vendors']);
});


test('enrichment stores source-corroborated area separately from strict venue',async()=>{
 const store=db({candidate_id:'k',source_last_checked:'2026-09-30T06:00:00Z',
  canonical_url:'https://event.test/kent-fair',application_url:null,event_name:'Autumn Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Applications are open for vendors at our Autumn Fair in Kent.</p><p>Contact office: London.</p></body></html>'};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T06:01:00Z')});
 assert.equal(r.complete,1);
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location,null);
 assert.equal(enrichment.location_area.value,'Kent');
 assert.equal(enrichment.location_area.evidence[0].source,'https://event.test/kent-fair');
 assert.match(enrichment.location_area.evidence[0].excerpt,/Autumn Fair in Kent/);
});

test('discovery geography alone never becomes a source-backed area',async()=>{
 const store=db({candidate_id:'k',source_last_checked:'2026-09-30T06:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are now open for our annual fair.</p><p>Registered office: Kent House, London.</p></body></html>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T06:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('description enrichment retains source evidence without crashing',async()=>{
 const store=db({candidate_id:'d',source_last_checked:'2026-09-30T07:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Fair',
  organiser:null,geography_json:'{"country_code":"GB","region":"Kent"}'});
 const body='<html><body><p>Vendor applications are open for independent traders who want to join our annual community fair with food, crafts and entertainment across the weekend.</p></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T07:01:00Z')});
 assert.equal(r.complete,1);
 assert.equal(r.failed,0);
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.match(enrichment.description.value,/Vendor applications are open/);
 assert.equal(enrichment.description.evidence[0].source,'https://event.test/vendors');
});
