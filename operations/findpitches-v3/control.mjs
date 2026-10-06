import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocalD1 } from './local-d1.mjs';
import { ingestRecords,sql,linkedEntity } from '../../platform/findpitches-v3/store.mjs';
import { drainPipeline,evaluateReadiness } from '../../platform/findpitches-v3/pipeline.mjs';
import { proposeFact } from '../../platform/findpitches-v3/evidence.mjs';
import { verifyStructuredControl } from '../../platform/findpitches-v3/control.mjs';
import { stableJson } from '../../platform/findpitches-v3/contract.mjs';
import { createSnapshot } from './snapshot.mjs';

export async function runPreservationControl(db,records,{environment='test',now=new Date().toISOString(),progress=()=>{}}={}) {
  const input=structuredClone(records),baseline=stableJson(input);
  const imported=await ingestRecords(db,input,{environment,now});
  if(imported.accepted!==100||imported.rejected)throw new Error('100_accepted_records_required:'+stableJson(imported.errors));
  progress('100 records accepted');
  await drainPipeline(db,{now});
  progress('Four stages completed');
  for(const recordId of imported.record_ids) {
    const entity=await linkedEntity(db,recordId);
    if(!entity)throw new Error('control_record_not_reconciled');
    for(const [field,value] of Object.entries({event_name:'Generic vendor application page',organiser:null,location:'restriction, or other reasons',application_url:'https://www.eventeny.com/events/applications/'})) {
      if(entity[field]!==null&&entity[field]!==undefined)await proposeFact(db,entity.id,{field,value,kind:'extracted_page',source_url:'https://www.eventeny.com/events/applications/',excerpt:'Generic page extraction must not replace precise producer-backed facts'},{now});
    }
    await evaluateReadiness(db,entity.id,{now});
  }
  if(stableJson(input)!==baseline)throw new Error('control_input_mutated');
  progress('Adversarial proposals completed');
  const report=await verifyStructuredControl(db,input,imported.record_ids,{now});
  const before=(await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n;
  const replay=await ingestRecords(db,input,{environment,now});
  await drainPipeline(db,{now});
  if(replay.inserted!==0||replay.duplicates!==100||(await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n!==before)throw new Error('control_replay_not_idempotent');
  return {...report,replay_duplicates:replay.duplicates,replay_new_entities:0,record_ids:imported.record_ids};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const input=JSON.parse(fs.readFileSync(option('--input',new URL('../../tests/findpitches-v3/fixtures/structured-control-100.json',import.meta.url)),'utf8'));
  const db=openLocalD1(option('--database',':memory:'));
  try {const started=Date.now(),now=new Date().toISOString(),report=await runPreservationControl(db,input.records??input,{now});const output=option('--report',null);if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');const snapshot=option('--snapshot',null);if(snapshot)fs.writeFileSync(snapshot,JSON.stringify(await createSnapshot(db,input.records??input,{now,elapsedMs:Date.now()-started}),null,2)+'\n');console.log(JSON.stringify({...report,record_ids:undefined},null,2));}
  finally {db.close();}
}
