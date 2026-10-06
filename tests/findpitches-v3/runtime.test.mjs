import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runPreservationControl } from '../../operations/findpitches-v3/control.mjs';
import { record,NOW } from './helpers.mjs';
import {acquireCity} from '../../platform/findpitches-v3/acquisition.mjs';
import {legacyRecord,fieldEvidence} from '../../platform/findpitches-v3/legacy.mjs';
import {startPilot,schedulePilotRun} from '../../platform/findpitches-v3/pilot.mjs';
import {reserveSerperQuery,budgetDay} from '../../platform/findpitches-v3/serper-usage.mjs';

const require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):new URL('../../operations/findpitches-v3/package.json',import.meta.url));
test('real workerd D1 executes all migrations, preservation control and native queue stage chain',{timeout:360000},async t=>{
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{buildSync}=require('esbuild'),{unstable_splitSqlQuery}=require('wrangler');
  const root=filePath(new URL('../../',import.meta.url)),script=buildSync({entryPoints:[path.join(root,'platform/findpitches-v3/worker.mjs')],bundle:true,format:'esm',platform:'browser',write:false}).outputFiles[0].text;
  const token='local-runtime-test-token-at-least-24-chars';
  const roles=['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'];
  const workers=roles.map(role=>{
    const c=JSON.parse(fs.readFileSync(path.join(root,'operations/findpitches-v3/cloudflare',role+'.jsonc'),'utf8'));
    return {name:role,modules:true,script,compatibilityDate:c.compatibility_date,bindings:{...c.vars,V3_INGEST_TOKEN:token,V3_OPERATOR_TOKEN:token},d1Databases:{FINDPITCHES_V3_DB:'v3-runtime-test'},
      queueProducers:Object.fromEntries((c.queues?.producers??[]).map(q=>[q.binding,q.queue])),
      queueConsumers:Object.fromEntries((c.queues?.consumers??[]).map(q=>[q.queue,{maxBatchSize:q.max_batch_size,maxBatchTimeout:0,maxRetries:1,deadLetterQueue:q.dead_letter_queue}]))};
  });
  const mf=new Miniflare(convertV4MiniflareOptions({workers}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('FINDPITCHES_V3_DB','api');
  for(const name of fs.readdirSync(path.join(root,'operations/findpitches-v3/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
    const migration=fs.readFileSync(path.join(root,'operations/findpitches-v3/migrations',name),'utf8');
    for(const query of unstable_splitSqlQuery(migration))await db.prepare(query).run();
  }
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/findpitches-v3/fixtures/structured-control-100.json'),'utf8'));
  const control=await runPreservationControl(db,fixture.records,{progress:message=>console.log('Native D1:',message)});assert.equal(control.destructive_mutations,0);assert.equal(control.replay_new_entities,0);
  const ingest=await mf.getWorker('ingest'),api=await mf.getWorker('api');
  const imported=await ingest.fetch('https://example.test/imports',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({records:[record({opportunity_id:'native-queue',application_url:'https://www.eventeny.com/events/vendor/?id=88888',canonical_url:'https://www.eventeny.com/events/vendor/?id=88888'})]})});
  assert.equal(imported.status,202,await imported.clone().text());
  const deadline=Date.now()+20000;let row;
  do {row=await db.prepare("SELECT e.id FROM entities e JOIN readiness r ON r.entity_id=e.id WHERE e.environment='shadow'").first();if(!row)await new Promise(resolve=>setTimeout(resolve,100));}while(!row&&Date.now()<deadline);
  assert.ok(row,'Native queue delivery must finish the shadow pipeline');
  const response=await api.fetch('https://example.test/shadow',{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);assert.ok((await response.json()).items.some(r=>r.id===row.id));
  assert.equal((await api.fetch('https://example.test/v1/opportunities')).status,403);
  const legacyFields={event_name:'Native River Arts Festival',canonical_url:'https://example.org/native-festival',application_state:'UNKNOWN',lifecycle_state:'WATCH'};
  const recovered=legacyRecord({id:'native-legacy',market:'US',fields:legacyFields,fieldEvidence:fieldEvidence(legacyFields,{kind:'retained_excerpt',source:legacyFields.canonical_url,excerpt:'Native River Arts Festival vendors apply for stalls'}),evidence:[],provenance:[],lastChecked:NOW});
  const legacyBody={run:{id:'legacy_'+'a'.repeat(64),snapshot_hash:'a'.repeat(64),source_counts:{candidates:1},total_opportunities:1},entries:[{id:'native-legacy',references:[{table:'candidates',id:'old-native'}],category:'retained_evidence',reason:'recorded_source_excerpt',record:recovered,field_audit:{totals:{}},refetch_attempts:0}]};
  const legacyResponse=await ingest.fetch('https://example.test/legacy/import',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(legacyBody)});
  assert.equal(legacyResponse.status,202,await legacyResponse.clone().text());
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM legacy_recovery_claims').first()).count,1);
  await db.prepare('UPDATE serper_policy SET bulk_enabled=1,max_queries_per_day=2,max_credits_per_day=2 WHERE id=1').run();
  // Native HTTP status uses the live Worker clock; reserve against that same day.
  const budgetNow=new Date().toISOString();
  let calls=0;const fetcher=async()=>{calls++;return Response.json({credits:1,organic:[]});};
  const budgetResults=await Promise.allSettled(Array.from({length:4},(_,i)=>acquireCity(db,{city:'austin-tx',query_limit:1},{V3_CITY_ENABLED:'true',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'local-recorded-provider-test-key'},{fetcher,now:budgetNow,runId:'native-budget-'+i})));
  assert.equal(budgetResults.filter(r=>r.status==='fulfilled').length,2,JSON.stringify(budgetResults.map(r=>r.status==='rejected'?r.reason.message:r.status)));assert.equal(calls,2);
  const stateResponse=await api.fetch('https://example.test/status');assert.equal(stateResponse.status,200);
  const budgetState=(await stateResponse.json()).serper;
  assert.equal(budgetState.usage.day_queries_attempted,2);assert.equal(budgetState.paused,true);assert.equal(budgetState.remaining.daily_queries,0);
  await db.prepare('UPDATE serper_policy SET bulk_enabled=0 WHERE id=1').run();
  await db.prepare('UPDATE serper_policy SET max_queries_per_day=1000,max_credits_per_day=1000,pause_until=NULL,pause_reason=NULL WHERE id=1').run();
  const pilot=await startPilot(db,{max_queries:2,daily_ceiling:4},budgetNow),grant=await schedulePilotRun(db,pilot.id,budgetNow);
  await db.prepare("UPDATE pilot_run_grants SET status='running' WHERE run_id=?").bind(grant.run_id).run();
  await db.prepare("INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,?,?,2,'reserved',?,?)").bind(grant.run_id,grant.city,budgetDay(budgetNow),budgetNow,budgetNow).run();
  const pilotReservations=await Promise.allSettled(Array.from({length:6},(_,index)=>reserveSerperQuery(db,{runId:grant.run_id,index,query:'native-pilot-'+index,market:'GB',region:'GB-ENG',now:budgetNow,pilotId:pilot.id})));
  assert.equal(pilotReservations.filter(r=>r.status==='fulfilled').length,2,'Native D1 must enforce the lower pilot ceiling atomically');
  const nativeState=await api.fetch('https://example.test/status');
  assert.equal((await nativeState.json()).controlled_pilot.sessions[0].metrics.reserved,2);
  assert.equal(calls,2,'Pilot budget verification does not make provider calls');
  console.log('Native D1 budget reservations: two recorded calls, concurrent overflow blocked.');
  console.log('Real D1/workerd control:' ,JSON.stringify({...control,record_ids:undefined}));
});
function filePath(url){return decodeURIComponent(url.pathname);}
