// Bounded salvage from the retained Mk1 catalogue: source proof supplies all facts.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';
import {mk1ProofRecord} from '../../platform/findpitches-v3/mk1-source.mjs';
export {mk1ProofRecord};
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';

export async function harvestMk1Proof({credentialsFile,stateDirectory,auditDirectory,maximum=40}) {
  if(!Number.isInteger(maximum)||maximum<1||maximum>40)throw Error('mk1_harvest_limit_1_to_40_required');
  const root=path.resolve(auditDirectory),snapshot=JSON.parse(fs.readFileSync(path.join(root,'deployed-snapshots-private.json'))),snapshotHash=await hash(snapshot);
  // The shared repository also has international snapshots: those are not Pitchlist Mk1.
  const inspections=['direct-sample-private.json','direct-rest-private.json'].filter(f=>fs.existsSync(path.join(root,f))).flatMap(f=>JSON.parse(fs.readFileSync(path.join(root,f))).results).filter(r=>r.market==='GB');
  const {db,call}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');assertFreeGrowth(initial);
  const save=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const inputs=[];
  for(const visit of inspections.filter(r=>r.proof_status==='verified'&&!r.country_mismatch)) {
    if(!path.resolve(visit.file).startsWith(root+'/direct-documents/'))throw Error('mk1_owned_document_path_required');
    const original=snapshot.snapshots[visit.market].rows.find(r=>(r.id??r.stable_id)===visit.id);
    if(!original||await hash(original)!==visit.original_row_hash)throw Error('mk1_original_row_hash_mismatch');
    const document=JSON.parse(fs.readFileSync(visit.file)),prepared=await mk1ProofRecord({market:visit.market,original,document,gitRef:snapshot.git_ref,snapshotHash});
    if(prepared.record)inputs.push({visit,original,document,record:prepared.record});
  }
  if(inputs.length>maximum)throw Error('mk1_proved_import_budget_exceeded');
  const baselineFile=path.join(root,'harvest-baseline-private.json');
  const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile)):{as_of:initial.now,rows:await commercialRows(db),immutable:await immutableDigests(db),paid_queries:initial.commercial.kpis.paid_acquisition_queries};
  assertFreeGrowth(initial,baseline.paid_queries);save('harvest-baseline-private.json',baseline);
  const results=[];
  for(const item of inputs) {
    const s=await call('api','/status');assertFreeGrowth(s,baseline.paid_queries);
    const outcome=await call('enrichment','/mk1/verify-import',{market:item.visit.market,original:item.original,gitRef:snapshot.git_ref,snapshotHash});
    outcome.id=item.visit.id;outcome.source_url=item.visit.url;outcome.market=item.visit.market;
    results.push(outcome);save('harvest-progress-private.json',results);
  }
  for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{limit:10});
  const final=await call('api','/status');assertFreeGrowth(final,baseline.paid_queries);
  const rows=await commercialRows(db),asOf=new Date().toISOString(),growth=growthOutcome(baseline.rows,rows,{beforeAt:baseline.as_of,now:asOf}),mutations=sourceMutationCount(baseline.immutable,await immutableDigests(db));
  if(mutations||growth.identity_mutations||growth.missing_original_entities)throw Error('mk1_preservation_failure');
  const ids=new Set(results.map(r=>r.entity_id).filter(Boolean)),priorIds=new Set(baseline.rows.map(r=>r.id)),priorReady=new Set(baseline.rows.map(r=>commercialEntity(r,baseline.as_of)).filter(r=>r.ready).map(r=>r.id)),cohort=rows.map(r=>commercialEntity(r,asOf)).filter(r=>ids.has(r.id));
  const report={schema:'findpitches-mk1-proof-harvest-v1',as_of:asOf,market:'GB',customer_host:'pitchlist.uk',git_ref:snapshot.git_ref,snapshot_sha256:snapshotHash,source_routes_checked:inspections.length,verified_source_records:inputs.length,
    held_source_inspections:inspections.length-inputs.length,linked_entities:ids.size,new_entities:[...ids].filter(id=>!priorIds.has(id)).length,matched_existing:[...ids].filter(id=>priorIds.has(id)).length,
    ready:cohort.filter(r=>r.ready).length,new_ready:cohort.filter(r=>r.ready&&!priorReady.has(r.id)).length,source_mutations:mutations,identity_mutations:growth.identity_mutations,
    preserved_receipts:Object.keys(baseline.immutable.records).length,preserved_source_facts:Object.keys(baseline.immutable.facts).length,paid_queries_added:final.commercial.kpis.paid_acquisition_queries-baseline.paid_queries,
    customer_rows:final.customer_rows,publication_rows:final.publication_rows,publication_enabled:final.publication_enabled,results,
    attribution:'Current proved facts use platform-catalogue with immutable legacy_mk1 discovery provenance. Historical Mk1 fields establish no readiness, country, dates or open-state proof.'};
  save('harvest-report.json',report);return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
  try{console.log(JSON.stringify(await harvestMk1Proof({credentialsFile:args['--credentials'],stateDirectory:args['--state-dir'],auditDirectory:args['--audit-dir'],maximum:Number(args['--maximum']??40)})));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'mk1_proof_harvest_failed');process.exitCode=1;}
}
