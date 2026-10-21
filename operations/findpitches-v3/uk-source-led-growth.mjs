// Explicit bounded official-source operator run. No schedule or paid discovery.
// Raw snapshots/custody stay in the caller's private output directory.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {shadowContext} from './shadow-context.mjs';
import {CJS_EVENTS,CJS_ORIGIN,cjsEventURL} from '../../platform/findpitches-v3/cjs-events.mjs';
import {customerInventoryFunnel} from '../../platform/findpitches-v3/inventory-funnel.mjs';
import {stableJson} from '../../platform/findpitches-v3/contract.mjs';
const digest=r=>createHash('sha256').update(stableJson(r)).digest('hex');
export async function ukSourceCustody(db,ids){
 const queries={facts:'SELECT DISTINCT f.* FROM source_facts f JOIN entity_facts ef ON ef.fact_id=f.id WHERE ef.entity_id IN (SELECT value FROM json_each(?))',records:'SELECT p.* FROM producer_records p JOIN entity_records er ON er.record_id=p.id WHERE er.entity_id IN (SELECT value FROM json_each(?))',identity_keys:'SELECT * FROM identity_keys WHERE entity_id IN (SELECT value FROM json_each(?))',entities:'SELECT id,market,edition,environment,shadow_only,promotion_eligible,publication_eligible FROM entities WHERE id IN (SELECT value FROM json_each(?))'};
 const out={};for(const [name,q]of Object.entries(queries)){const rows=(await db.prepare(q).bind(JSON.stringify(ids)).all()).results;out[name]=Object.fromEntries(rows.map(r=>[r.id??stableJson(r),digest(r)]));}return out;
}
export function changedCustody(before,after){return Object.fromEntries(Object.entries(before).map(([name,rows])=>[name,Object.entries(rows).filter(([id,h])=>after[name]?.[id]!==h).length]));}
async function guard(db,now){
 const r=await db.prepare(`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) publication,(SELECT bulk_enabled FROM serper_policy WHERE id=1) bulk,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) paid_paused,(SELECT COUNT(*) FROM customer_projections) customer_rows,(SELECT COUNT(*) FROM publication_queue) publication_rows,(SELECT COUNT(*) FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?) due_jobs`).bind(now).first();
 if(r.publication||r.bulk||r.paid_paused!==1||r.customer_rows||r.publication_rows)throw Error('uk_free_source_scope_required');if(r.due_jobs>40)throw Error('uk_verification_backlog');return r;
}
export async function runUKSourceLedGrowth({credentialsFile,stateDirectory,outDirectory,eventURLs,maxVisits=125,maxEvents=60}){
 if(!Array.isArray(eventURLs)||eventURLs.length<1||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>100||eventURLs.length>maxEvents||new Set(eventURLs).size!==eventURLs.length||eventURLs.some(u=>!cjsEventURL(u))||!Number.isInteger(maxVisits)||maxVisits<1||maxVisits>200)throw Error('bounded_official_source_inputs_required');
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const save=(name,value)=>fs.writeFileSync(path.join(outDirectory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600}),c=await shadowContext({credentialsFile,stateDirectory});
 const before=await c.catalogue(),existing=(await c.db.prepare("SELECT DISTINCT e.id FROM entities e JOIN selected_facts f ON f.entity_id=e.id WHERE e.environment='shadow' AND e.market='GB' AND f.field_name='canonical_url' AND f.value_json LIKE ?").bind('%cjseventswarwickshire.co.uk%').all()).results.map(r=>r.id),custody=await ukSourceCustody(c.db,existing);save('before-catalogue-private.json',before);save('before-custody-private.json',custody);
 await guard(c.db,new Date().toISOString());const run=await c.call('enrichment','/uk/start',{max_visits:maxVisits,max_candidates:maxEvents});save('run-private.json',run);const outcomes=[],discoveries=[];let stop='bounded_programme_complete',error=null;
 try{
  for(let start=0;start<eventURLs.length;start+=10){
   await guard(c.db,new Date().toISOString());const discovery=await c.call('enrichment','/uk/discover',{run_id:run.id,url:CJS_EVENTS,event_urls:eventURLs.slice(start,start+10)});discoveries.push(discovery);save('discoveries-private.json',discoveries);
   for(const candidate of discovery.candidates??[]){if(candidate.status==='held'){outcomes.push({candidate_id:candidate.id,status:'held',reason:candidate.reason});continue;}let outcome;
    try{outcome=await c.call('enrichment','/uk/import',{candidate_id:candidate.id});}catch(e){const durable=await c.db.prepare('SELECT status,reason,entity_id,identity_outcome FROM uk_source_progress WHERE candidate_id=?').bind(candidate.id).first();if(durable?.status!=='imported')throw e;outcome={candidate_id:candidate.id,...durable,readiness:durable.reason,recovered_committed_response:true};}
    outcomes.push(outcome);save('outcomes-private.json',outcomes);if(outcome.status==='failed')throw Error('uk_custody_requires_review');
   }
   const snapshot=await c.catalogue(),sourceReady=snapshot.items.filter(r=>r.source_domain===new URL(CJS_ORIGIN).hostname.replace(/^www\./,''));save('latest-catalogue-private.json',snapshot);
   const compared=changedCustody(custody,await ukSourceCustody(c.db,existing));if(Object.values(compared).some(Boolean))throw Error('uk_source_integrity_failure');
   const runIds=new Set(outcomes.map(r=>r.entity_id)),previousIds=new Set(before.items.map(r=>r.id)),gained=sourceReady.filter(r=>runIds.has(r.id)&&!previousIds.has(r.id)).length;
   await guard(c.db,new Date().toISOString());console.log(JSON.stringify({events_requested:Math.min(start+10,eventURLs.length),outcomes:outcomes.length,source_customer_ready:sourceReady.length,run_customer_ready_gained:gained,gb_customer_ready:snapshot.items.filter(r=>r.country==='GB').length,paid_queries:0}));
   if(start===0&&gained===0){stop='zero_customer_ready_after_canary';break;}
   if(start>=10&&outcomes.filter(r=>r.readiness==='ready').length<outcomes.length/2){stop='poor_verified_ready_yield';break;}
  }
 }catch(e){const native=e.message.match(/^shadow_http_\d+_(cjs_[a-z_]+|uk_[a-z_]+)$/)?.[1];stop=native??(/^[a-z_]+$/.test(e.message)?e.message:'uk_custody_or_source_review');error=e;}
 finally{await c.call('enrichment','/uk/stop',{run_id:run.id,reason:stop.slice(0,80)});}
 const after=await c.catalogue(),created=(await c.db.prepare('SELECT id,created_at FROM entities WHERE environment=\'shadow\' AND market=\'GB\'').all()).results,mutations=changedCustody(custody,await ukSourceCustody(c.db,existing)),funnel=customerInventoryFunnel(before,after,{createdAt:Object.fromEntries(created.map(r=>[r.id,r.created_at]))}),native=await c.db.prepare('SELECT visits_reserved,status,stop_reason FROM uk_source_runs WHERE id=?').bind(run.id).first();
 save('after-catalogue-private.json',after);save('funnel-private.json',funnel);save('after-custody-private.json',await ukSourceCustody(c.db,existing));
 const {changes,...aggregate}=funnel;const report={schema:'findpitches-v3-uk-source-led-growth-v1',as_of:after.as_of,source_family:'cjseventswarwickshire',event_urls_requested:eventURLs.length,outcomes:outcomes.length,imported:outcomes.filter(r=>r.status==='imported').length,held:outcomes.filter(r=>r.status==='held').length,held_source_pages:discoveries.reduce((n,d)=>n+(d.held_options?.length??0),0),native_run:native,custody_compared:Object.fromEntries(Object.entries(custody).map(([k,v])=>[k,Object.keys(v).length])),custody_mutations:mutations,paid_queries:0,standing_scheduler_enabled:false,customer_inventory:aggregate,stop_reason:stop};save('report.json',report);if(error)throw error;return report;
}
