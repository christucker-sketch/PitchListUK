import test from 'node:test';import assert from 'node:assert/strict';
import {catalogueScope,scopeParams,scopeFromParams,scopeMatches} from '../../platform/findpitches-v3/catalogue-scope.mjs';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {readCatalogue,search,inventory,allRegions} from '../../platform/findpitches-v3/customer-catalogue.mjs';
const id='ent_'+'1'.repeat(32),other='ent_'+'2'.repeat(32);
test('private scope validates canonical IDs, deduplicates batches and forbids ambiguous/unsafe filters',()=>{
 for(const options of [{},{market:'GB'},{detailId:id},{ids:[]},{ids:[other,id,id]}]){const scope=catalogueScope(options);assert.deepEqual(scopeFromParams(scopeParams(scope)),scope);}
 assert.deepEqual(catalogueScope({ids:[other,id,id]}),{kind:'ids',ids:[id,other]});
 for(const options of [{market:'GB',detailId:id},{ids:[],market:'US'},{market:"US' OR 1=1"},{detailId:'unsafe'},{ids:['unsafe']},{ids:Array(101).fill(id)}])assert.throws(()=>catalogueScope(options),/scope_invalid/);
 for(const value of ['null','{}','not JSON'])assert.throws(()=>scopeFromParams(new URLSearchParams({ids:value})),/scope_invalid/);
 assert.equal(scopeMatches(undefined,{kind:'market',market:'GB'}),true);assert.equal(scopeMatches({kind:'full'},{kind:'ids',ids:[]}),true);
 assert.equal(scopeMatches({kind:'market',market:'GB'},{kind:'full'}),false);assert.equal(scopeMatches({kind:'market',market:'US'},{kind:'market',market:'GB'}),false);
});
async function fixture(t){
 const db=database(t),items=[];
 for(let i=1;i<=3;i++){
  const country=i===3?'GB':'US',url='https://www.eventeny.com/events/vendor/?id='+i,location=country==='GB'?'Kent Hall, 1 High Street, Canterbury, Kent':'River Hall, 1 River Street, Austin, Texas';
  const input=record({opportunity_id:'scope-'+i,country_code:country,event_name:'Scope Festival '+i,location,canonical_url:url,application_url:url});
  const {entity}=await seed(db,input,{environment:'shadow'});
  await recordVerification(db,entity.id,documentFixture({url,event:{name:input.event_name,location:{name:country==='GB'?'Kent Hall':'River Hall',address:{streetAddress:country==='GB'?'1 High Street':'1 River Street',addressLocality:country==='GB'?'Canterbury':'Austin',addressRegion:country==='GB'?'Kent':'Texas',addressCountry:country}}}}),{now:NOW});
  await evaluateReadiness(db,entity.id,{now:NOW});items.push({entity,input});
 }
 assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,3);return {db,items};
}
const client=(db)=>({V3_STAGING_TOKEN:'fixture',V3_READY_API:{fetch:async url=>Response.json(await stagingCatalogue(db,{now:NOW,scope:scopeFromParams(new URL(url).searchParams)}))}});
test('market and batch reads are exact subsets; query market cannot become proved geography',async t=>{
 const {db,items}=await fixture(t),env=client(db),full=await readCatalogue(env,NOW),source=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 for(const market of ['US','GB']){
  const limited=await readCatalogue(env,NOW,{market});assert.deepEqual(limited.rows,full.rows.filter(r=>r.market===market));
  assert.deepEqual(search(limited.rows,{market,sort:'soonest'},{tier:'free'},NOW),search(full.rows,{market,sort:'soonest'},{tier:'free'},NOW));
  assert.deepEqual(inventory(limited.rows,market,[],NOW),inventory(full.rows,market,[],NOW));
 }
 const ids=[items[0].entity.id,items[2].entity.id],batch=await readCatalogue(env,NOW,{ids});assert.deepEqual(batch.rows,full.rows.filter(r=>ids.includes(r.id)));
 assert.equal((await readCatalogue(env,NOW,{ids:[]})).rows.length,0);
 // An original country/identity is never supplied by the requested market.
 assert.equal((await readCatalogue(env,NOW,{market:'GB'})).rows.some(r=>r.id===items[0].entity.id),false);
 assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,source);
});
test('detail read retains complete current target country, preserving the related-listing pool',async t=>{
 const {db,items}=await fixture(t),env=client(db),all=await readCatalogue(env,NOW);
 const detail=await readCatalogue(env,NOW,{detailId:items[0].entity.id});assert.deepEqual(detail.rows,all.rows.filter(r=>r.market==='US'));assert.equal(detail.rows.length,2);
 assert.equal((await readCatalogue(env,NOW,{detailId:id})).rows.length,0);
});
test('scoped policy keeps latest LOW/held clock semantics and expiry; no stale fallback',async t=>{
 const {db,items}=await fixture(t),target=items[0],later='2026-10-06T12:02:00.000Z';
 const receipt=await ingestRecords(db,[{...target.input,last_checked:'2026-10-06T12:01:00.000Z',confidence:{level:'LOW'}}],{environment:'shadow',now:later});await sql(db,'INSERT INTO entity_records VALUES (?,?)',receipt.record_ids[0],target.entity.id).run();
 const full=await stagingCatalogue(db,{now:later}),scope=catalogueScope({market:'US'}),limited=await stagingCatalogue(db,{now:later,scope});assert.deepEqual(limited.items,full.items.filter(r=>r.country==='US'));assert.equal(limited.items.some(r=>r.id===target.entity.id),false);
 assert.equal((await stagingCatalogue(db,{now:'2026-10-08T12:00:00.000Z',scope})).items.length,0);
 const env=client(db);env.V3_READY_API.fetch=()=>{throw Error('backend_down');};await assert.rejects(readCatalogue(env,later,{market:'US'}),/backend_down/);
});
test('unexpected partial snapshots, mismatched content and invalid private metadata fail closed',async()=>{
 const proof={id,country:'US',title:'River Festival',organiser:'River Association',location:'Austin, Texas',event_start:'2026-11-03',event_end:'2026-11-04',application_url:'https://organiser.example.org/apply',application_state:'OPEN_NOW',verified_at:NOW,proof_expires_at:'2026-10-07T12:00:00.000Z',entity_revision:1,verification_id:1};
 const snapshot=scope=>({schema:'findpitches-v3-customer-proof-snapshot-v1',scope,as_of:NOW,publication_enabled:false,production_cutover_enabled:false,items:[proof]});
 for(const [actual,requested] of [[{kind:'market',market:'US'},{}],[{kind:'market',market:'US'},{market:'GB'}],[{kind:'market',market:'GB'},{market:'GB'}],[{kind:'ids',ids:[other]},{ids:[other]}],[null,{}]]){
  const env={V3_STAGING_TOKEN:'fixture',V3_READY_API:{fetch:async()=>Response.json(snapshot(actual))}};await assert.rejects(readCatalogue(env,NOW,requested),/service_unavailable/);
 }
 const legacy={V3_STAGING_TOKEN:'fixture',V3_READY_API:{fetch:async()=>Response.json(snapshot(undefined))}};assert.equal((await readCatalogue(legacy,NOW,{market:'GB'})).rows.length,1); // safe global old-source fallback, caller still filters country
});

test('scoped policy materializes current winners before entity filtering and preserves exact winners',async t=>{
 const {structuredPolicyRead,LATEST_STRUCTURED_POLICY_SQL}=await import('../../platform/findpitches-v3/staging.mjs'),{db}=await fixture(t),scope=catalogueScope({market:'GB'}),{query,values}=structuredPolicyRead(scope);
 const expected=(await sql(db,LATEST_STRUCTURED_POLICY_SQL).all()).results.filter(row=>db.sqlite.prepare('SELECT market FROM entities WHERE id=?').get(row.entity_id).market==='GB');
 assert.deepEqual((await sql(db,query,...values).all()).results,expected);
 const plan=(await sql(db,'EXPLAIN QUERY PLAN '+query,...values).all()).results.map(r=>r.detail);
 assert.ok(plan.some(s=>s==='MATERIALIZE current_policy'),JSON.stringify(plan));
 assert.ok(plan.some(s=>/SEARCH er USING INDEX sqlite_autoindex_entity_records_1 \(record_id=\?\)/.test(s)),JSON.stringify(plan));
});
