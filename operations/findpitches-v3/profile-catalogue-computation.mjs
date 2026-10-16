// One read-only proof snapshot; no raw records persisted. Compare CPU work on
// identical inputs, optionally against an operator-retained previous module.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as current from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {seoConfig} from '../../web/findpitches-v3-web/server/seo-edge.mjs';
import {shadowContext} from './shadow-context.mjs';

const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const output=get('--output'),credentialsFile=get('--credentials'),stateDirectory=get('--state-dir');
if(!output||!credentialsFile||!stateDirectory)throw Error('output_credentials_state_required');
const reference=get('--reference-module')?await import(pathToFileURL(get('--reference-module')).href):null;
const ctx=await shadowContext({credentialsFile,stateDirectory}),snapshot=await ctx.catalogue(),now=new Date().toISOString();
const rows=snapshot.items.map(i=>current.mapProof(i,now)).filter(Boolean);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report={schema:'findpitches-v3-catalogue-computation-profile-v1',as_of:now,rows:rows.length,
  snapshot_as_of:snapshot.as_of,reference_compared:Boolean(reference),parity_checks:0,results:[],passed:false,
  context:'Node local computation on one live proof snapshot; not Cloudflare Worker CPU or network latency',
  source_fetches:1,writes:0,serper_queries:0};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
const same=(a,b)=>{assert.deepEqual(a,b);report.parity_checks++;};
if(reference){
  same(rows,snapshot.items.map(i=>reference.mapProof(i,now)).filter(Boolean));
  for(const market of current.markets(rows)){
    same(current.regions(market.code,rows),reference.regions(market.code,rows));
    const region=current.regions(market.code,rows).find(r=>r.opportunity_count)?.id;
    for(const filters of [{},{types:'market,show'},{q:'unresolved place'},{q_text:'market'},
      {when:'30'},{when:'90'},{when:'xmas'},{when:'2027'},{month:'2026-12'},
      {sells:'food'},{organiser_types:['council']},...(region?[{region}]:[]),
      {page:2,page_size:1,sort:'az'},{sort:'recently_checked'}]){
      same(current.search(rows,{market:market.code,...filters},null,now),reference.search(rows,{market:market.code,...filters},null,now));
    }
  }
  same(current.homepage(rows,null,now),reference.homepage(rows,null,now));
}
for(const code of ['GB','US','FR','CA']){
  const intents=seoConfig.intentsFor(code),evaluate=m=>m.inventory(rows,code,intents,now);
  if(reference)same(evaluate(current),evaluate(reference));
  const item={market:code,intents:intents.length,output_hash:digest(evaluate(current)),samples:[]};
  // Alternate order to reduce warmup/order bias; bounded three paired samples.
  for(let n=0;n<3;n++)for(const [label,m] of (n%2?[['current',current],['reference',reference]]:[['reference',reference],['current',current]]))if(m){
    const start=performance.now();const result=evaluate(m),elapsed=performance.now()-start;
    assert.equal(digest(result),item.output_hash);item.samples.push({implementation:label,ms:Number(elapsed.toFixed(3))});
  }
  for(const label of ['reference','current']){const values=item.samples.filter(s=>s.implementation===label).map(s=>s.ms).sort((a,b)=>a-b);if(values.length)item[label+'_median_ms']=values[1];}
  report.results.push(item);save();
}
report.passed=true;report.completed_at=new Date().toISOString();save();console.log(JSON.stringify(report));
