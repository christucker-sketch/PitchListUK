// Free-source, bounded operator diagnostics. No acquisition or producer edits.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {assessEligibility} from '../../platform/findpitches-v3/pipeline.mjs';

export const INTERNATIONAL_MARKETS=['AU','NZ','CA','IE'];
const tally=(out,key)=>{out[key]=(out[key]??0)+1;};
const empty=()=>({entities:0,ready:0,verified:0,watch:0,quarantined:0,blocked:0,awaiting_verification:0,stale_expired:0,source_verified_but_not_ready:0,source_complete_but_selected_mismatch:0,organiser_only_review_candidates:0,latest_source_verdicts:{},selected_states:{},reason_codes:{},blocker_categories:{}});
function categories(reasons,r){return [...new Set([
  ...reasons.some(x=>/identity|edition_identity|country_market|unresolved_evidence/.test(x))?['identity_or_evidence_hold']:[],
  ...reasons.some(x=>/country|geograph/.test(x))?['geography_proof']:[],
  ...reasons.some(x=>/date|event_start|event_end|stale_edition|past_event/.test(x))?['date_or_edition_proof']:[],
  ...reasons.some(x=>/organiser/.test(x))?['organiser_proof']:[],
  ...reasons.some(x=>/venue|location/.test(x))?['venue_or_location_proof']:[],
  ...reasons.some(x=>/application|vendor|trader|waitlist|closed|enquiry/.test(x))?['application_route_or_state']:[],
  ...reasons.some(x=>/source_http|fetch_failed|document_missing/.test(x))?['source_transport']:[],
  ...reasons.some(x=>/single_event_source_data_missing|event_content_scope|identity_not_bound/.test(x))?['source_parser_binding']:[],
  ...reasons.some(x=>/social|editorial|platform_index|demo/.test(x))?['discovery_page_is_not_an_opportunity']:[],
  ...r.awaiting_verification?['proof_missing_expired_or_revision_changed']:[]
])];}
function count(out,r,now){out.entities++;for(const k of ['ready','verified','watch','quarantined','blocked','awaiting_verification','stale_expired'])out[k]+=+r[k];tally(out.selected_states,r.fields.application_state??'missing');tally(out.latest_source_verdicts,r.proof_status??'never_checked');out.source_verified_but_not_ready+=+(r.proof_status==='verified'&&!r.awaiting_verification&&!r.ready);
  const mismatchOnly=!r.ready&&!r.awaiting_verification&&r.reasons.length>0&&r.reasons.every(x=>/^selected_.*disagrees_with_proof$/.test(x));out.source_complete_but_selected_mismatch+=+mismatchOnly;
  out.organiser_only_review_candidates+=+(mismatchOnly&&r.reasons.length===1&&r.reasons[0]==='selected_organiser_disagrees_with_proof'&&assessEligibility({...r,...r.fields},{now,conflicts:r.conflicts,qualityHolds:r.quality_holds}).status==='eligible'&&Boolean(r.fields.organiser&&r.fields.location));
  if(!r.ready){const eligibility=assessEligibility({...r,...r.fields},{now,conflicts:r.conflicts,qualityHolds:r.quality_holds}),reasons=[...new Set([...r.reasons,...eligibility.reasons,...r.awaiting_verification?['proof_missing_expired_or_revision_changed']:[],...!r.fields.location?['source_backed_location_missing']:[],...!r.fields.organiser?['organiser_missing']:[]])];for(const reason of reasons)tally(out.reason_codes,reason);for(const key of categories(reasons,r))tally(out.blocker_categories,key);}}
export function internationalBlockers(rows,{now=new Date().toISOString()}={}){
  const markets=Object.fromEntries(INTERNATIONAL_MARKETS.map(k=>[k,{all_commercial:empty(),structured_membership:empty(),by_source:{},structured_open_by_source:{}}]));
  for(const raw of rows){const r=commercialEntity(raw,now);if(!r.commercial||!markets[r.market])continue;const m=markets[r.market],structured=JSON.parse(r.producers_json??'[]').includes('independent-structured'),family=r.domain;
    count(m.all_commercial,r,now);const source=m.by_source[family]??={all_commercial:empty(),structured_membership:empty()};count(source.all_commercial,r,now);
    if(structured){count(m.structured_membership,r,now);count(source.structured_membership,r,now);if(r.fields.application_state==='OPEN_NOW')count(m.structured_open_by_source[family]??=empty(),r,now);}}
  for(const m of Object.values(markets)){m.sources_without_structured_membership={domains:0,entities:0};for(const [domain,s] of Object.entries(m.by_source))if(!s.structured_membership.entities){m.sources_without_structured_membership.domains++;m.sources_without_structured_membership.entities+=s.all_commercial.entities;delete m.by_source[domain];}}
  return {schema:'findpitches-v3-international-blockers-v1',as_of:now,markets,definitions:{scope:'Distinct linked shadow commercial entities; test/control excluded. Structured membership overlaps commercial origins. Assigned market on held records is discovery identity, not verified geography.',domain_scope:'Detailed domain rows cover every structured-member source family and include all origins on those domains. Legacy-only domains are counted separately; their entities/reasons remain in all_commercial totals.',dispositions:'READY/WATCH/quarantined/blocked are exclusive. Verification/stale flags and blocker categories overlap; do not sum them.',source_reasons:'Retained latest proof reason codes plus current eligibility and freshness. Expired parser reasons are diagnostic history, not a claim of a new visit.',source_verified_but_not_ready:'Current revision/version/TTL-matched parser VERIFIED report, but selection comparison, identity/evidence holds, eligibility or readiness blocks the entity.',selected_mismatch_review:'Source complete means current proof has only selected-field disagreement reasons. Organiser-only review candidates additionally have no other eligibility/identity/legacy hold and selected organiser/location present. These counts are review populations, not promised READY upside; no selection is changed by this tool.',open_cohort:'Selected OPEN_NOW fields, not producer raw volume or independently proved current applications.'}};
}
export async function internationalSnapshot(ctx){const rows=[];for(const market of INTERNATIONAL_MARKETS)rows.push(...await commercialRows(ctx.db,{market}));return {as_of:new Date().toISOString(),rows};}
export async function verifyInternational(ctx,before,{limit=100,outDirectory}={}){
  if(!Number.isInteger(limit)||limit<1||limit>150)throw Error('international_verification_cap_required');
  const status=await ctx.call('api','/status');if(status.mode!=='shadow'||status.publication_enabled||status.customer_rows||status.publication_rows||status.serper.bulk_enabled||status.source_led_programme.policy.manual_paused!==1)throw Error('shadow_paused_guard_required');
  const rows=before.rows.map(r=>commercialEntity(r,new Date().toISOString())).filter(r=>r.commercial&&JSON.parse(r.producers_json??'[]').includes('independent-structured')&&['cluemart.co.nz','localstalls.com','marketsireland.ie'].includes(r.domain)&&['OPEN_NOW','ROLLING'].includes(r.fields.application_state));
  rows.sort((a,b)=>(b.domain==='cluemart.co.nz')-(a.domain==='cluemart.co.nz')||Number(b.fields.event_start>=before.as_of.slice(0,10))-Number(a.fields.event_start>=before.as_of.slice(0,10))||a.id.localeCompare(b.id));
  const file=path.join(outDirectory,'verification-results-private.json'),done=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[],seen=new Set(done.map(r=>r.entity_id));
  for(const row of rows.slice(0,limit)){if(seen.has(row.id))continue;const result=await ctx.call('enrichment','/verification/verify',{entity_id:row.id});done.push(result);fs.writeFileSync(file,JSON.stringify(done),{mode:0o600});
    if(done.length%10===0){const guard=await ctx.db.prepare(`SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows,(SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication_enabled,(SELECT COALESCE(SUM(queries_attempted),0) FROM serper_usage) AS queries,(SELECT COUNT(*) FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?) AS due`).bind(new Date().toISOString()).first();
      if(guard.customer_rows||guard.publication_rows||guard.publication_enabled||guard.queries!==status.commercial.kpis.paid_acquisition_queries||guard.due>100)throw Error('international_integrity_or_backlog_stop');console.log(JSON.stringify({direct_verifications:done.length,maximum:Math.min(limit,rows.length),due:guard.due}));}
    await new Promise(resolve=>setTimeout(resolve,1200));}
  for(let i=0;i<30;i++){const pending=await ctx.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage='readiness' AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();if(!pending.n)return done;await ctx.call('readiness','/tick',{limit:25});await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('international_readiness_did_not_settle');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{const dir=get('--out-dir');if(!dir)throw Error('private_output_directory_required');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const ctx=await shadowContext({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')}),snapshot=await internationalSnapshot(ctx);fs.writeFileSync(path.join(dir,'snapshot-private.json'),JSON.stringify(snapshot),{mode:0o600});
    fs.writeFileSync(path.join(dir,'international-blockers.json'),JSON.stringify(internationalBlockers(snapshot.rows,{now:snapshot.as_of}),null,2));console.log(JSON.stringify({as_of:snapshot.as_of,markets:Object.fromEntries(Object.entries(internationalBlockers(snapshot.rows,{now:snapshot.as_of}).markets).map(([k,v])=>[k,v.structured_membership]))}));
  }catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'international_snapshot_failed');process.exitCode=1;}
}
