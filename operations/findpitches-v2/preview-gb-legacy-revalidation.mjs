#!/usr/bin/env node
import fs from 'node:fs';
import {opportunitySnapshot} from '../../functions/_data/opportunities.mjs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';
import {enabledGeographies} from '../../platform/findpitches-v2/geography/catalog.mjs';

const ready=(Array.isArray(opportunitySnapshot?.rows)?opportunitySnapshot.rows:[]).filter(r=>r.quality_status==='customer_ready'||r.publishable===true);
const geos=enabledGeographies('GB');
const selected=spread(ready,24);
const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];
for(const old of selected){
 const hint=String(old.county||old.region||old.location||'').trim();
 const geo=matchGeo(hint);
 const source=firstUrl(old.application_url,old.canonical_url,old.source_url,old.url);
 if(!source||!geo){outcomes.push({legacy_title:old.title||old.event_name||null,status:'unmappable',hint,source});continue;}
 try{
  const evaluated=await evaluator({market:getMarket('GB'),region_code:geo.code,location:geo.name,result:{url:source,title:old.title||old.event_name||null}});
  let practical=null,enrichment=null;
  if(evaluated.status==='validated'){
   const legacyLocation=String(old.location||'').trim();
   const locality=legacyLocation&&norm(legacyLocation)!==norm(geo.name)?legacyLocation:null;
   const geography={country_code:'GB',region_code:geo.code,region:geo.name,...(locality?{locality}:{})};
   enrichment=(await previewCandidateEnrichment({...evaluated,canonical_url:evaluated.canonical_url,application_url:evaluated.application_url,geography},{fetchProvider})).enrichment;
   practical=projectPracticalOpportunity({...evaluated,region_code:geo.code,geography,last_checked:new Date().toISOString()},enrichment,{now:new Date()});
  }
  outcomes.push({legacy_title:old.title||old.event_name||null,legacy_location:old.location||null,region_code:geo.code,source,status:evaluated.status,rejection_reason:evaluated.rejection_reason,score:evaluated.score,practical_usable:Boolean(practical?.readiness?.ready),recovered_location:practical?.opportunity?.location??null,location_precision:practical?.opportunity?.location_precision??null,blocked:practical?.readiness?.blocked??[],missing:practical?.readiness?.missing??[]});
 }catch(error){outcomes.push({legacy_title:old.title||old.event_name||null,legacy_location:old.location||null,region_code:geo.code,source,status:'error',error:String(error?.message||error).slice(0,180)});}
}
const summary={at:new Date().toISOString(),legacy_ready_total:ready.length,sampled:outcomes.length,validated:outcomes.filter(x=>x.status==='validated').length,rejected:outcomes.filter(x=>x.status==='rejected').length,held:outcomes.filter(x=>x.status==='held').length,errors:outcomes.filter(x=>x.status==='error').length,unmappable:outcomes.filter(x=>x.status==='unmappable').length,practical_usable:outcomes.filter(x=>x.practical_usable).length,location_precision:countBy(outcomes.filter(x=>x.practical_usable),'location_precision')};
fs.writeFileSync('gb-legacy-revalidation-preview.json',JSON.stringify({summary,outcomes},null,2));
console.log(JSON.stringify(summary,null,2));

function matchGeo(value){const n=norm(value);if(!n)return null;return geos.find(g=>[g.name,...(g.aliases||[])].some(v=>norm(v)===n))||null;}
function firstUrl(...values){for(const v of values){try{const u=new URL(String(v||''));if(/^https?:$/.test(u.protocol))return u.toString();}catch{}}return null;}
function norm(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function spread(rows,n){if(rows.length<=n)return rows;const out=[];for(let i=0;i<n;i++)out.push(rows[Math.floor(i*(rows.length-1)/Math.max(1,n-1))]);return [...new Map(out.map(x=>[x.id||x.canonical_url||x.application_url||JSON.stringify(x),x])).values()];}
function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}