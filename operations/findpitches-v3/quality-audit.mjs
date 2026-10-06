// Read-only, reproducible sampling of qualified legacy records and their current canonical selections.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';
import {hash,publicHttps,stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';

export function auditPlatform(record) {
  const url=record.application_url??record.canonical_url;
  try {const host=new URL(url).hostname.replace(/^www\./,'');return ['eventeny.com','eventbrite.com','facebook.com','jotform.com','forms.gle','google.com'].find(p=>host===p||host.endsWith('.'+p))??'direct-site';}catch{return 'missing-source';}
}
export async function selectAuditSample(population,{size=120,seed='legacy-quality-2026-10-06'}={}) {
  const ranked=await Promise.all(population.map(async row=>({...row,rank:await hash([seed,row.record_id])})));
  ranked.sort((a,b)=>a.rank.localeCompare(b.rank));
  const sample=[],entities=new Set();
  const add=row=>{if(sample.length<size&&!entities.has(row.entity_id)){sample.push(row);entities.add(row.entity_id);return true;}return false;};
  const groups=[...new Set(ranked.map(r=>r.category+'|'+r.identity_group))].sort();
  for(const group of groups){let n=0;for(const row of ranked.filter(r=>r.category+'|'+r.identity_group===group))if(add(row)&&++n===12)break;}
  for(const key of ['market','platform'])for(const value of [...new Set(ranked.map(r=>r[key]))].sort()) {
    let have=sample.filter(r=>r[key]===value).length;
    for(const row of ranked.filter(r=>r[key]===value))if(have<3&&add(row))have++;
  }
  // Fill remaining places in the seeded population order, retaining one canonical entity per sample row.
  for(const row of ranked)add(row);
  return sample;
}
const nonempty=value=>value!==null&&value!==undefined&&value!=='';
export function assessUsefulness({fields,proofs=[],market,sourceCountry=null},{now=new Date().toISOString()}={}) {
  const reasons=[],missing=[],state=fields.application_state;
  for(const f of ['event_name','organiser','location','event_start','application_url'])if(!nonempty(fields[f]))missing.push(f);
  const source=fields.application_url??fields.canonical_url;
  if(!source||!publicHttps(source))reasons.push('unsafe_or_missing_source_route');
  if(sourceCountry&&sourceCountry!==market)reasons.push('source_country_conflicts_with_market');
  const title=String(fields.event_name??'');
  if(/\b(?:login|sign in|access denied|privacy policy|procurement|supplier registration)\b/i.test(title))reasons.push('non_opportunity_title');
  if(reasons.length)return {classification:'wrong_unsafe',reasons,missing};
  if(!proofs.length||proofs.some(p=>!publicHttps(p.source_url)||!p.evidence_json||p.evidence_json==='[]'))reasons.push('field_evidence_incomplete');
  if(/^(?:vendors?|applications?|register|apply|events?|home|contact)(?:\s*[-|:].*)?$/i.test(title.trim()))reasons.push('generic_title');
  if(/\b(?:directory|events calendar|event listings|find events|list of|upcoming events|markets near|best .+ markets)\b/i.test(title))reasons.push('listing_title_requires_specific_event');
  const ended=Date.parse(fields.event_end??fields.event_start);
  if(Number.isFinite(ended)&&ended<Date.parse(now.slice(0,10))&&fields.recurring!==true&&fields.recurring!==1)reasons.push('past_event_requires_current_edition');
  if(['CLOSED','WATCH'].includes(state))reasons.push('no_current_vendor_availability');
  if(fields.application_deadline&&Date.parse(fields.application_deadline)<Date.parse(now.slice(0,10)))reasons.push('past_application_deadline');
  const hasTiming=nonempty(fields.event_start)||fields.recurring===true||fields.recurring===1;
  if(!hasTiming)reasons.push('event_timing_unestablished');
  if(!fields.location)reasons.push('venue_location_missing');
  if(!fields.organiser)reasons.push('organiser_missing');
  const vendorRoute=fields.application_url||/\/events\/vendor\/?\?id=|\/(?:vendors?|stallholders?|exhibitors?)(?:\/|\?|$)/i.test(source);
  if(!vendorRoute)reasons.push('vendor_route_requires_review');
  const material=reasons.filter(r=>!['organiser_missing'].includes(r));
  const classification=material.length?'questionable':reasons.length||state==='UNKNOWN'?'usable_minor_missing':'clearly_usable';
  return {classification,reasons:[...reasons,...state==='UNKNOWN'?['application_availability_unknown']:[]],missing};
}
export async function prepareQualityAudit({credentialsFile,stateDirectory,outDirectory}) {
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state);
  const baseline=JSON.parse(fs.readFileSync(path.join(stateDirectory,'legacy-recovery/v3-entity-baseline.json')));
  const rows=(await db.prepare(`SELECT l.record_id,l.category,d.entity_id,p.market,p.normalized_json,
    (SELECT p2.producer_name FROM reconciliation_decisions d2 JOIN producer_records p2 ON p2.id=d2.record_id WHERE d2.entity_id=d.entity_id AND d2.outcome='NEW_ENTITY' ORDER BY d2.created_at,d2.record_id LIMIT 1) AS first_producer
    FROM legacy_recovery_records l JOIN producer_records p ON p.id=l.record_id JOIN reconciliation_decisions d ON d.record_id=l.record_id
    WHERE l.run_id=? AND d.entity_id IS NOT NULL AND d.outcome IN ('NEW_ENTITY','EXACT_MATCH')
    AND NOT EXISTS(SELECT 1 FROM legacy_quality_holds h WHERE h.record_id=l.record_id)`).bind(baseline.run_id).all()).results;
  const known=new Set(baseline.entity_ids);
  const population=rows.map(row=>{const record=JSON.parse(row.normalized_json);return {...row,identity_group:known.has(row.entity_id)||row.first_producer!=='legacy_v2'?'existing':'new',platform:auditPlatform(record)};});
  const sample=await selectAuditSample(population),ids=sample.map(r=>r.entity_id);
  const selected=(await db.prepare('SELECT f.*,sf.source_url,sf.evidence_json,sf.provenance_json FROM selected_facts f JOIN source_facts sf ON sf.id=f.fact_id WHERE f.entity_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()).results;
  const receipts=(await db.prepare('SELECT id,normalized_json FROM producer_records WHERE id IN (SELECT DISTINCT record_id FROM selected_facts WHERE entity_id IN (SELECT value FROM json_each(?)))').bind(JSON.stringify(ids)).all()).results;
  const details=[];
  for(const row of sample) {
    const facts=selected.filter(f=>f.entity_id===row.entity_id),fields=Object.fromEntries(facts.map(f=>[f.field_name,JSON.parse(f.value_json)]));
    const record=JSON.parse(row.normalized_json),selectedReceipts=receipts.filter(r=>facts.some(f=>f.record_id===r.id));
    details.push({record_id:row.record_id,entity_id:row.entity_id,category:row.category,identity_group:row.identity_group,market:row.market,platform:row.platform,fields,proofs:facts,record,selected_receipts:selectedReceipts,assessment:assessUsefulness({fields,proofs:facts,market:row.market})});
  }
  const result={schema:'findpitches-legacy-quality-sample-v1',as_of:new Date().toISOString(),seed:'legacy-quality-2026-10-06',population_records:population.length,population_entities:new Set(population.map(r=>r.entity_id)).size,sampling:'Seeded record ordering; minimum 12 per recovery-route/identity cell and three per available country/platform, then seeded fill; one canonical entity per sample row. Diversity quotas oversample rare strata; percentages describe the sample, not an unbiased population estimate.',population_strata:countStrata(population),sample_strata:countStrata(details),sample:details};
  fs.writeFileSync(path.join(outDirectory,'sample-private.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  return {sampled:details.length,population:population.length,strata:result.sample_strata};
}
function countStrata(rows) {
  const result={};for(const key of ['category','identity_group','market','platform']){result[key]={};for(const row of rows)result[key][row[key]]=(result[key][row[key]]??0)+1;}return result;
}
export async function refreshAuditSources({stateDirectory,outDirectory}) {
  const sample=JSON.parse(fs.readFileSync(path.join(outDirectory,'sample-private.json'))),state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json')));
  const token=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'))).V3_OPERATOR_TOKEN,fetcher=proxyFetch();
  const urls=[...new Set(sample.sample.flatMap(row=>[row.fields.canonical_url,row.fields.application_url]).filter(publicHttps))];
  const cache={},hostNext=new Map();let index=0;
  async function worker(){for(;;){const i=index++;if(i>=urls.length)return;const url=urls[i],host=new URL(url).hostname;
    const at=Math.max(Date.now(),hostNext.get(host)??0);hostNext.set(host,at+1200);
    if(at>Date.now())await new Promise(r=>setTimeout(r,at-Date.now()));
    try {const response=await fetcher(state.urls.ingest+'/legacy/refetch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('source_audit_http_failed');cache[url]=await response.json();}catch{cache[url]={reason:'audit_source_fetch_failed',url};}
    if(Object.keys(cache).length%20===0)console.log(JSON.stringify({audit_sources_checked:Object.keys(cache).length,total:urls.length}));
  }}
  await Promise.all(Array.from({length:6},worker));
  const result={as_of:new Date().toISOString(),source_routes_requested:urls.length,serper_queries:0,pages:cache};
  fs.writeFileSync(path.join(outDirectory,'fresh-sources-private.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  return {routes:urls.length,source_responses:Object.values(cache).filter(p=>p.fields).length,uncertain_responses:Object.values(cache).filter(p=>!p.fields).length};
}
export async function reportQualityAudit({sampleFile,reviewFile,outFile}) {
  const input=JSON.parse(fs.readFileSync(sampleFile)),reviews=JSON.parse(fs.readFileSync(reviewFile));
  if(reviews.length!==input.sample.length||new Set(reviews.map(r=>r.record_id)).size!==input.sample.length)throw Error('complete_unique_sample_reviews_required');
  const counts={clearly_usable:0,usable_minor_missing:0,questionable:0,wrong_unsafe:0},patterns={},byStratum={},fieldCoverage={};
  const results=input.sample.map(row=>{
    const review=reviews.find(r=>r.record_id===row.record_id);if(!review||!(review.classification in counts)||!review.reason||!review.evidence_checked)throw Error('grounded_sample_review_required');
    counts[review.classification]++;
    for(const reason of new Set(review.patterns??row.assessment.reasons))patterns[reason]=(patterns[reason]??0)+1;
    for(const key of ['category','identity_group','market','platform']){byStratum[key]??={};byStratum[key][row[key]]??={sampled:0,...Object.fromEntries(Object.keys(counts).map(k=>[k,0]))};byStratum[key][row[key]].sampled++;byStratum[key][row[key]][review.classification]++;}
    for(const field of ['event_name','organiser','location','event_start','application_url','application_state','application_deadline']){fieldCoverage[field]??={present:0,missing:0};fieldCoverage[field][nonempty(row.fields[field])?'present':'missing']++;}
    return {record_id:row.record_id,entity_id:row.entity_id,category:row.category,identity_group:row.identity_group,market:row.market,platform:row.platform,...review};
  });
  const report={schema:'findpitches-legacy-quality-audit-v1',as_of:new Date().toISOString(),sample_hash:await hash(input),sample_size:results.length,population_records:input.population_records,population_entities:input.population_entities,method:input.sampling,reviewer:'Codex evidence-based practical-usefulness review; not independent human ground truth',counts,percentages:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number((v/results.length*100).toFixed(2))])),sample_strata:input.sample_strata,by_stratum:byStratum,field_coverage:fieldCoverage,recurring_patterns:patterns,reviews:results,source_fields_overwritten:0,paid_search_queries:0,limitations:['Sample percentages are descriptive; diversity quotas and limited sample sizes prevent unbiased population estimates.','Retained excerpts/structured provenance and fresh original-source responses were checked where available; blocked fetches remain uncertainty.','Ready state and an accurate record do not independently establish current applications are open.']};
  fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
export async function holdWrongSample({credentialsFile,stateDirectory,outDirectory}) {
  const sample=JSON.parse(fs.readFileSync(path.join(outDirectory,'sample-private.json'))),report=JSON.parse(fs.readFileSync(path.join(outDirectory,'quality-report.json')));
  if(report.sample_hash!==await hash(sample))throw Error('audited_sample_hash_required');
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state);
  const now=new Date().toISOString(),records=new Set();let entities=0;
  for(const review of report.reviews.filter(r=>r.classification==='wrong_unsafe')) {
    const row=sample.sample.find(r=>r.record_id===review.record_id);
    for(const proof of row.proofs)if(!records.has(proof.record_id)) {
      await db.prepare(`INSERT OR IGNORE INTO legacy_quality_holds(record_id,rules_version,reason,created_at)
        SELECT p.id,'practical-audit-v1',?,? FROM producer_records p JOIN selected_facts f ON f.record_id=p.id
        JOIN entities e ON e.id=f.entity_id WHERE p.id=? AND f.entity_id=? AND f.fact_id=? AND e.environment='shadow'`).bind(review.patterns[0],now,proof.record_id,row.entity_id,proof.fact_id).run();
      records.add(proof.record_id);
    }
    const key=row.entity_id+':practical-audit:'+report.sample_hash;
    await enqueue(db,'eligibility',key,{entity_id:row.entity_id},now);await enqueue(db,'readiness',key,{entity_id:row.entity_id},now);entities++;
  }
  const result={as_of:now,audited_sample_hash:report.sample_hash,wrong_entities_scheduled:entities,selected_source_receipts_held:records.size,source_fields_overwritten:0,evidence_deleted:0,questionable_records_overwritten:0};
  fs.writeFileSync(path.join(outDirectory,'quality-holds.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const options={credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')};const result=await (args.includes('--holds')?holdWrongSample(options):args.includes('--refetch')?refreshAuditSources(options):prepareQualityAudit(options));console.log(JSON.stringify(result));}catch {console.error('quality_audit_preparation_failed');process.exitCode=1;}
}
