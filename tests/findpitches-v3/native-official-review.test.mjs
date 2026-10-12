import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {documents,fetcherFor} from './cca-fixture.mjs';import {NOW,record} from './helpers.mjs';
import {ingestRecords,loadEntity,sql} from '../../platform/findpitches-v3/store.mjs';import {reconcileRecord} from '../../platform/findpitches-v3/pipeline.mjs';
import {startUKRun,discoverUKSource,importUKCandidate} from '../../platform/findpitches-v3/uk-store.mjs';import {CCA_BOOKING} from '../../platform/findpitches-v3/creative-crafts.mjs';import {reviewOfficialCandidate} from '../../platform/findpitches-v3/official-source-review.mjs';
const require=createRequire(new URL('../../operations/findpitches-v3/package.json',import.meta.url));
test('native D1 commits the reviewed official proof, equal-authority supersessions and original candidate custody atomically',{timeout:180000},async t=>{
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler'),mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'review',modules:true,script:'export default {fetch(){return new Response("local fixture");}}',compatibilityDate:'2026-06-01',d1Databases:{DB:'review-fixture'}}]}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB','review'),dir=new URL('../../operations/findpitches-v3/migrations/',import.meta.url);
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())for(const query of unstable_splitSqlQuery(fs.readFileSync(new URL(name,dir),'utf8')))await db.prepare(query).run();
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','native_review_fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  const old=record({opportunity_id:'native-cca-review',country_code:'GB',event_name:'Pumpkin Festival Lowther Gardens Lytham.',organiser:'UKCraftFairs.com',location:'Lowther Gardens, Lytham St Annes, Lancashire',event_start:'2026-10-24',event_end:'2026-10-25',source_platform:'ukcraftfairs',source_identifier:null,application_state:'ENQUIRY_AVAILABLE',canonical_url:'https://www.ukcraftfairs.com/craft-events/26556/x',application_url:'https://www.ukcraftfairs.com/craft-events/26556/x'});
  const imported=await ingestRecords(db,[old],{producer:'independent-structured',environment:'shadow',now:NOW}),decision=await reconcileRecord(db,imported.record_ids[0],{now:NOW}),fetcher=fetcherFor(documents()),run=await startUKRun(db,{max_visits:6},NOW),discovery=await discoverUKSource(db,{run_id:run.id,url:CCA_BOOKING},{fetcher,now:NOW}),candidate=discovery.candidates.find(c=>c.date==='2026-10-24');
  assert.equal((await importUKCandidate(db,candidate.id,{fetcher,now:NOW})).status,'held');
  const reviewRun=await startUKRun(db,{max_visits:10,max_candidates:1},NOW),entity=await loadEntity(db,decision.entity_id);
  const result=await reviewOfficialCandidate(db,{run_id:reviewRun.id,candidate_id:candidate.id,entity_id:entity.id,expected_revision:entity.revision,reason:'Native D1 review confirms exact named venue, edition and full dates against independent official current trader booking proof.'},{fetcher,now:NOW});
  assert.equal(result.readiness,'ready');assert.equal((await loadEntity(db,entity.id)).organiser,'Creative Crafts Association');
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM official_source_review_outcomes').first()).n,1);assert.equal((await sql(db,'SELECT entity_id FROM uk_source_progress WHERE candidate_id=?',candidate.id).first()).entity_id,null);
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,1);
});
