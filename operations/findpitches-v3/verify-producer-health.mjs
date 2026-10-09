import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {deliverExport,acknowledgeDeliveredRechecks,fetchRechecks} from './producer-delivery.mjs';
import {stableJson,hash} from '../../platform/findpitches-v3/contract.mjs';

export async function verifyProducerHealth(options) {
  const {db,state,call,fetcher,ingestToken}=await shadowContext(options),out=options.outDirectory;
  fs.mkdirSync(out,{recursive:true,mode:0o700});const prefix='delivery-probe-'+crypto.randomUUID(),firstChecked=new Date(Date.now()-3600000).toISOString();
  const unique=prefix.replaceAll('-','');
  const first={schema_version:'findpitches-discovery-export-v1',opportunity_id:prefix+'-alpha',country_code:'GB',event_name:'Cedar'+unique+' Diagnostic Bazaar',organiser:'Diagnostic Fixture',location:'Cedar Example Hall',event_start:'2027-11-20',canonical_url:'https://delivery-probe.example/'+prefix+'/cedar',application_url:'https://delivery-probe.example/'+prefix+'/cedar',application_state:'OPEN_NOW',lifecycle_event:'NEW',channel:'current',export_readiness:'READY',last_checked:firstChecked,evidence:[{source:'https://delivery-probe.example/'+prefix+'/cedar',excerpt:'TEST SCOPE ONLY: diagnostic applications open.'}],provenance:[{diagnostic:true}]};
  const file=path.join(out,'delivery-test-export.json');fs.writeFileSync(file,JSON.stringify({records:[first]}),{mode:0o600});
  const deliver=checkpoint=>deliverExport({inputFile:file,ingestUrl:state.urls.ingest,token:ingestToken,checkpointFile:path.join(out,checkpoint),environment:'test',fetcher});
  const started=Date.now(),initial=await deliver('initial.json');
  async function settled(ids){const deadline=Date.now()+180000;for(;;){const rows=(await db.prepare(`SELECT p.id AS record_id,er.entity_id,r.status,r.entity_revision,e.revision FROM producer_records p JOIN entity_records er ON er.record_id=p.id JOIN reconciliation_decisions d ON d.record_id=p.id AND d.entity_id=er.entity_id JOIN entities e ON e.id=er.entity_id JOIN readiness r ON r.entity_id=e.id WHERE p.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all()).results;if(rows.length===ids.length&&rows.every(r=>r.entity_revision===r.revision))return rows;if(Date.now()>deadline)throw Error('producer_probe_pipeline_timeout');await new Promise(r=>setTimeout(r,2000));}}
  const firstId=initial.results[0].record_ids[0],linked=(await settled([firstId]))[0];
  const oldReceipt=await db.prepare('SELECT * FROM producer_records WHERE id=?').bind(firstId).first(),oldFacts=(await db.prepare('SELECT * FROM source_facts WHERE record_id=? ORDER BY field_name').bind(firstId).all()).results;
  const replay=await deliver('replay.json'),checkpointReplay=await deliver('replay.json');
  if(replay.inserted||replay.duplicates!==1||checkpointReplay.next_batch!==1)throw Error('unchanged_export_not_idempotent');
  const before=await db.prepare('SELECT COUNT(DISTINCT er.entity_id) AS entities FROM producer_records p JOIN entity_records er ON er.record_id=p.id WHERE p.producer_record_id=? AND p.environment=\'test\'').bind(first.opportunity_id).first();
  if(before.entities!==1)throw Error('replayed_export_created_duplicate_entities');
  const changed={...first,application_state:'CLOSED_CURRENT_CYCLE',lifecycle_event:'UNCHANGED',channel:'watch',export_readiness:'WATCH',last_checked:new Date().toISOString(),evidence:[{source:first.canonical_url,excerpt:'TEST SCOPE ONLY: newer diagnostic evidence closes applications.'}]};
  const newRecord={...first,opportunity_id:prefix+'-beta',event_name:'Quartz'+unique+' Fixture Expo',location:'Quartz Example Pavilion',canonical_url:'https://delivery-probe.example/'+prefix+'/quartz',application_url:'https://delivery-probe.example/'+prefix+'/quartz',evidence:[{source:'https://delivery-probe.example/'+prefix+'/quartz',excerpt:'TEST SCOPE ONLY: diagnostic Quartz applications open.'}]};
  fs.writeFileSync(file,JSON.stringify({records:[changed,newRecord]}),{mode:0o600});const updates=await deliver('updates.json'),updateIds=updates.results[0].record_ids,advance=await settled(updateIds);
  const changedLink=advance.find(r=>r.record_id===updateIds[0]),newLink=advance.find(r=>r.record_id===updateIds[1]);
  if(changedLink.entity_id!==linked.entity_id||newLink.entity_id===linked.entity_id)throw Error('changed_or_new_identity_failed');
  const selected=await db.prepare("SELECT value_json FROM selected_facts WHERE entity_id=? AND field_name='application_state'").bind(linked.entity_id).first();if(selected.value_json!=='"CLOSED"')throw Error('newer_lifecycle_evidence_not_advanced');
  const afterReceipt=await db.prepare('SELECT * FROM producer_records WHERE id=?').bind(firstId).first(),afterFacts=(await db.prepare('SELECT * FROM source_facts WHERE record_id=? ORDER BY field_name').bind(firstId).all()).results;
  if(stableJson(oldReceipt)!==stableJson(afterReceipt)||stableJson(oldFacts)!==stableJson(afterFacts)||await hash(afterReceipt.raw_json)!==afterReceipt.content_hash)throw Error('producer_source_mutated');
  // Use an already-pending real producer recheck. Do not manufacture a fresh source timestamp.
  const requests=await fetchRechecks({ingestUrl:state.urls.ingest,token:ingestToken,fetcher,probe:true});
  let stale,old;
  for(const request of requests.filter(r=>r.environment==='shadow')) {
    const receipt=await db.prepare(`SELECT p.normalized_json FROM producer_records p JOIN entity_records er ON er.record_id=p.id WHERE p.producer_name='independent-structured' AND p.environment='shadow' AND p.validation_status='accepted' AND p.producer_record_id=? AND er.entity_id=? ORDER BY julianday(json_extract(p.normalized_json,'$.last_checked')) DESC,p.received_at DESC LIMIT 1`).bind(request.producer_record_id,request.entity_id).first();
    const record=receipt?JSON.parse(receipt.normalized_json):null;
    if(record&&Number.isFinite(Date.parse(record.last_checked))&&Date.parse(record.last_checked)<Date.parse(request.requested_at)){stale=request;old=record;break;}
  }
  if(!stale)throw Error('stale_linked_accepted_source_fixture_required');
  const staleDelivery={environment:'shadow',ingest_origin:state.urls.ingest,results:[{rejected:0,producer_record_ids:[stale.producer_record_id],last_checked_by_producer:{[stale.producer_record_id]:old.last_checked}}]};
  const client=await acknowledgeDeliveredRechecks({requests:[stale],delivery:staleDelivery,token:ingestToken,fetcher}),server=await call('ingest','/rechecks/ack',{entity_id:stale.entity_id,requested_at:stale.requested_at,producer_record_id:stale.producer_record_id},{ingest:true});
  if(client.acknowledged||server.acknowledged)throw Error('stale_source_cleared_recheck');
  const status=await call('api','/status');if(status.customer_rows||status.publication_rows||status.publication_enabled||status.serper.bulk_enabled)throw Error('producer_probe_scope_leakage');
  const work=await db.prepare(`SELECT COUNT(*) AS due_jobs,MIN(available_at) AS oldest_due FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?`).bind(new Date().toISOString()).first();
  const result={schema:'findpitches-continuous-producer-health-v1',as_of:new Date().toISOString(),source_scope:'Synthetic diagnostic records exist only in test scope; real original producer receipts are audited separately.',unchanged_server_replay:{inserted:replay.inserted,duplicates:replay.duplicates,entity_growth:before.entities-1},unchanged_checkpoint_replay:true,changed_record_advanced:true,new_record_advanced:true,automatic_pipeline_elapsed_ms:Date.now()-started,source_mutations:0,stale_recheck:{client_acknowledged:client.acknowledged,server_acknowledged:server.acknowledged,pending:true},cloud_delivery:status.structured_delivery,queue:work,customer_rows:status.customer_rows,publication_rows:status.publication_rows,bulk_enabled:false};
  fs.writeFileSync(path.join(out,'producer-health-report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];try{console.log(JSON.stringify(await verifyProducerHealth({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')})));}catch(error){console.error(error.message.match(/^[a-z0-9_]+$/)?error.message:'producer_health_validation_failed');process.exitCode=1;}}
