import {MARKETS,REGIONS} from '../../web/findpitches-v3-web/server/catalogue-registry.mjs';
import {toSiteOpportunity} from '../../web/findpitches-v3-web/contract/reference/map-producer-record.mjs';
import {routes} from '../../web/findpitches-v3-web/server/seo-edge.mjs';
import {budgetDay} from './serper-usage.mjs';
import {publicHttps,hash} from './contract.mjs';
import {customerError,stmt} from './customer-security.mjs';

export const types={christmas_market:'Christmas market',holiday_market:'Holiday market',food_festival:'Food festival',festival:'Festival',market:'Market',street_trading:'Street trading',show:'Show',concession:'Concession',event:'Event',sport:'Sports & stadiums'};
export const marketOf=code=>{const m=MARKETS.find(m=>m.code===code);if(!m)throw customerError('unknown_market',404);return m;};
export const allRegions=market=>Object.values(REGIONS[market]??{});
export function ancestors(market,id) {const out=[];let r=REGIONS[market]?.[id];while(r){out.unshift(r);r=REGIONS[market]?.[r.parent_id];}return out;}
const norm=value=>String(value??'').normalize('NFKC').toLowerCase();
function proofRegion(item) {
  const regs=allRegions(item.country),byCode=item.region?regs.find(r=>r.code&&(r.code===item.region||r.code===item.country+'-'+item.region)):null;
  if(byCode)return byCode;
  // Literal region in retained verified location, never a town→county guess.
  const matches=regs.filter(r=>new RegExp('(^|[^a-z])'+r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)').test(norm(item.location)));
  const specific=matches.filter(r=>!matches.some(s=>s.parent_id===r.id));return specific.length===1?specific[0]:null;
}
export function mapProof(item,now) {
  if(!/^ent_[a-f0-9]{32}$/.test(item.id)||!MARKETS.some(m=>m.code===item.country)||!item.title||!item.organiser||!item.location||!publicHttps(item.application_url)||!Number.isFinite(Date.parse(item.proof_expires_at))||!Number.isFinite(Date.parse(item.verified_at))||Date.parse(item.proof_expires_at)<=Date.parse(now)||Date.parse(item.verified_at)>Date.parse(now))return null;
  const today=budgetDay(now),row=toSiteOpportunity({opportunity_id:item.id,country_code:item.country,event_name:item.title,organiser:item.organiser,location:item.location,event_start:item.event_start?.slice(0,10),event_end:item.event_end?.slice(0,10),application_deadline:item.application_deadline?.slice(0,10),application_state:item.application_state,
    source_url:publicHttps(item.source_url)?item.source_url:null,application_url:item.application_url,last_checked:item.verified_at,opportunity_type:item.opportunity_type,vendor_categories:item.vendor_categories},today);
  if(['ended','closed','unknown'].includes(row.application.status))return null;
  const region=proofRegion(item);row.location={...row.location,region:item.region,region_id:region?.id??null,region_name:region?.name??null};
  row.organiser.verified=true;row.organiser.type_label=null;row.type_label=types[row.type]??'Event';row.canonical_path=routes.opportunityPath(row.market,row.id);row.distance_km=null;
  row._proof={expires_at:item.proof_expires_at,revision:item.entity_revision,verification_id:item.verification_id};return row;
}
export async function readCatalogue(env,now) {
  if(!env.V3_READY_API||!env.V3_STAGING_TOKEN)throw customerError('service_unavailable',503);
  const response=await env.V3_READY_API.fetch('https://v3-internal.invalid/staging/catalogue',{headers:{Authorization:'Bearer '+env.V3_STAGING_TOKEN}});
  if(!response.ok)throw customerError('service_unavailable',503);const snapshot=await response.json();
  if(snapshot.schema!=='findpitches-v3-customer-proof-snapshot-v1'||snapshot.publication_enabled!==false||snapshot.production_cutover_enabled!==false||!Array.isArray(snapshot.items)||snapshot.items.length>20000||!Number.isFinite(Date.parse(snapshot.as_of))||Math.abs(Date.parse(snapshot.as_of)-Date.parse(now))>120000)throw customerError('service_unavailable',503);
  return {...snapshot,rows:snapshot.items.map(i=>mapProof(i,now)).filter(Boolean)};
}
export function present(row,access={tier:'free'}) {
  access??={tier:'free'};
  const {_restricted,_proof,confidence,...out}=row,entitled=['pro','trial'].includes(access.tier)&&access.market===row.market;
  return {...out,access:entitled?{locked:false,..._restricted}:{locked:true,source_domain_hint:_restricted.source_domain?.match(/\.[a-z]+$/)?.[0]??null,source_url:null,application_url:null},is_current:true};
}
export function regions(market,rows) {marketOf(market);return allRegions(market).map(r=>({...r,code:r.code??null,opportunity_count:rows.filter(o=>o.market===market&&ancestors(market,o.location.region_id).some(x=>x.id===r.id)).length}));}
export function markets(rows) {return MARKETS.map(m=>({...m,opportunity_count:rows.filter(o=>o.market===m.code).length,search:{radius:false,region:allRegions(m.code).length>0,geocoder:'none'}}));}
export function resolveLocation(market,q) {
  marketOf(market);if(!q)return {kind:'none',label:null};if(typeof q!=='string'||q.length>200)throw customerError('validation');
  const match=allRegions(market).find(r=>[r.id,r.name,r.slug,r.code].some(x=>x&&norm(x)===norm(q)));
  return match?{kind:'region',label:match.name,region_id:match.id,region_code:match.code??null}:{kind:'unresolved',label:q};
}
const csv=value=>Array.isArray(value)?value:typeof value==='string'?value.split(',').filter(Boolean):[];
export function search(rows,p,access,now) {
  const market=marketOf(p.market),location=resolveLocation(market.code,p.region??p.q),today=budgetDay(now);
  for(const k of ['q_text','q','region','month','when','sort'])if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>200))throw customerError('validation');
  if(p.radius_km&&p.radius_km!=='any'||p.sort==='nearest')throw customerError('radius_unavailable',400);
  if(p.region&&location.kind!=='region')throw customerError('validation');
  let list=rows.filter(o=>o.market===market.code);
  if(location.kind==='region')list=list.filter(o=>ancestors(o.market,o.location.region_id).some(r=>r.id===location.region_id));
  else if(p.q)list=list.filter(o=>norm(o.location.label).includes(norm(p.q)));
  if(p.q_text)list=list.filter(o=>norm([o.title,o.location.label,o.organiser.name].join(' ')).includes(norm(p.q_text)));
  if(p.sells)list=list.filter(o=>o.sells.includes(p.sells));
  if(csv(p.organiser_types).length)list=list.filter(o=>csv(p.organiser_types).includes(o.organiser.type));
  if(p.month){if(!/^\d{4}-\d{2}$/.test(p.month))throw customerError('validation');list=list.filter(o=>o.dates.start?.slice(0,7)===p.month);}
  if(p.when){const end=new Date(today+'T12:00:00Z');if(['30','90'].includes(p.when)){end.setUTCDate(end.getUTCDate()+Number(p.when));list=list.filter(o=>o.dates.start&&o.dates.start<=end.toISOString().slice(0,10)&&(o.dates.end??o.dates.start)>=today);}else if(p.when==='xmas')list=list.filter(o=>o.dates.start?.slice(0,4)===today.slice(0,4)&&['11','12'].includes(o.dates.start.slice(5,7)));else if(/^20\d{2}$/.test(p.when))list=list.filter(o=>o.dates.start?.slice(0,4)===p.when);else throw customerError('validation');}
  const counts=(items,key)=>{const out={};for(const item of items){const value=key(item);if(value)out[value]=(out[value]??0)+1;}return out;};
  const facets={types:counts(list,o=>o.type),unclassified_types:list.filter(o=>!o.type).length,months:counts(list,o=>o.dates.start?.slice(0,7)),undated:list.filter(o=>!o.dates.start).length,regions:Object.fromEntries(regions(market.code,list).map(r=>[r.id,r.opportunity_count]))};
  if(csv(p.types).length)list=list.filter(o=>csv(p.types).includes(o.type));
  const sort=p.sort??'soonest';if(!['soonest','recently_checked','az'].includes(sort))throw customerError('validation');
  list.sort((a,b)=>(sort==='az'?a.title.localeCompare(b.title):sort==='recently_checked'?String(b.checked.last_checked??'').localeCompare(a.checked.last_checked??''):String(a.dates.start??'9999').localeCompare(b.dates.start??'9999'))||a.id.localeCompare(b.id));
  const page=Number(p.page??1),size=Number(p.page_size??25);if(!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(size)||size<1||size>100)throw customerError('validation');
  return {market:market.code,market_status:market.launch_status,coverage:rows.some(o=>o.market===market.code)?'available':'none',location,total:list.length,page,page_size:size,sort,next_start:list.map(o=>o.dates.start).filter(d=>d&&d>=today).sort()[0]??null,results:list.slice((page-1)*size,page*size).map(o=>present(o,access)),facets,map_points:[]};
}
export function inventory(rows,market,intents,now) {
  marketOf(market);if(!Array.isArray(intents)||intents.length>30)throw customerError('validation');
  const out={market,generated_at:now,market_total:rows.filter(o=>o.market===market).length,intents:{},regions:Object.fromEntries(regions(market,rows).filter(r=>r.opportunity_count).map(r=>[r.id,r.opportunity_count])),combos:{}};
  for(const i of intents){if(typeof i.key!=='string'||!/^[a-z-]{1,50}$/.test(i.key)||!i.filters||typeof i.filters!=='object')throw customerError('validation');out.intents[i.key]=search(rows,{...i.filters,market},null,now).total;for(const region of Object.keys(out.regions)){const n=search(rows,{...i.filters,market,region},null,now).total;if(n)out.combos[i.key+'|'+region]=n;}}
  return out;
}
export async function recordInventoryChanges(db,rows,now) {
  const state=(await stmt(db,'SELECT * FROM preview_inventory_state').all()).results,map=new Map(state.map(r=>[r.entity_id,r])),statements=[];
  const work=[];
  for(const row of rows){const {_proof,...facts}=row,digest=await hash(facts),old=map.get(row.id);map.delete(row.id);if(old?.payload_hash===digest&&old.visible){if(old.proof_expires_at!==_proof.expires_at)work.push([stmt(db,'UPDATE preview_inventory_state SET proof_expires_at=?,updated_at=? WHERE entity_id=?',_proof.expires_at,now,row.id)]);continue;}
    work.push([stmt(db,`INSERT INTO preview_inventory_state VALUES (?,?,1,?,?) ON CONFLICT(entity_id) DO UPDATE SET payload_hash=excluded.payload_hash,visible=1,proof_expires_at=excluded.proof_expires_at,updated_at=excluded.updated_at WHERE preview_inventory_state.payload_hash<>excluded.payload_hash OR preview_inventory_state.visible=0`,row.id,digest,row._proof.expires_at,now),
      stmt(db,'INSERT INTO preview_inventory_changes(entity_id,kind,occurred_at) SELECT ?,?,? WHERE changes()=1',row.id,old?'updated':'inserted',now)]);}
  for(const old of map.values())if(old.visible)work.push([stmt(db,'UPDATE preview_inventory_state SET visible=0,updated_at=? WHERE entity_id=? AND visible=1',now,old.entity_id),stmt(db,"INSERT INTO preview_inventory_changes(entity_id,kind,occurred_at) SELECT ?,'removed',? WHERE changes()=1",old.entity_id,now)]);
  // At most 200 SQL statements/invocation; a large initial inventory converges
  // across bounded cron/operator passes. Reads always use live proof, not this log.
  for(const batch of work.slice(0,100))statements.push(...batch);
  let changed=0;for(let i=0;i<statements.length;i+=80){const result=await db.batch(statements.slice(i,i+80));for(const r of result)changed+=r.meta?.changes??0;}
  return {visible:rows.length,processed:Math.min(work.length,100),pending:Math.max(0,work.length-100),sql_changes:changed};
}
