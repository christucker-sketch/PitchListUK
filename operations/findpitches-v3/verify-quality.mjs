// Owned V3 shadow verification only. No Serper calls and no V2 writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {verificationUrl} from '../../platform/findpitches-v3/verification-store.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tally=rows=>rows.reduce((out,key)=>(out[key]=(out[key]??0)+1,out),{});
const percent=(n,total)=>Number((100*n/total).toFixed(2));
export function scoreVerifiedRecord({proof,readiness,prior=null}) {
  const core=['event_name','country','location','event_start','application_url'].every(k=>proof.facts?.[k]);
  // An unproved vendor route is a material gap, even when the event itself is real.
  const minor=core&&proof.facts.application_state==='OPEN_NOW'&&proof.status==='partial'&&proof.reasons.every(r=>r==='verified_organiser_missing');
  return proof.status==='verified'&&readiness==='ready'?'clearly_usable':minor?'usable_minor_missing':prior==='wrong_unsafe'?'wrong_unsafe':'questionable';
}
export async function verifyQuality({credentialsFile,stateDirectory,outDirectory}) {
  const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  const audit=JSON.parse(fs.readFileSync(new URL('./reports/legacy-quality-audit-2026-10-06.json',import.meta.url)));
  const pilot=JSON.parse(fs.readFileSync(new URL('./reports/controlled-acquisition-pilot-2026-10-07.json',import.meta.url)));
  const pilotId=pilot.pilot_id;
  const pilotRows=(await db.prepare(`SELECT DISTINCT er.entity_id FROM pilot_run_grants g JOIN serper_run_records x ON x.run_id=g.run_id JOIN entity_records er ON er.record_id=x.record_id WHERE g.pilot_id=?`).bind(pilotId).all()).results;
  if(pilotRows.length!==10)throw Error('ten_original_pilot_entities_required');
  const selected=new Map(audit.reviews.map(r=>[r.entity_id,{entity_id:r.entity_id,cohort:'legacy',prior:r}]));
  for(const row of pilotRows)selected.set(row.entity_id,{...row,cohort:'paid_pilot',prior:{classification:'questionable'}});
  const families=['eventeny.com','localstalls.com','ukcraftfairs.com','eventbrite.com','marketspread.com'];
  for(const family of families) {
    const candidates=(await db.prepare(`SELECT e.id FROM entities e JOIN selected_facts f ON f.entity_id=e.id AND f.field_name='canonical_url' WHERE e.environment='shadow' AND f.value_json LIKE ? ORDER BY e.id LIMIT 30`).bind('%'+family+'%').all()).results;
    let count=0;for(const {id} of candidates)if(!selected.has(id)&&count++<4)selected.set(id,{entity_id:id,cohort:'source_family_control',family,prior:null});
  }
  const before=await call('api','/status');
  if(before.serper.bulk_enabled||before.customer_rows||before.publication_rows||before.publication_enabled||before.controlled_pilot.active?.length)throw Error('shadow_only_disabled_acquisition_required');
  fs.writeFileSync(path.join(outDirectory,'before-verification-status-private.json'),JSON.stringify(before),{mode:0o600});
  const rows=[];for(const row of selected.values()){const entity=await loadEntity(db,row.entity_id);rows.push({...row,source_url:verificationUrl(entity),before_fields:entity.fields,before_revision:entity.revision});}
  fs.writeFileSync(path.join(outDirectory,'verification-sample-private.json'),JSON.stringify(rows),{mode:0o600});
  const completedFile=path.join(outDirectory,'verification-results-private.json');
  const completed=fs.existsSync(completedFile)?JSON.parse(fs.readFileSync(completedFile)):[];
  const completedIds=new Set(completed.map(r=>r.entity_id));let cursor=0;const hostNext=new Map();
  async function run() {for(;;){const i=cursor++;if(i>=rows.length)return;const row=rows[i];if(completedIds.has(row.entity_id))continue;
    const host=new URL(row.source_url).hostname,at=Math.max(Date.now(),hostNext.get(host)??0);hostNext.set(host,at+1500);if(at>Date.now())await sleep(at-Date.now());
    // Calls accept an entity ID only; caller-supplied claims cannot create proof.
    const result=await call('enrichment','/verification/verify',{entity_id:row.entity_id});
    completed.push({...row,...result});fs.writeFileSync(completedFile,JSON.stringify(completed),{mode:0o600});
    if(completed.length%10===0)console.log(JSON.stringify({verified_sources:completed.length,total:rows.length}));
  }}
  await Promise.all(Array.from({length:3},run));
  for(let i=0;i<30;i++) {
    const due=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();
    if(!due.n)break;
    await call('readiness','/tick',{limit:25});await sleep(1000);
  }
  const details=[];
  for(const row of completed) {
    const e=await call('api','/entities/'+row.entity_id);
    const ready=await db.prepare('SELECT status,reasons_json FROM readiness WHERE entity_id=?').bind(row.entity_id).first();
    const repaired=Object.keys(e.entity.fields).filter(k=>JSON.stringify(e.entity.fields[k])!==JSON.stringify(row.before_fields[k]));
    const proof=e.verification;
    // Quarantining a bad discovery does not count as repairing its customer usefulness.
    const quality=scoreVerifiedRecord({proof,readiness:ready?.status,prior:row.prior?.classification});
    details.push({entity_id:row.entity_id,cohort:row.cohort,family:row.family??row.report.profile,prior_classification:row.prior?.classification??null,classification:quality,proof_status:proof.status,readiness:ready?.status??'pending',reasons:proof.reasons,patterns:row.prior?.patterns??[],repaired_fields:repaired});
  }
  const after=await call('api','/status'),baseline=JSON.parse(fs.readFileSync(path.join(outDirectory,'immutable-baseline-private.json')));
  const mutations=sourceMutationCount(baseline,await immutableDigests(db));
  if(mutations||after.serper.bulk_enabled||after.publication_enabled||after.customer_rows||after.publication_rows||after.provider_queries_completed!==before.provider_queries_completed)throw Error('verification_safety_guard_failed');
  fs.writeFileSync(path.join(outDirectory,'after-verification-status-private.json'),JSON.stringify(after),{mode:0o600});
  function metrics(cohort) {
    const subset=details.filter(r=>r.cohort===cohort),counts=tally(subset.map(r=>r.classification)),prior=tally(subset.map(r=>r.prior_classification??'not_previously_scored'));
    return {sample_size:subset.length,before:prior,after:counts,clearly_usable_or_minor_percent:percent((counts.clearly_usable??0)+(counts.usable_minor_missing??0),subset.length),wrong_unsafe_percent:percent(counts.wrong_unsafe??0,subset.length),ready:subset.filter(r=>r.readiness==='ready').length,proof_status:tally(subset.map(r=>r.proof_status)),repaired_fields:tally(subset.flatMap(r=>r.repaired_fields))};
  }
  const knownBad=details.filter(r=>r.prior_classification==='wrong_unsafe'),badReady=knownBad.filter(r=>r.readiness==='ready');
  const riskPattern=/source_country_conflicts_with_market|directory|editorial|social_post|unrelated_vendor|waitlist|past_event|open_state_after_deadline|source_date_and_state_contradiction/;
  const risky=details.filter(r=>r.prior_classification==='wrong_unsafe'||r.patterns.some(p=>riskPattern.test(p))),riskyReady=risky.filter(r=>r.readiness==='ready');
  const report={schema:'findpitches-source-verification-quality-v1',as_of:new Date().toISOString(),verifier_version:'source-proof-v1',direct_sources_checked:details.length,additional_serper_queries:0,
    legacy:metrics('legacy'),paid_pilot:metrics('paid_pilot'),source_family_controls:metrics('source_family_control'),known_unsafe:{sample_size:knownBad.length,promoted_ready:badReady.length,false_promotion_percent:percent(badReady.length,knownBad.length)},
    legacy_risk_patterns:{sample_size:risky.length,promoted_ready:riskyReady.length,false_promotion_percent:percent(riskyReady.length,risky.length)},
    repaired_fields:tally(details.flatMap(r=>r.repaired_fields)),source_mutations:mutations,original_receipts_checked:Object.keys(baseline.records).length,original_facts_checked:Object.keys(baseline.facts).length,
    customer_leakage:after.customer_rows,publication_leakage:after.publication_rows,paid_acquisition_enabled:after.serper.bulk_enabled,publication_enabled:after.publication_enabled,
    queries_before:before.provider_queries_completed,queries_after:after.provider_queries_completed,queue_health:after.jobs,verification_state:after.source_verification,
    method:'Re-score the same 120-entity diversity audit, all 10 original paid-pilot entities, and four additional existing entities per source family. Original URLs are fetched directly. No paid search. Earlier human-readable Codex audit labels are retained for unsafe discoveries unless repaired by source proof; withholding a record is not scored as repairing it. Source-family controls have no prior practical-quality score.',
    limitations:['Descriptive sample results, not population estimates or independent human gold labels.','Unavailable pages remain unverified. Generic visitor ticket and enquiry routes remain unproved vendor applications.','Immutable identity and higher-authority disagreements are held, not rewritten.'],details};
  fs.writeFileSync(path.join(outDirectory,'verification-quality-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
  try{const r=await verifyQuality({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')});console.log(JSON.stringify({legacy:r.legacy,paid_pilot:r.paid_pilot,source_family_controls:r.source_family_controls,known_unsafe:r.known_unsafe,source_mutations:r.source_mutations}));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'verification_quality_failed');process.exitCode=1;}
}
