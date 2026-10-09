import test from 'node:test';
import assert from 'node:assert/strict';
import {mk1ProofRecord} from '../../operations/findpitches-v3/harvest-mk1-proof.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';
import {NOW} from './helpers.mjs';
import {database} from './helpers.mjs';
import {importMk1Source} from '../../platform/findpitches-v3/mk1-source.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';

async function input() {
  const document=documentFixture({event:{location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'York',addressRegion:'North Yorkshire',addressCountry:'GB'}}}});document.content_hash=await hash(document.html);
  return {market:'GB',document,original:{id:'mk1-example',event_name:'Unsafe historical title',location:'Query City',event_start:'2099-01-01',application_state:'CLOSED',publishable:true,application_url:document.requested_url},gitRef:'a'.repeat(40),snapshotHash:'b'.repeat(64),now:NOW};
}
test('Mk1 harvest uses current proved facts and retains historical fields only as immutable provenance',async()=>{
  const args=await input(),before=JSON.stringify(args.original),{record}=await mk1ProofRecord(args);
  assert.notEqual(record.event_name,args.original.event_name);assert.notEqual(record.location,'Query City');assert.notEqual(record.event_start,'2099-01-01');assert.equal(record.application_state,'OPEN_NOW');
  assert.equal(record.publication_eligible,false);assert.equal(record.provenance[0].discovery_origin,'legacy_mk1');assert.deepEqual(record.provenance[0].original_fields,args.original);assert.equal(JSON.stringify(args.original),before);
});
test('Mk1 country conflicts and closed applications cannot supply ready imports',async()=>{
  const args=await input(),foreign=documentFixture();foreign.content_hash=await hash(foreign.html);
  assert.deepEqual((await mk1ProofRecord({...args,document:foreign})).reasons,['source_country_market_mismatch']);
  const document=documentFixture({body:'<p>Applications closed</p>'});document.content_hash=await hash(document.html);
  assert.equal((await mk1ProofRecord({...args,document})).record,undefined);
});
test('Mk1 import requires immutable Git and original-document custody',async()=>{
  const args=await input();await assert.rejects(mk1ProofRecord({...args,gitRef:'main'}),/git_custody/);
  await assert.rejects(mk1ProofRecord({...args,document:{...args.document,content_hash:'0'.repeat(64)}}),/document_custody/);
  await assert.rejects(mk1ProofRecord({...args,document:{...args.document,requested_url:'https://unrelated.example.org/event'}}),/document_custody/);
});

test('Mk1 native import fetches its own proof, requires operator access and paused shadow guards, and replays idempotently',async t=>{
  const db=database(t),args=await input();
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','mk1-test',?)",NOW).run();
  for(const market of ['US','CA'])await assert.rejects(importMk1Source(db,{...args,market},{now:NOW,fetcher:()=>{throw Error('out-of-scope input must stop before fetch');}}),/mk1_uk_only_required/);
  const closed=documentFixture({body:'<p>Applications closed</p>'}),fetcher=async()=>new Response(args.document.html,{headers:{'Content-Type':'text/html'}});
  const held=await importMk1Source(db,args,{now:NOW,fetcher:async()=>new Response(closed.html,{headers:{'Content-Type':'text/html'}})});
  assert.equal(held.status,'held','supplied open HTML cannot override actual fetched closure');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);
  const result=await importMk1Source(db,args,{now:NOW,fetcher});assert.equal(result.readiness,'ready');
  const before=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
  const replay=await importMk1Source(db,args,{now:NOW,fetcher});assert.equal(replay.duplicate,true);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,before);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
  const env={FINDPITCHES_V3_DB:db,V3_ROLE:'enrichment',V3_OPERATOR_TOKEN:'mk1-operator-fixture-long-token',V3_INGEST_TOKEN:'mk1-ingest-fixture-long-token'};
  const response=await worker.fetch(new Request('https://shadow.test/mk1/verify-import',{method:'POST',headers:{Authorization:'Bearer '+env.V3_INGEST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args)}),env);
  assert.equal(response.status,401);
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=0').run();
  await assert.rejects(importMk1Source(db,args,{now:NOW,fetcher:()=>{throw Error('guard must stop fetch');}}),/shadow_preservation_guard/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
});
