// Read-only follow-up: source parsing is an audit observation, never a readiness claim.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
export async function verifyPilotSources({credentialsFile,stateDirectory,pilotId,outDirectory}) {
  const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  if(!await db.prepare('SELECT id FROM acquisition_pilots WHERE id=?').bind(pilotId).first())throw Error('owned_pilot_required');
  const records=(await db.prepare(`SELECT DISTINCT p.producer_record_id,p.market,p.normalized_json
    FROM pilot_run_grants g JOIN serper_run_records x ON x.run_id=g.run_id JOIN producer_records p ON p.id=x.record_id
    WHERE g.pilot_id=? ORDER BY p.producer_record_id LIMIT 40`).bind(pilotId).all()).results;
  const unique=new Map(records.map(row=>{const r=JSON.parse(row.normalized_json);return [r.canonical_url,{url:r.canonical_url,market:row.market}];}));
  const routes=[...unique.values()],pages=[],hostNext=new Map();let index=0;
  async function worker() {for(;;) {
    const i=index++;if(i>=routes.length)return;const route=routes[i],host=new URL(route.url).hostname;
    const at=Math.max(Date.now(),hostNext.get(host)??0);hostNext.set(host,at+1200);
    if(at>Date.now())await new Promise(r=>setTimeout(r,at-Date.now()));
    let page;try{page=await call('ingest','/legacy/refetch',{url:route.url});}catch{page={reason:'source_audit_fetch_failed'};}
    pages.push({...route,page});
  }}
  await Promise.all(Array.from({length:4},worker));
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(outDirectory,'pilot-sources-private.json'),JSON.stringify({as_of:new Date().toISOString(),pages},null,2)+'\n',{mode:0o600});
  const reasons={},kinds={},coverage={};
  for(const row of pages) {
    const p=row.page;reasons[p.reason??'parsed_source_evidence']=(reasons[p.reason??'parsed_source_evidence']??0)+1;
    if(p.kind)kinds[p.kind]=(kinds[p.kind]??0)+1;
    for(const field of ['event_name','organiser','location','event_start','application_url','source_country']) {
      coverage[field]??={present:0,missing:0};coverage[field][p.fields?.[field]?'present':'missing']++;
    }
  }
  const report={schema:'findpitches-pilot-source-audit-v1',as_of:new Date().toISOString(),pilot_id:pilotId,
    original_routes_checked:pages.length,maximum_routes:40,paid_queries:0,kinds,reasons,field_coverage:coverage,
    source_fields_overwritten:0,readiness_promotions:0,
    interpretation:'Direct original-source checks only. Parsed evidence does not independently prove event identity, source country, current edition or open applications. No source fields are changed or records promoted from these observations.'};
  fs.writeFileSync(path.join(outDirectory,'pilot-source-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{const report=await verifyPilotSources({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),pilotId:get('--pilot-id'),outDirectory:get('--out-dir')});console.log(JSON.stringify(report));}catch{console.error('pilot_source_audit_failed');process.exitCode=1;}
}
