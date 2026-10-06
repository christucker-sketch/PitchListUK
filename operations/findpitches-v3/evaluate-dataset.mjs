import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocalD1 } from './local-d1.mjs';
import { createSnapshot } from './snapshot.mjs';
import { compareSnapshots } from './compare.mjs';
import { ingestRecords,sql } from '../../platform/findpitches-v3/store.mjs';
import { drainPipeline } from '../../platform/findpitches-v3/pipeline.mjs';
import { hash } from '../../platform/findpitches-v3/contract.mjs';

export async function evaluateDataset({datasetDirectory,v2File=null,goldFile=null}) {
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),manifest=read(path.join(datasetDirectory,'manifest.json')),inputs=read(path.join(datasetDirectory,'inputs.json')).records;
  if(manifest.schema!=='findpitches-evaluation-dataset-v1'||manifest.inputs_hash!==await hash(inputs))throw new Error('evaluation_manifest_mismatch');
  const db=openLocalD1(),start=performance.now();let snapshot;
  try {
    const initial=await ingestRecords(db,inputs,{environment:'test',now:manifest.as_of});if(initial.rejected)throw new Error('evaluation_source_rejected');
    await drainPipeline(db,{now:manifest.as_of,limit:inputs.length*5+10});
    const before=(await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n;
    snapshot=await createSnapshot(db,inputs,{environment:'test',now:manifest.as_of,elapsedMs:Math.round(performance.now()-start)});
    const replay=await ingestRecords(db,inputs,{environment:'test',now:manifest.as_of});await drainPipeline(db,{now:manifest.as_of,limit:inputs.length*5+10});
    const after=(await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n;
    snapshot.runtime='isolated-node-sqlite';snapshot.metrics.replay={initial_entities:before,after_replay_entities:after,replay_inputs:inputs.length,inserted:replay.inserted,duplicates:replay.duplicates};
  } finally {db.close();}
  const report=await compareSnapshots(inputs,{v3:snapshot,v2:v2File?read(v2File):null,gold:goldFile?read(goldFile):null,manifest});
  fs.writeFileSync(path.join(datasetDirectory,'v3-snapshot.json'),JSON.stringify(snapshot,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(path.join(datasetDirectory,'comparison.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try{const report=await evaluateDataset({datasetDirectory:get('--dataset'),v2File:get('--v2'),goldFile:get('--gold')});console.log(JSON.stringify({inputs:report.inputs,comparable:report.comparable,source_field_retention:report.v3.source_field_retention,readiness_yield:report.v3.readiness_yield,replay_entity_growth:report.v3.replay_entity_growth,limitations:report.limitations}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
