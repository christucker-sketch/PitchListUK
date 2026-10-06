// Source-evidence reconstruction. V2 access is confined to the SELECT-only capture.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FIELDS,hash,stableJson,normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {cleanText,specificEventName,supportedTradingHeading,legacySourceUrl,legacyRecord,fieldEvidence} from '../../platform/findpitches-v3/legacy.mjs';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

function json(value,fallback) {try{return JSON.parse(value);}catch{return fallback;}}
const key=(market,url)=>market+'|'+url;
const present=value=>value!==null&&value!==undefined&&value!=='';
const sourceKey=url=>{try{const u=new URL(url);u.hash='';u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.toString();}catch{return url;}};
export const LEGACY_RULES_VERSION='evidence-v2';
function historicalFields(unit) {
  const c=unit.customer;
  if(c)return {event_name:c.title,organiser:c.organiser,location:c.location,region_code:c.region_code,event_start:c.event_start,event_end:c.event_end,application_deadline:c.application_deadline,canonical_url:c.canonical_url,application_url:c.application_url,recurring:c.recurring};
  const r=unit.candidate;
  return r?{event_name:r.event_name,organiser:r.organiser,canonical_url:r.canonical_url,application_url:r.application_url}:{};
}
export function fieldAudit(unit,record) {
  const historical=historicalFields(unit),fields={},totals={source_fields:0,historical_preserved:0,historical_repaired:0,historical_withheld:0,retained_source_preserved:0,retained_source_changed:0};
  for(const field of FIELDS) {
    const recovered=record?.[field],old=historical[field],baseline=unit.structured?.[field==='lifecycle_state'?'lifecycle_event':field==='source_platform'?'discovery_source':field];
    if(present(recovered))totals.source_fields++;
    const decision=present(old)?present(recovered)?stableJson(old)===stableJson(recovered)?'preserved':'repaired':'withheld':'not_previously_present';
    if(decision!=='not_previously_present')totals['historical_'+decision]++;
    if(present(baseline)&&record)totals[stableJson(baseline)===stableJson(recovered)?'retained_source_preserved':'retained_source_changed']++;
    fields[field]={decision,recovered:present(recovered)};
  }
  return {totals,fields,comparison:unit.customer?'customer_fields':'candidate_fields',unsupported_customer_values_imported:0};
}
export function legacyUnits(snapshot) {
  if(snapshot.schema!=='findpitches-legacy-v2-evidence-snapshot-v1'||snapshot.read_only!==true)throw Error('read_only_legacy_snapshot_required');
  const t=snapshot.tables,candidates=new Map(t.candidates.map(r=>[r.id,r])),customers=new Map(t.customer_opportunities.map(r=>[r.id,r])),enrichments=new Map(t.candidate_enrichment.map(r=>[r.candidate_id,r]));
  const byUrl=new Map();
  for(const c of candidates.values())for(const url of new Set([c.source_url,c.canonical_url].filter(legacySourceUrl))) {
    const k=key(c.market,url);if(!byUrl.has(k))byUrl.set(k,[]);byUrl.get(k).push(c.id);
  }
  const pilot=new Map(t.structured_feed_candidate_pilot.map(r=>[r.producer_id,r])),assigned=new Set(),units=[];
  for(const s of t.structured_feed_records) {
    const explicit=[s.matched_candidate_id,s.matched_customer_id,pilot.get(s.producer_id)?.candidate_id].filter(id=>id&&candidates.has(id));
    const urls=[...new Set([s.canonical_url,s.application_url].flatMap(url=>byUrl.get(key(s.market,url))??[]))];
    const matches=[...new Set([...explicit,...(urls.length===1?urls:[])])].filter(id=>!assigned.has(id));
    // Multiple historical identities do not become a forced source-identity merge.
    const candidate=matches.length===1?candidates.get(matches[0]):null;
    if(candidate)assigned.add(candidate.id);
    const references=[{table:'structured_feed_records',id:s.producer_id}];
    if(candidate)references.push({table:'candidates',id:candidate.id});
    const customer=candidate?customers.get(candidate.id):null;
    if(customer)references.push({table:'customer_opportunities',id:customer.id});
    units.push({id:'legacy_structured_'+s.producer_id,market:s.market,structured:s,candidate,customer,enrichment:candidate?enrichments.get(candidate.id):null,references});
  }
  for(const c of candidates.values())if(!assigned.has(c.id)) {
    const customer=customers.get(c.id),references=[{table:'candidates',id:c.id}];
    if(customer)references.push({table:'customer_opportunities',id:c.id});
    units.push({id:'legacy_candidate_'+c.id,market:c.market,candidate:c,customer,enrichment:enrichments.get(c.id),references});
  }
  for(const c of customers.values())if(!candidates.has(c.id))units.push({id:'legacy_customer_'+c.id,market:c.market,customer:c,references:[{table:'customer_opportunities',id:c.id}]});
  return units;
}
export function recoverRetained(unit,snapshotHash) {
  const s=unit.structured,provenance=json(s?.provenance_json,{}),evidence=json(s?.evidence_json,null);
  const source=provenance.sources?.find(p=>['primary','corroborating'].includes(p.role)&&p.http_status===200&&/^[a-f0-9]{64}$/.test(p.content_sha256??'')&&legacySourceUrl(p.url)
    &&[s?.canonical_url,s?.application_url].some(url=>url&&sourceKey(url)===sourceKey(p.url)));
  const common={legacy_origin:'legacy_v2',snapshot_hash:snapshotHash,reference_ids:unit.references,audit_status:'pending'};
  if(s&&source&&evidence&&Object.values(evidence).some(v=>typeof v==='string'&&v||Array.isArray(v)&&v.length)&&specificEventName(s.event_name)) {
    const fields=Object.fromEntries(FIELDS.map(f=>[f,s[f==='lifecycle_state'?'lifecycle_event':f==='source_platform'?'discovery_source':f]??null]));
    fields.source_identifier=null;
    const proof=JSON.stringify({retained_source_fields:fields,source_content_sha256:source.content_sha256});
    const record=legacyRecord({id:unit.id,market:unit.market,fields,fieldEvidence:fieldEvidence(fields,{kind:'retained_structured',source:source.url,excerpt:proof}),
      evidence:[{kind:'retained_structured',source:source.url,retained_evidence:evidence,source_content_sha256:source.content_sha256}],provenance:[common,{retained_source_provenance:provenance}],lastChecked:s.last_checked,firstSeen:s.first_seen,lastSeen:s.last_seen});
    if(!normalizeExport(record,{producer:'legacy_v2'}).errors.length)return {record,reason:'retained_structured_source_with_hash_and_provenance'};
  }
  const enrichment=json(unit.enrichment?.enrichment_json,{}),candidate=unit.candidate;
  const description=enrichment.description;
  // Historical names require literal corroboration in a retained fetched-page
  // excerpt. A classifier score or application phrase cannot supply a name.
  const excerpt=description?.evidence?.find(e=>legacySourceUrl(e.source)&&typeof e.excerpt==='string'&&specificEventName(candidate?.event_name)
    &&cleanText(e.excerpt).includes(cleanText(candidate.event_name)));
  if(excerpt&&supportedTradingHeading(candidate.event_name,{retained:true})
    &&/\b(vendors?|stallholders?|exhibitors?|traders?|craft fair)\b/i.test(cleanText(description.value??excerpt.excerpt))) {
    const fields={event_name:cleanText(candidate.event_name),canonical_url:excerpt.source,application_url:null,application_state:'UNKNOWN',lifecycle_state:'WATCH'};
    for(const f of ['organiser','event_start','event_end','application_deadline']) {
      const value=enrichment[f]?.value,proof=enrichment[f]?.evidence?.find(e=>legacySourceUrl(e.source)&&typeof e.excerpt==='string'&&typeof value==='string'&&cleanText(e.excerpt).includes(cleanText(value)));
      if(proof&&f==='organiser'&&/\b(?:organised|organized|hosted|presented) by\b/i.test(proof.excerpt))fields[f]=cleanText(value);
      else if(proof&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value)))fields[f]=value;
    }
    const record=legacyRecord({id:unit.id,market:unit.market,fields,fieldEvidence:fieldEvidence(fields,{kind:'retained_excerpt',source:excerpt.source,excerpt:excerpt.excerpt}),
      evidence:[{kind:'retained_excerpt',source:excerpt.source,excerpt:excerpt.excerpt}],provenance:[common],lastChecked:unit.enrichment.enriched_at,firstSeen:candidate.first_seen});
    if(!normalizeExport(record,{producer:'legacy_v2'}).errors.length)return {record,reason:'retained_fetched_excerpt_corroborates_identity'};
  }
  return null;
}
const COUNTRIES={US:'US','United States':'US','United States of America':'US',USA:'US',GB:'GB',UK:'GB','United Kingdom':'GB',Canada:'CA',CA:'CA',Australia:'AU',AU:'AU','New Zealand':'NZ',NZ:'NZ',Ireland:'IE',IE:'IE',Singapore:'SG',SG:'SG','Hong Kong':'HK',HK:'HK'};
export function recoverRefetched(unit,page,snapshotHash) {
  if(!page?.fields)return null;
  if(page.kind==='direct_heading'&&!supportedTradingHeading(page.fields.event_name))return null;
  const {source_country,...fields}=page.fields;
  const observedCountry=typeof source_country==='string'?COUNTRIES[source_country]??COUNTRIES[source_country.trim().toUpperCase()]:null;
  if(source_country&&!observedCountry)return null;
  const market=observedCountry??unit.market;
  const record=legacyRecord({id:unit.id,market,fields,fieldEvidence:fieldEvidence(fields,{kind:page.kind,source:page.url,excerpt:JSON.stringify({fields,source_content_sha256:page.content_hash})}),
    evidence:[page.evidence],provenance:[{legacy_origin:'legacy_v2',snapshot_hash:snapshotHash,reference_ids:unit.references,requested_url:page.requested_url,redirect_chain:page.redirect_chain,
      market_origin:observedCountry?'direct_source_country':'historical_discovery_scope',historical_market:unit.market,source_country:source_country??null,audit_status:'pending'}],lastChecked:page.checked_at,firstSeen:unit.structured?.first_seen??unit.candidate?.first_seen,lastSeen:page.checked_at});
  return normalizeExport(record,{producer:'legacy_v2'}).errors.length?null:record;
}
export function originalSources(unit) {
  const s=unit.structured,c=unit.candidate,o=unit.customer;
  return [...new Set([s?.canonical_url,c?.source_url,c?.canonical_url,s?.application_url,c?.application_url,o?.canonical_url,o?.application_url].filter(legacySourceUrl))];
}
export async function runLegacyRecovery({snapshotFile,stateDirectory,credentialsFile,outputDirectory,concurrency=8,progress=()=>{}}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw Error('bounded_recovery_concurrency_required');
  const snapshot=JSON.parse(fs.readFileSync(snapshotFile)),units=legacyUnits(snapshot);
  if(await hash(snapshot.tables)!==snapshot.content_hash)throw Error('legacy_snapshot_hash_mismatch');
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),api=cloudflareClient(readCredentials(credentialsFile));
  const db=await openRemoteD1(api,state),secret=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'))).V3_OPERATOR_TOKEN,fetcher=proxyFetch();
  fs.mkdirSync(outputDirectory,{recursive:true,mode:0o700});
  const oldRun='legacy_'+snapshot.content_hash;
  const previous=await db.prepare('SELECT id FROM legacy_recovery_runs WHERE id=?').bind(oldRun).first();
  const run={id:'legacy_'+await hash([snapshot.content_hash,LEGACY_RULES_VERSION]),rules_version:LEGACY_RULES_VERSION,snapshot_hash:snapshot.content_hash,source_counts:snapshot.counts,total_opportunities:units.length,...previous?{supersedes:oldRun}:{}};
  const cacheDir=path.join(outputDirectory,'sources'),entriesDir=path.join(outputDirectory,'entries-'+LEGACY_RULES_VERSION);fs.mkdirSync(cacheDir,{recursive:true,mode:0o700});fs.mkdirSync(entriesDir,{recursive:true,mode:0o700});
  const baselineFile=path.join(outputDirectory,'v3-entity-baseline.json');
  if(!fs.existsSync(baselineFile)) {
    const baseline=(await db.prepare("SELECT id FROM entities WHERE environment='shadow'").all()).results.map(r=>r.id);
    fs.writeFileSync(baselineFile,JSON.stringify({run_id:run.id,as_of:new Date().toISOString(),entity_ids:baseline}),{mode:0o600,flag:'wx'});
  }
  let baseline=JSON.parse(fs.readFileSync(baselineFile));
  if(baseline.run_id===oldRun&&run.supersedes) {
    fs.writeFileSync(path.join(outputDirectory,'v3-entity-baseline-original.json'),JSON.stringify(baseline),{mode:0o600});
    baseline={...baseline,run_id:run.id,superseded_run_id:oldRun};fs.writeFileSync(baselineFile,JSON.stringify(baseline),{mode:0o600});
  }
  if(baseline.run_id!==run.id)throw Error('legacy_baseline_run_mismatch');
  async function post(route,body) {
    for(let retry=0;retry<7;retry++) {
      try {
        const response=await fetcher(state.urls.ingest+route,{method:'POST',headers:{authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
        const data=await response.json();if(!response.ok)throw Error('legacy_operator_http_'+response.status+'_'+(data.error??'failed'));return data;
      } catch(error){if(retry===6)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(20000,500*2**retry)+Math.floor(Math.random()*250)));}
    }
  }
  const active=new Map(),hostNext=new Map(),hostPausedUntil=new Map();let providerRequests=0;
  async function source(url) {
    const digest=await hash(url),file=path.join(cacheDir,digest+'.json');
    if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file));
    if(active.has(url))return active.get(url);
    const work=(async()=>{
      const host=new URL(url).hostname;
      const hold=()=>{
        const pausedUntil=hostPausedUntil.get(host);if(!(pausedUntil>Date.now()))return null;
        const result={reason:'source_host_rate_limited_requires_review',url,checked_at:new Date().toISOString(),retry_after:new Date(pausedUntil).toISOString()};
        fs.writeFileSync(file,JSON.stringify(result),{mode:0o600});return result;
      };
      const immediateHold=hold();if(immediateHold)return immediateHold;
      // Large public platforms tolerate a small bounded read cadence; ordinary
      // source hosts retain the slower spacing. A 429 pauses that hostname.
      const spacing=host==='www.facebook.com'?300:1200;
      const at=Math.max(Date.now(),hostNext.get(host)??0);hostNext.set(host,at+spacing);
      if(at>Date.now())await new Promise(resolve=>setTimeout(resolve,at-Date.now()));
      const delayedHold=hold();if(delayedHold)return delayedHold;
      providerRequests++;const result=await post('/legacy/refetch',{url});
      if(result.reason==='source_http_429')hostPausedUntil.set(host,Date.now()+(result.retry_after_seconds??900)*1000);
      fs.writeFileSync(file,JSON.stringify(result),{mode:0o600});return result;
    })();active.set(url,work);
    try{return await work;}finally{active.delete(url);}
  }
  const priorEntries=(await db.prepare('SELECT legacy_id FROM legacy_recovery_records WHERE run_id=?').bind(run.id).all()).results;
  const alreadyImported=new Set(priorEntries.map(r=>r.legacy_id));
  let position=0,processed=alreadyImported.size;const counts={retained_evidence:0,source_refetch:0,quarantine:0};
  for(const r of (await db.prepare('SELECT category,COUNT(*) AS count FROM legacy_recovery_records WHERE run_id=? GROUP BY category').bind(run.id).all()).results)counts[r.category]=r.count;
  async function prepareUnit(unit) {
      const file=path.join(entriesDir,unit.id+'.json');let entry;
      if(fs.existsSync(file))entry=JSON.parse(fs.readFileSync(file));
      else {
        const retained=recoverRetained(unit,snapshot.content_hash);let record=retained?.record,reason=retained?.reason,category='retained_evidence',attempts=0;
        if(!record) {
          category='quarantine';const urls=originalSources(unit);reason=urls.length?'original_source_did_not_establish_identity':'no_safe_original_source_route';
          // At most two original routes, no discovered links and no search calls.
          for(const url of urls.slice(0,2)) {
            attempts++;const page=await source(url);record=recoverRefetched(unit,page,snapshot.content_hash);
            if(record){category='source_refetch';reason='direct_source_established_event_identity';break;}
            reason=page.reason??'source_country_or_evidence_conflict';
          }
        }
        entry={id:unit.id,references:unit.references,category,reason,record:record??null,field_audit:fieldAudit(unit,record),refetch_attempts:attempts};
        fs.writeFileSync(file,JSON.stringify(entry),{mode:0o600});
      }
      return entry;
  }
  // Ready source results advance independently of slow requests. At most two
  // import batches can write to D1; every batch holds at most eight entries.
  const preparing=new Map(),imports=new Set();let batch=[];
  function fillPreparations() {
    while(preparing.size<concurrency&&position<units.length) {
      const unit=units[position++];if(alreadyImported.has(unit.id))continue;
      const work=prepareUnit(unit).then(entry=>({id:unit.id,entry}),error=>({id:unit.id,error}));
      preparing.set(unit.id,work);
    }
  }
  async function finishImport() {
    const settled=await Promise.race(imports);imports.delete(settled.work);
    if(settled.error)throw settled.error;
    for(const entry of settled.entries){counts[entry.category]++;processed++;}
    progress({processed,total:units.length,counts,source_requests_this_execution:providerRequests,serper_queries:0});
  }
  async function sendBatch(entries) {
    if(imports.size===2)await finishImport();
    let work;work=post('/legacy/import',{run,entries}).then(()=>({work,entries}),error=>({work,error}));imports.add(work);
  }
  fillPreparations();
  while(preparing.size) {
    const settled=await Promise.race(preparing.values());preparing.delete(settled.id);
    if(settled.error)throw settled.error;
    batch.push(settled.entry);fillPreparations();
    if(batch.length===Math.min(8,concurrency)){await sendBatch(batch);batch=[];}
  }
  if(batch.length)await sendBatch(batch);
  while(imports.size)await finishImport();
  await post('/legacy/complete',{run_id:run.id});
  return {run,counts,providerRequests,baseline};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const result=await runLegacyRecovery({snapshotFile:get('--snapshot'),stateDirectory:get('--state-dir'),credentialsFile:get('--credentials'),outputDirectory:get('--out-dir'),concurrency:Number(get('--concurrency')||8),progress:r=>console.log(JSON.stringify(r))});console.log(JSON.stringify({...result,baseline:undefined}));}
  catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'legacy_recovery_execution_failed');process.exitCode=1;}
}
