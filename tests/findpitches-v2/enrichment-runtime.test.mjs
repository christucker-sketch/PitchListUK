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


test('GB enrichment recovers a source-backed town when text anchors it to the known county',async()=>{
 const store=db({candidate_id:'gb-place',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Autumn Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are open for our Autumn Fair in Maidstone, Kent.</p></body></html>'};}};
 const r=await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 assert.equal(r.complete,1);
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'Maidstone');
 assert.equal(enrichment.location_area.precision,'place');
 assert.match(enrichment.location_area.evidence[0].excerpt,/Maidstone, Kent/);
});

test('GB place extractor ignores contact-office county addresses',async()=>{
 const store=db({candidate_id:'gb-office',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Autumn Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are open for our Autumn Fair.</p><p>Contact office: Maidstone, Kent.</p></body></html>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});

test('GB place extractor does not run for non-GB markets',async()=>{
 const store=db({candidate_id:'us-place',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Autumn Fair',
  organiser:null,geography_json:'{"country_code":"US","region_code":"CA","region":"California"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are open for our Autumn Fair in Riverside, California.</p></body></html>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'California');
 assert.equal(enrichment.location_area.precision,'area');
});


test('GB place extraction recovers county-anchored towns from strong event context',async()=>{
 const cases=[
  {body:'<p>Vendor applications are now open for our Christmas Market in Maidstone, Kent.</p>',expected:'Maidstone'},
  {body:'<p>The food festival takes place in Royal Tunbridge Wells in Kent this autumn.</p>',expected:'Royal Tunbridge Wells'}
 ];
 for(const item of cases){
  const store=db({candidate_id:'gb',source_last_checked:'2026-09-30T06:00:00Z',
   canonical_url:'https://event.test/vendors',application_url:null,event_name:'Market',
   organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
  const fetchProvider={async fetch(url){return {final_url:url,body:item.body};}};
  await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T06:01:00Z')});
  const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
  const enrichment=JSON.parse(stored.args[2]);
  assert.equal(enrichment.location_area.value,item.expected);
  assert.equal(enrichment.location_area.precision,'place');
  assert.match(enrichment.location_area.evidence[0].excerpt,/Kent/i);
 }
});

test('GB place extraction does not turn county-only or office text into a town',async()=>{
 const bodies=[
  '<p>Vendor applications are open for our annual fair in Kent.</p>',
  '<p>Contact office: Maidstone, Kent. Vendor enquiries welcome.</p>'
 ];
 for(const body of bodies){
  const store=db({candidate_id:'gb',source_last_checked:'2026-09-30T06:00:00Z',
   canonical_url:'https://event.test/vendors',application_url:null,event_name:'Fair',
   organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
  const fetchProvider={async fetch(url){return {final_url:url,body};}};
  await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T06:01:00Z')});
  const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
  const enrichment=JSON.parse(stored.args[2]);
  if(/Contact office/i.test(body)) assert.equal(enrichment.location_area,null);
  else {
   assert.equal(enrichment.location_area.value,'Kent');
   assert.equal(enrichment.location_area.precision,'area');
  }
 }
});


test('location-bearing same-site links are prioritized ahead of generic contact links',async()=>{
 const store=db({candidate_id:'x',source_last_checked:'2026-09-30T08:00:00Z',canonical_url:'https://event.test/',application_url:null,event_name:'Fair',organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const fetched=[];
 const fetchProvider={async fetch(url){
  fetched.push(url);
  if(url==='https://event.test/')return {final_url:url,body:'<a href="/contact">Contact</a><a href="/vendors">Vendor application</a><a href="/visit">Plan your visit</a><a href="/venue">Venue & directions</a>'};
  if(url==='https://event.test/venue')return {final_url:url,body:'<p>Event venue: Maidstone Market Square</p>'};
  return {final_url:url,body:'<p>Vendor information</p>'};
 }};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 assert.deepEqual(fetched.slice(0,4),[
  'https://event.test/',
  'https://event.test/venue',
  'https://event.test/visit',
  'https://event.test/vendors'
 ]);
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location.value,'Maidstone Market Square');
});


test('JSON-LD Event location is retained as structured evidence',async()=>{
 const store=db({candidate_id:'jsonld',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/',application_url:null,event_name:'Autumn Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const body='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Autumn Fair","location":{"@type":"Place","name":"Mote Park","address":{"@type":"PostalAddress","addressLocality":"Maidstone","addressRegion":"Kent"}}}</script></head><body><p>Vendor applications are open.</p></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location.value,'Mote Park');
 assert.equal(enrichment.location.evidence[0].kind,'schema_event_location');
 assert.equal(enrichment.location_area.value,'Maidstone');
 assert.equal(enrichment.location_area.precision,'place');
 assert.equal(enrichment.location_area.evidence[0].kind,'schema_event_location');
});

test('non-Event JSON-LD addresses never become event locations',async()=>{
 const store=db({candidate_id:'org',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/',application_url:null,event_name:'Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const body='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Ltd","location":{"@type":"Place","name":"Head Office","address":{"addressLocality":"Maidstone","addressRegion":"Kent"}}}</script></head><body><p>Vendor applications are open.</p></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location,null);
 assert.equal(enrichment.location_area,null);
});


test('trusted locality hint must be freshly present in non-contact source text',async()=>{
 const store=db({candidate_id:'legacy-hint',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/apply',application_url:null,event_name:'Fireworks',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-NHANTS","region":"Northamptonshire","locality":"Northampton Racecourse, Northampton"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<p>Food vendor applications are open. Northampton Racecourse, Northampton is the site for this year.</p>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'Northampton Racecourse, Northampton');
 assert.equal(enrichment.location_area.precision,'place');
 assert.equal(enrichment.location_area.evidence[0].kind,'verified_location_hint');
});

test('trusted locality hint is not accepted from office or contact context',async()=>{
 const store=db({candidate_id:'legacy-hint-office',source_last_checked:'2026-09-30T08:00:00Z',
  canonical_url:'https://event.test/apply',application_url:null,event_name:'Fair',
  organiser:null,geography_json:'{"country_code":"GB","region_code":"GB-ENG-NHANTS","region":"Northamptonshire","locality":"Northampton Racecourse, Northampton"}'});
 const fetchProvider={async fetch(url){return {final_url:url,body:'<p>Vendor applications are open.</p><p>Contact office: Northampton Racecourse, Northampton.</p>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T08:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.notEqual(enrichment.location_area?.evidence?.[0]?.kind,'verified_location_hint');
});


test('GB enrichment rejects structured locations that contradict the discovery county',async()=>{
 const cases=[
  {
   id:'gb-us',
   region_code:'GB-ENG-DEVON',
   region:'Devon',
   body:'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","location":{"@type":"Place","name":"Devon Horse Show","address":{"addressLocality":"Devon","addressRegion":"PA"}}}</script><p>Vendor applications are open.</p>'
  },
  {
   id:'gb-wrong-county',
   region_code:'GB-ENG-DURHAM',
   region:'County Durham',
   body:'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","location":{"@type":"Place","name":"Melton Mowbray Market","address":{"addressLocality":"Melton Mowbray","addressRegion":"Leicestershire"}}}</script><p>Exhibitor applications are open.</p>'
  }
 ];
 for(const item of cases){
  const store=db({candidate_id:item.id,source_last_checked:'2026-09-30T09:00:00Z',
   canonical_url:'https://event.test/vendors',application_url:null,event_name:'Fair',organiser:null,
   geography_json:JSON.stringify({country_code:'GB',region_code:item.region_code,region:item.region})});
  const fetchProvider={async fetch(url){return {final_url:url,body:item.body};}};
  await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T09:01:00Z')});
  const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
  const enrichment=JSON.parse(stored.args[2]);
  assert.equal(enrichment.location,null,item.id);
  assert.equal(enrichment.location_area,null,item.id);
 }
});

test('GB enrichment retains structured locations that agree with the discovery county',async()=>{
 const store=db({candidate_id:'gb-kent-jsonld',source_last_checked:'2026-09-30T09:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Fair',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const body='<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","location":{"@type":"Place","name":"Mote Park","address":{"addressLocality":"Maidstone","addressRegion":"Kent"}}}</script><p>Vendor applications are open.</p>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T09:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location.value,'Mote Park');
 assert.equal(enrichment.location_area.value,'Maidstone');
});


test('GB place extraction preserves standalone location headings beside event content',async()=>{
 const cases=[
  {
   id:'stroud-heading',region_code:'GB-ENG-GLOS',region:'Gloucestershire',expected:'Stroud',
   body:'<html><body><h2>Stroud, Gloucestershire</h2><p>Apply to trade at the Stroud Festival of Food & Drink. Vendor applications are open.</p>'+('<p>Festival information and trader details for visitors and exhibitors.</p>'.repeat(20))+'</body></html>'
  },
  {
   id:'blenheim-heading',region_code:'GB-ENG-OXON',region:'Oxfordshire',expected:'Blenheim Palace',
   body:'<html><body><h2>Blenheim Palace, Oxfordshire, OX20 1UL</h2><p>Exhibitor application information for the annual flower show.</p>'+('<p>Show information for exhibitors and visitors.</p>'.repeat(20))+'</body></html>'
  }
 ];
 for(const item of cases){
  const store=db({candidate_id:item.id,source_last_checked:'2026-09-30T10:00:00Z',
   canonical_url:'https://event.test/vendors',application_url:null,event_name:'Festival',organiser:null,
   geography_json:JSON.stringify({country_code:'GB',region_code:item.region_code,region:item.region})});
  const fetchProvider={async fetch(url){return {final_url:url,body:item.body};}};
  await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T10:01:00Z')});
  const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
  const enrichment=JSON.parse(stored.args[2]);
  assert.equal(enrichment.location_area.value,item.expected,item.id);
  assert.equal(enrichment.location_area.precision,'place',item.id);
 }
});

test('line-preserving extraction still rejects registered-office place headings',async()=>{
 const store=db({candidate_id:'office-heading',source_last_checked:'2026-09-30T10:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Festival',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-ESSEX","region":"Essex"}'});
 const body='<html><body><p>Vendor applications are open for our annual festival.</p><div>Registered Office: Hornchurch, Essex, RM11 1JS</div></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T10:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('preserved search snippet can corroborate GB location without using the search query itself',async()=>{
 const store=db({
  candidate_id:'gb-search-evidence',
  source_last_checked:'2026-09-30T11:00:00Z',
  canonical_url:'https://event.test/vendors',
  application_url:null,
  event_name:'Autumn Fair',
  organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}',
  evidence_json:JSON.stringify([{
   kind:'search_result',
   source:'https://event.test/vendors',
   title:'Maidstone Autumn Fair',
   snippet:'Vendor applications are open for the Autumn Fair in Maidstone, Kent.',
   query:'Essex vendor applications'
  }])
 });
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are open.</p></body></html>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T11:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'Maidstone');
 assert.equal(enrichment.location_area.precision,'place');
 assert.equal(enrichment.location_area.evidence[0].source,'https://event.test/vendors');
 assert.match(enrichment.location_area.evidence[0].excerpt,/Maidstone, Kent/);
 assert.doesNotMatch(enrichment.location_area.evidence[0].excerpt,/Essex vendor applications/);
});

test('search query geography alone is never accepted as enrichment evidence',async()=>{
 const store=db({
  candidate_id:'gb-search-query-only',
  source_last_checked:'2026-09-30T11:00:00Z',
  canonical_url:'https://event.test/vendors',
  application_url:null,
  event_name:'Autumn Fair',
  organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}',
  evidence_json:JSON.stringify([{
   kind:'search_result',
   source:'https://event.test/vendors',
   title:'Autumn Fair vendor application',
   snippet:'Applications are open now.',
   query:'Maidstone Kent vendor applications'
  }])
 });
 const fetchProvider={async fetch(url){return {final_url:url,body:'<html><body><p>Vendor applications are open.</p></body></html>'};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T11:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('footer location text is not accepted as event location evidence',async()=>{
 const store=db({candidate_id:'footer-location',source_last_checked:'2026-09-30T11:30:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Festival',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-KENT","region":"Kent"}'});
 const body='<html><body><main><p>Vendor applications are open for our annual festival.</p></main><footer><p>Maidstone, Kent</p></footer></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T11:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('GB place extraction rejects another county name as a place on a multi-county page',async()=>{
 const store=db({candidate_id:'multi-county',source_last_checked:'2026-09-30T12:00:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Wedding Shows',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-BUCKS","region":"Buckinghamshire"}'});
 const body='<html><body><main><p>Vendor applications are open for wedding fairs across Hertfordshire, Buckinghamshire and surrounding areas.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T12:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.notEqual(enrichment.location_area?.value,'Hertfordshire');
});

test('GB event location heading becomes source-backed place evidence',async()=>{
 const store=db({candidate_id:'heading-place',source_last_checked:'2026-09-30T12:00:00Z',
  canonical_url:'https://event.test/',application_url:null,event_name:'Stroud Festival of Food & Drink',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-GLOS","region":"Gloucestershire"}'});
 const body='<html><body><main><h2>Stroud, Gloucestershire</h2><p>Vendor applications are open for the annual food festival.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T12:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'Stroud');
 assert.equal(enrichment.location_area.precision,'place');
 assert.equal(enrichment.location_area.evidence[0].kind,'event_page_location_heading');
});

test('GB location page may use a short place line, ordinary exhibitor pages may not',async()=>{
 const good=db({candidate_id:'where-page',source_last_checked:'2026-09-30T12:00:00Z',
  canonical_url:'https://market.test/where-to-find-us',application_url:null,event_name:'Meanwood Market',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-WEST-YORKS","region":"West Yorkshire"}'});
 const bad=db({candidate_id:'exhibitor-address',source_last_checked:'2026-09-30T12:00:00Z',
  canonical_url:'https://expo.test/exhibitor-list',application_url:null,event_name:'Beef Expo',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-STAFFS","region":"Staffordshire"}'});
 const providerGood={async fetch(url){return {final_url:url,body:'<html><body><main><h1>Meanwood Market</h1><p>Vendor applications are open.</p><p>Meanwood, Leeds, West Yorkshire</p></main></body></html>'};}};
 const providerBad={async fetch(url){return {final_url:url,body:'<html><body><main><h1>Exhibitor List</h1><p>Exhibitor applications are open.</p><p>AgriWebb, Stafford, Staffordshire</p></main></body></html>'};}};
 await runEnrichmentBatch(good,{fetchProvider:providerGood,limit:1,now:new Date('2026-09-30T12:01:00Z')});
 await runEnrichmentBatch(bad,{fetchProvider:providerBad,limit:1,now:new Date('2026-09-30T12:01:00Z')});
 const goodEnrichment=JSON.parse(good.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql)).args[2]);
 const badEnrichment=JSON.parse(bad.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql)).args[2]);
 assert.equal(goodEnrichment.location_area.value,'Meanwood');
 assert.equal(goodEnrichment.location_area.evidence[0].kind,'event_location_page');
 assert.equal(badEnrichment.location_area,null);
});


test('GB enrichment fails closed when fetched source proves a US city/state despite matching county name',async()=>{
 const store=db({candidate_id:'lincolnshire-il',source_last_checked:'2026-09-30T12:30:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Lincolnshire Art Festival',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-LINCS","region":"Lincolnshire"}'});
 const body='<html><body><main><h1>Lincolnshire Art Festival</h1><p>Food vendor applications are open.</p><p>Join us at the Marriott Resort in Lincolnshire, IL.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T12:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location,null);
 assert.equal(enrichment.location_area,null);
});

test('GB enrichment fails closed when source only supports a different UK region',async()=>{
 const store=db({candidate_id:'wrong-uk-region',source_last_checked:'2026-09-30T12:30:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Beef Expo',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-DURHAM","region":"County Durham"}'});
 const body='<html><body><main><h1>Beef Expo</h1><p>Exhibitor applications are open for the event at Melton Mowbray in Leicestershire.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T12:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location,null);
 assert.equal(enrichment.location_area,null);
});

test('legacy geography region code is normalized to canonical region name before area evidence is stored',async()=>{
 const store=db({candidate_id:'legacy-region-code',source_last_checked:'2026-09-30T12:30:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'London Festival',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-LONDON","region":"GB-ENG-LONDON"}'});
 const body='<html><body><main><p>Vendor applications are open for the London Festival.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T12:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'London');
 assert.equal(enrichment.location_area.precision,'area');
});


test('police or authority contact lines are never used as event area evidence',async()=>{
 const store=db({candidate_id:'police-contact',source_last_checked:'2026-09-30T13:00:00Z',
  canonical_url:'https://event.test/terms',application_url:null,event_name:'Highclere Show',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-NHANTS","region":"GB-ENG-NHANTS"}'});
 const body='<html><body><main><p>Highclere Show: Northamptonshire Police Tel: 101, Ext:341035</p><p>Trader applications are managed separately.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T13:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('police and policy contact context is not accepted as GB location evidence',async()=>{
 const store=db({candidate_id:'policy-police',source_last_checked:'2026-09-30T13:00:00Z',
  canonical_url:'https://highclereshow.test/terms-conditions/',application_url:null,event_name:'Highclere Show',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-NHANTS","region":"Northamptonshire"}'});
 const body='<html><body><main><h1>Terms & Conditions</h1><p>Highclere Show: Northamptonshire Police Tel: 101, Ext:341035</p><p>Trader applications are subject to these terms and conditions.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T13:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area,null);
});


test('GB place extraction never promotes label words like Where as a place',async()=>{
 const store=db({candidate_id:'where-label',source_last_checked:'2026-09-30T14:00:00Z',
  canonical_url:'https://event.test/where',application_url:null,event_name:'Market',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-NOTTS","region":"Nottinghamshire"}'});
 const body='<html><body><main><p>Vendor applications are open.</p><p>Where: Nottinghamshire</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T14:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.notEqual(enrichment.location_area?.value,'Where');
});


test('GB enrichment can recover a place from event metadata description',async()=>{
 const store=db({candidate_id:'mold-meta',source_last_checked:'2026-09-30T15:00:00Z',
  canonical_url:'https://festival.test/vendors',application_url:null,event_name:'Mold Food Festival',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-WLS","region":"Wales"}'});
 const body='<html><head><meta name="description" content="Trader applications are open for Mold Food Festival in Mold, Wales."></head><body><main><p>Apply to exhibit at the festival.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T15:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location_area.value,'Mold');
 assert.equal(enrichment.location_area.precision,'place');
 assert.match(enrichment.location_area.evidence[0].excerpt,/Mold, Wales/);
});


test('location-page fallback ignores late organiser contact addresses',async()=>{
 const store=db({candidate_id:'hylands-contact-address',source_last_checked:'2026-09-30T15:00:00Z',
  canonical_url:'https://dogshow.test/location/hylands-park/',application_url:null,event_name:'All About Dogs Show',organiser:null,
  geography_json:'{"country_code":"GB","region_code":"GB-ENG-ESSEX","region":"Essex"}'});
 const filler=Array.from({length:12},(_,i)=>'<p>Event information section '+i+' for visitors and exhibitors.</p>').join('');
 const body='<html><body><main><h1>Hylands Park</h1><p>Vendor applications are open for the dog show.</p>'+filler+'<p>98 Hornchurch Rd, Hornchurch, Essex, RM11 1JS</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T15:01:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.notEqual(enrichment.location_area?.value,'Hornchurch');
});


test('US enrichment fails closed when source proves a different state code',async()=>{
 const store=db({
  candidate_id:'us-wrong-state-docx',
  source_last_checked:'2026-09-30T20:20:00Z',
  canonical_url:'https://washingtoncountyfair.test/vendors',
  application_url:'https://washingtoncountyfair.test/2026-vendor.docx',
  event_name:'Washington County Fair',
  organiser:null,
  geography_json:'{"country_code":"US","region_code":"WA","region":"Washington"}'
 });
 const fetchProvider={async fetch(url){
  if(url.endsWith('.docx')) return {final_url:url,body:'Commercial Vendor Application\nFairgrounds: 12300 40th St N, Stillwater, MN 55082\nVendor applications are open.'};
  return {final_url:url,body:'<html><body><main><p>Vendor applications are open.</p></main></body></html>'};
 }};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T20:21:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.location,null);
 assert.equal(enrichment.location_area,null);
});


test('enrichment captures plain Deadline labels and uses final event date in a date span',async()=>{
 const store=db({candidate_id:'eventeny-dates',source_last_checked:'2026-09-30T20:30:00Z',
  canonical_url:'https://event.test/vendor',application_url:null,event_name:'County Fair',organiser:null,
  geography_json:'{"country_code":"US","region_code":"ID","region":"Idaho"}'});
 const body='<html><body><main><h1>2026 County Fair</h1><p>Vendor applications are open.</p><p>Deadline: Apr 15, 2026 11:59 pm</p><p>Date: Sep 24, 2026 10:00 am - Sep 27, 2026 3:00 pm</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T20:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.application_deadline.value,'Apr 15, 2026');
 assert.equal(enrichment.event_start.value,'Sep 27, 2026');
});

test('enrichment captures applications not accepted after and compact multi-day ranges',async()=>{
 const store=db({candidate_id:'compact-range',source_last_checked:'2026-09-30T20:30:00Z',
  canonical_url:'https://event.test/vendors',application_url:null,event_name:'Balloonfest',organiser:null,
  geography_json:'{"country_code":"US","region_code":"MI","region":"Michigan"}'});
 const body='<html><body><main><h1>2026 Balloonfest</h1><p>Vendor applications will not be accepted after June 10, 2026.</p><p>Michigan Challenge Balloonfest June 26-28, 2026.</p></main></body></html>';
 const fetchProvider={async fetch(url){return {final_url:url,body};}};
 await runEnrichmentBatch(store,{fetchProvider,limit:1,now:new Date('2026-09-30T20:31:00Z')});
 const stored=store.writes.find(x=>/INSERT INTO candidate_enrichment/.test(x.sql));
 const enrichment=JSON.parse(stored.args[2]);
 assert.equal(enrichment.application_deadline.value,'June 10, 2026');
 assert.equal(enrichment.event_start.value,'June 28, 2026');
});
