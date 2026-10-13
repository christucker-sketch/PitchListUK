// Re-evaluate existing holdings against D-018. No paid request, new entity,
// V2 access, publication flag or source-fact rewrite is performed here.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,commercialEntity,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {verificationUrl} from '../../platform/findpitches-v3/verification-store.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';
const ROUTE_REASONS=new Set(['open_vendor_application_not_proved','vendor_application_not_proved','event_application_route_missing_or_ambiguous','cluemart_trader_application_not_proved','selected_application_state_disagrees_with_proof','selected_application_url_disagrees_with_proof']);
const MARKETS=['US','GB','CA','AU','NZ','IE','SG','HK'];
const save=(d,n,v)=>fs.writeFileSync(path.join(d,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
export function globalRouteTargets(rows,now,{limit=120}={}){
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('bounded_global_route_limit_required');
 const lanes=Object.fromEntries(MARKETS.map(m=>[m,[]]));
 for(const row of rows){const r=commercialEntity(row,now),f=r.proof.facts??{};
  if(!r.commercial||r.ready||r.quality_holds||r.conflicts||!lanes[r.market]||!['UNKNOWN','WATCH','OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE'].includes(r.fields.application_state))continue;
  const routeOnly=r.proof.page_kind!=='directory'&&Object.keys(f).length&&['event_name','organiser','location','country','event_start','event_end'].every(k=>f[k])&&f.country===r.market&&f.event_end>=now.slice(0,10)&&r.reasons.length&&r.reasons.every(x=>ROUTE_REASONS.has(x));
  const unverified=!r.verification_checked&&r.fields.event_end>=now.slice(0,10)&&r.fields.event_name&&r.fields.organiser&&r.fields.location&&r.fields.canonical_url;
  if(!routeOnly&&!unverified)continue;const url=verificationUrl({...row,...r.fields});let u;try{u=new URL(url);}catch{continue;}
  if(/facebook\.|instagram\.|tiktok\.|youtube\.|eventbrite\.|ukcraftfairs\.|folkandbespoke\./.test(u.hostname))continue;
  if(unverified&&!/eventeny\.com$/.test(u.hostname)&&/\/(?:events?|calendar|directory|vendors?|search|listing)\/?$/.test(u.pathname))continue;
  lanes[r.market].push({entity_id:r.id,market:r.market,url,priority:routeOnly?100:/eventeny\.com$/.test(u.hostname)?60:40,route_only:!!routeOnly});
 }
 for(const a of Object.values(lanes))a.sort((a,b)=>b.priority-a.priority||a.entity_id.localeCompare(b.entity_id));
 const selected=[];while(selected.length<limit&&Object.values(lanes).some(a=>a.length))for(const m of MARKETS){const r=lanes[m].shift();if(r&&selected.length<limit)selected.push(r);}
 return selected;
}
export async function runGlobalRouteRecheck({credentialsFile,stateDirectory,outDirectory,baselineFile,limit=120,maxSourceRequests=250}){
 if(!Number.isInteger(maxSourceRequests)||maxSourceRequests<1||maxSourceRequests>500)throw Error('bounded_source_request_limit_required');
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const c=await shadowContext({credentialsFile,stateDirectory}),initial=await c.call('api','/status');assertFreeGrowth(initial);
 const before=JSON.parse(fs.readFileSync(baselineFile));if(!Array.isArray(before.rows))throw Error('original_global_rows_required');
 const targets=globalRouteTargets(before.rows,before.as_of,{limit});save(outDirectory,'targets-private.json',targets);
 const results=[];let requests=0,stop='bounded_global_recheck_complete';
 for(const target of targets){
  if(requests>=maxSourceRequests){stop='source_request_budget';break;}
  const at=new Date().toISOString(),guard=await c.db.prepare("SELECT (SELECT COUNT(*) FROM customer_projections) customer_rows,(SELECT COUNT(*) FROM publication_queue) publication_rows,(SELECT COUNT(*) FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?) due_jobs").bind(at).first();
  if(guard.customer_rows||guard.publication_rows||guard.due_jobs>40){stop=guard.due_jobs>40?'verification_backlog':'shadow_scope_leakage';break;}
  const proof=await c.call('enrichment','/verification/verify',{entity_id:target.entity_id,max_source_requests:Math.min(16,maxSourceRequests-requests)});requests+=proof.source_requests_observed??1;
  results.push({entity_id:target.entity_id,market:target.market,verification_id:proof.verification_id,status:proof.report.status,reasons:proof.report.reasons,route_type:proof.report.usable_route?.type??null,source_requests:proof.source_requests_observed??null,route_only:target.route_only});save(outDirectory,'progress-private.json',results);
  if(proof.report.reasons.includes('source_http_429')){stop='source_rate_limited';break;}
  if(proof.source_request_budget_reached){stop='source_request_budget';break;}
  for(const stage of ['readiness'])await c.call(stage,'/tick',{});
  if(results.length%10===0)console.log(JSON.stringify({source_rechecks:results.length,source_requests:requests,verified:results.filter(r=>r.status==='verified').length,paid_queries_added:0}));
  await new Promise(r=>setTimeout(r,1500));
 }
 const final=await c.call('api','/status');assertFreeGrowth(final,initial.commercial.kpis.paid_acquisition_queries);const now=new Date().toISOString(),rows=await commercialRows(c.db),inventory=inventoryFromRows(rows,{now}),growth=growthOutcome(before.rows,rows,{beforeAt:before.as_of,now});
 const oldReady=new Set(before.rows.filter(r=>commercialEntity(r,before.as_of).ready).map(r=>r.id)),gained=rows.map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&r.ready&&!oldReady.has(r.id)),byRoute={};for(const r of gained){const type=r.proof.usable_route?.type??'event_application';byRoute[type]=(byRoute[type]??0)+1;}
 const report={schema:'findpitches-v3-global-route-recheck-v1',as_of:now,baseline_as_of:before.as_of,total_commercial_entities_inspected:before.inventory.scope.commercial_entities,source_rechecks:results.length,source_requests_observed:requests,paid_queries_added:0,entities_created_by_this_lane:0,stop,growth,ready_gained_by_route_type:byRoute,inventory,before_ready_by_country:before.inventory.ready_by_country,after_ready_by_country:inventory.ready_by_country,ready_by_route_type:inventory.ready_by_usable_route_type};
 save(outDirectory,'after-rows-private.json',rows);save(outDirectory,'global-route-report.json',report);console.log(JSON.stringify({source_rechecks:results.length,source_requests:requests,ready_gained:growth.ready_gained,ready_lost:growth.ready_lost,net:growth.net_ready_gain,ready_by_country:inventory.ready_by_country,by_route:byRoute,stop}));return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a.includes(k)?a[a.indexOf(k)+1]:undefined;try{await runGlobalRouteRecheck({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir'),baselineFile:get('--baseline'),limit:Number(get('--limit')??120),maxSourceRequests:Number(get('--max-source-requests')??250)});}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'global_route_recheck_failed');process.exitCode=1;}}
