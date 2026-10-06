import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';
import {supportedTradingHeading} from '../../platform/findpitches-v3/legacy.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {LEGACY_RULES_VERSION} from './legacy-recovery.mjs';

export async function qualifyLegacyRecovery({credentialsFile,stateDirectory,recoveryDirectory,now=new Date().toISOString()}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),baseline=JSON.parse(fs.readFileSync(path.join(recoveryDirectory,'v3-entity-baseline.json')));
  const db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state);
  const rows=(await db.prepare('SELECT legacy_id,record_id FROM legacy_recovery_records WHERE run_id=? AND record_id IS NOT NULL').bind(baseline.run_id).all()).results;
  const held=[];
  for(const row of rows) {
    const entry=JSON.parse(fs.readFileSync(path.join(recoveryDirectory,'entries-'+LEGACY_RULES_VERSION,row.legacy_id+'.json')));
    const kind=entry.record.field_evidence?.event_name?.kind;
    if(!['direct_heading','retained_excerpt'].includes(kind)||supportedTradingHeading(entry.record.event_name,{retained:kind==='retained_excerpt'}))continue;
    await db.prepare(`INSERT OR IGNORE INTO legacy_quality_holds(record_id,rules_version,reason,created_at)
      SELECT id,'heading-qualification-v2','source_heading_requires_trading_event_qualification',? FROM producer_records
      WHERE id=? AND producer_name='legacy_v2' AND environment='shadow'`).bind(now,row.record_id).run();
    held.push(row.record_id);
  }
  const entities=new Set();
  for(const id of held) {
    const linked=await db.prepare("SELECT e.id,e.revision FROM entity_records r JOIN entities e ON e.id=r.entity_id WHERE r.record_id=? AND e.environment='shadow'").bind(id).first();
    if(linked&&!entities.has(linked.id)) {
      entities.add(linked.id);
      const key=linked.id+':'+linked.revision+':heading-qualification-v2';
      await enqueue(db,'eligibility',key,{entity_id:linked.id},now);
      await enqueue(db,'readiness',key,{entity_id:linked.id},now);
    }
  }
  return {schema:'findpitches-legacy-source-qualification-v1',as_of:now,run_id:baseline.run_id,records_checked:rows.length,
    quality_holds:held.length,linked_entities_scheduled_for_review:entities.size,evidence_deleted:0,source_field_mutations:0,
    rules_version:'heading-qualification-v2',strong_structured_and_direct_event_evidence_excluded:true,paid_search_queries_issued:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await qualifyLegacyRecovery({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),recoveryDirectory:get('--recovery-dir')});fs.writeFileSync(get('--out'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));}
  catch {console.error('legacy_source_qualification_failed');process.exitCode=1;}
}
