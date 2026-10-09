// Read-only live UK catalogue audit; an explicit flag admits proved recoveries to shadow.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';
import {assessMk1Listing,summarizeMk1Document,mk1ApplicationRoutes} from '../../platform/findpitches-v3/mk1-audit.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function retainedUkLiteral(content) {
  const start=content.indexOf('{');let depth=0,quoted=false,escape=false;
  for(let i=start;i<content.length;i++){const c=content[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){const x=JSON.parse(content.slice(start,i+1));if(!Array.isArray(x.rows)||x.total!==x.rows.length||x.rows.some(r=>r.country!=='United Kingdom'||r.market_domain!=='pitchlist.uk'))throw Error('uk_only_catalogue_required');return x;}}
  throw Error('retained_uk_json_literal_required');
}
const tally=(rows,key)=>rows.reduce((out,r)=>(out[key(r)]=(out[key(r)]??0)+1,out),{});
// Offline document review can only withhold an import. It can never manufacture
// source facts, country, a positive practical grade or READY proof.
export function applyNegativeDocumentReview(assessment,document,review) {
  if(!review)return assessment;
  if(!['reference_only','not_current','questionable'].includes(review.grade)||!review.excerpt||!review.kind||!(/^[a-f0-9]{64}$/).test(review.sha256??'')||review.url!==document?.requested_url||review.sha256!==document?.content_sha256)throw Error('negative_document_review_custody_required');
  return {...assessment,grade:review.grade,kind:review.kind,reasons:['operator_reviewed_retained_pdf'],facts:{},field_evidence:{},document_review:{source:review.url,content_sha256:review.sha256,excerpt:review.excerpt}};
}
export async function auditLiveMk1({credentialsFile,stateDirectory,outDirectory,importGood=false,maximum=40}) {
  if(!Number.isInteger(maximum)||maximum<1||maximum>100)throw Error('bounded_mk1_import_limit_required');
  const root=path.resolve(outDirectory);fs.mkdirSync(root,{recursive:true,mode:0o700});fs.mkdirSync(root+'/direct-documents',{recursive:true,mode:0o700});
  const save=(f,x)=>fs.writeFileSync(root+'/'+f,JSON.stringify(x,null,2)+'\n',{mode:0o600});
  const {api,call,db}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');assertFreeGrowth(initial);
  const project=await api.accountRequest('/pages/projects/pitchlistuk'),deployment=project.canonical_deployment,gitRef=deployment?.deployment_trigger?.metadata?.commit_hash;
  if(!/^[a-f0-9]{40}$/.test(gitRef??'')||!project.domains.includes('pitchlist.uk'))throw Error('mk1_owned_production_deployment_required');
  const literal=retainedUkLiteral(execFileSync('git',['show',gitRef+':functions/_data/opportunities.mjs'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',maxBuffer:10485760})),snapshot={git_ref:gitRef,snapshots:{GB:literal}},snapshotHash=await hash(snapshot),live=await call('enrichment','/mk1/live-catalogue');
  const ids=new Set(literal.rows.map(r=>r.id));if(live.total!==literal.rows.length||live.rows.some(r=>!ids.has(r.id)))throw Error('mk1_live_snapshot_mismatch');
  save('deployed-snapshots-private.json',snapshot);save('live-preview-private.json',live);save('deployment-custody-private.json',{id:deployment.id,created_at:deployment.created_on,git_ref:gitRef,snapshot_sha256:snapshotHash});
  const documents=new Map(),visits=[],nextHost=new Map(),paused=new Set();
  async function visit(url) {
    const file=root+'/direct-documents/'+await hash(url)+'.json';let d;
    if(fs.existsSync(file)){const prior=JSON.parse(fs.readFileSync(file));if(Date.now()-Date.parse(prior.fetched_at)<86400000)d=prior;}
    if(!d){const host=new URL(url).hostname;if(paused.has(host))d={requested_url:url,url,fetched_at:new Date().toISOString(),reason:'source_host_rate_limit_respected'};else {const at=Math.max(Date.now(),nextHost.get(host)??0);nextHost.set(host,at+1500);if(at>Date.now())await delay(at-Date.now());d=await call('enrichment','/verification/document',{url});if(d.http_status===429)paused.add(host);}save('direct-documents/'+path.basename(file),d);}
    documents.set(url,d);visits.push({url,file,http_status:d.http_status??null,reason:d.reason??null,content_hash:d.content_hash??null,fetched_at:d.fetched_at});
    save('fetch-manifest-private.json',visits);return d;
  }
  const urls=[...new Set(literal.rows.flatMap(r=>[r.source_url,r.application_url]).filter(Boolean).map(u=>u.split('#')[0]))];let cursor=0;
  async function lane(){for(;;){const url=urls[cursor++];if(!url)return;await visit(url);}}
  const work=await Promise.allSettled([lane(),lane(),lane()]);const failure=work.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  // Retained binary receipts are operator-only read-only downloads. Source text is
  // reviewed offline; native admission never trusts an uploaded PDF interpretation.
  const attachmentFile=root+'/attachment-manifest-private.json',attachments=fs.existsSync(attachmentFile)?JSON.parse(fs.readFileSync(attachmentFile)):[];
  const reviewFile=root+'/approved-application-pdfs-private.json',reviews=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile)):[];
  if(!Array.isArray(reviews)||reviews.length>10||reviews.some(r=>!(/^[a-f0-9]{64}$/).test(r.sha256??'')||!r.url||!r.review_note))throw Error('explicit_current_application_pdf_reviews_required');
  const reviewedPdfHashes=reviews.map(r=>r.sha256);
  const negativeFile=root+'/negative-source-pdf-reviews-private.json',negativeReviews=fs.existsSync(negativeFile)?JSON.parse(fs.readFileSync(negativeFile)):[];
  if(!Array.isArray(negativeReviews)||negativeReviews.length>50)throw Error('bounded_negative_document_reviews_required');
  const negativeByUrl=new Map(negativeReviews.map(r=>[r.url,r]));
  for(const item of attachments)if(item.sha){const d=JSON.parse(fs.readFileSync(item.file));documents.set(d.requested_url.split('#')[0],d);}
  const assess=original=>{const source=documents.get(original.source_url.split('#')[0]);return {...applyNegativeDocumentReview(assessMk1Listing({original,source,documents,reviewedPdfHashes}),source,negativeByUrl.get(original.source_url.split('#')[0])),original};};
  let assessments=literal.rows.map(assess);
  const additional=new Set();for(const row of assessments.filter(r=>r.kind==='application_unavailable'))for(const app of mk1ApplicationRoutes(summarizeMk1Document(documents.get(row.original.source_url.split('#')[0]))))if(!documents.has(app.url.split('#')[0]))additional.add(app.url.split('#')[0]);
  if(additional.size>40)throw Error('mk1_additional_source_budget_exceeded');for(const url of additional)await visit(url);
  assessments=literal.rows.map(assess);save('assessments-private.json',assessments);
  const good=assessments.filter(r=>['clearly_usable','usable_minor_gaps'].includes(r.grade)),results=[];
  if(importGood&&good.length>maximum)throw Error('mk1_approved_import_budget_exceeded');
  let preservation=null;
  if(importGood) {
    const baselineFile=root+'/full-audit-preservation-baseline-private.json';
    const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile)):{as_of:initial.now,paid_queries:initial.commercial.kpis.paid_acquisition_queries,rows:await commercialRows(db),immutable:await immutableDigests(db)};
    save(path.basename(baselineFile),baseline);assertFreeGrowth(await call('api','/status'),baseline.paid_queries);
    for(const row of good){assertFreeGrowth(await call('api','/status'),baseline.paid_queries);const result=await call('enrichment','/mk1/verify-import',{market:'GB',audit_mode:'source_review',original:row.original,gitRef,snapshotHash,reviewedPdfHashes});results.push({id:row.id,grade:row.grade,...result});save('full-audit-import-progress-private.json',results);}
    for(let i=0;i<15;i++) {
      const due=(await db.prepare("SELECT stage,COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=? GROUP BY stage").bind(new Date().toISOString()).all()).results;
      if(!due.length)break;for(const stage of due)await call(stage.stage,'/tick',{limit:25});await delay(1000);if(i===14)throw Error('mk1_pipeline_not_settled');
    }
    const after=await commercialRows(db),end=await call('api','/status');assertFreeGrowth(end,baseline.paid_queries);
    const growth=growthOutcome(baseline.rows,after,{beforeAt:baseline.as_of,now:end.now}),mutations=sourceMutationCount(baseline.immutable,await immutableDigests(db));
    if(mutations||growth.identity_mutations||growth.missing_original_entities)throw Error('mk1_source_or_identity_preservation_failed');
    const linked=new Set(results.map(r=>r.entity_id).filter(Boolean)),prior=new Set(baseline.rows.map(r=>r.id)),cohort=after.filter(r=>linked.has(r.id)).map(r=>commercialEntity(r,end.now));
    preservation={source_mutations:mutations,identity_mutations:growth.identity_mutations,preserved_receipts:Object.keys(baseline.immutable.records).length,preserved_source_facts:Object.keys(baseline.immutable.facts).length,
      imported_receipts:results.filter(r=>r.record_id).length,linked_entities:linked.size,new_entities:[...linked].filter(id=>!prior.has(id)).length,matched_existing:[...linked].filter(id=>prior.has(id)).length,
      ready:cohort.filter(r=>r.ready).length,watch:cohort.filter(r=>r.watch).length,blocked:cohort.filter(r=>r.blocked).length,results,customer_rows:end.customer_rows,publication_rows:end.publication_rows,
      additional_paid_queries:end.commercial.kpis.paid_acquisition_queries-baseline.paid_queries,publication_enabled:end.publication_enabled};
  }
  const count=tally(assessments,r=>r.grade),fieldStats={};
  for(const field of ['event_name','organiser','location','event_start','event_end','application_url','application_deadline']){const corroborated=good.filter(r=>r.facts[field]);fieldStats[field]={recovered_source_values:corroborated.length,literal_preserved:corroborated.filter(r=>r.original[field]===r.facts[field]).length,source_backed_repairs_or_additions:corroborated.filter(r=>r.original[field]!==r.facts[field]).length};}
  const csv=['id,title,grade,kind,reasons,source_url,original_application_url,recovered_application_url,reviewed_source_pdf_excerpt',...assessments.map(r=>[r.id,r.original.event_name,r.grade,r.kind,r.reasons.join(';'),r.original.source_url,r.original.application_url,r.facts.application_url??'',r.document_review?.excerpt??''].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
  fs.writeFileSync(root+'/pitchlist-uk-full-audit.csv',csv,{mode:0o600});
  const finalProject=await api.accountRequest('/pages/projects/pitchlistuk');
  if(finalProject.canonical_deployment?.id!==deployment.id)throw Error('mk1_production_deployment_changed_during_audit');
  const report={schema:'findpitches-live-uk-full-audit-v1',as_of:new Date().toISOString(),customer_host:'pitchlist.uk',market:'GB',live_api_total:live.total,live_preview_rows:live.returned,live_preview_matches_build:true,deployment_id:deployment.id,git_ref:gitRef,snapshot_sha256:snapshotHash,
    production_deployment_unchanged:true,
    records_checked:assessments.length,original_urls_checked:urls.length,additional_source_urls_checked:additional.size,html_documents:visits.filter(r=>r.content_hash).length,fetch_reasons:tally(visits,r=>r.reason??'html_received'),
    pdf_attachments_reviewed:attachments.filter(r=>r.sha).length,application_pdf_reviews_approved:reviews.length,negative_source_pdf_reviews:negativeReviews.length,other_attachment_formats_held:attachments.filter(r=>r.reason).length,quality_counts:count,quality_percent:Object.fromEntries(Object.entries(count).map(([k,n])=>[k,Number((n*100/assessments.length).toFixed(2))])),dominant_review_categories:tally(assessments,r=>r.kind),field_preservation_and_repair:fieldStats,
    recovered:preservation,additional_paid_queries:0,mk1_writes:0,v2_writes:0,publication_enabled:false,
    limitations:['Deterministic source audit, not a claim of manual scoring for every page.','Questionable includes missing source-bound geography, bot challenges, dynamic/blocked sources and missing current editions. It does not mean proved junk.','Public live API preview is matched to the declared build catalogue; subscriber login and billing were not exercised.','Reference-only material can be useful supporting information but is not a proved trading opportunity.','No unsupported geography, open state, deadline or future edition is introduced to increase yield.']};
  save('full-audit-report.json',report);return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args={};for(let i=2;i<process.argv.length;i++){if(process.argv[i]==='--import-good')args.importGood=true;else args[process.argv[i]]=process.argv[++i];}
  try{const report=await auditLiveMk1({credentialsFile:args['--credentials'],stateDirectory:args['--state-dir'],outDirectory:args['--out-dir'],importGood:args.importGood??false,maximum:Number(args['--maximum']??40)});console.log(JSON.stringify(report));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'mk1_live_audit_failed');process.exitCode=1;}
}
