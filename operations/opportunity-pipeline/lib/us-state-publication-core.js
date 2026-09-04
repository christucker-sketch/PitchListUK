'use strict';

const crypto = require('crypto');
const { canonicalUrl } = require('./opportunity-safety');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function requireState(state = {}) {
  const code = String(state.code || '').trim().toUpperCase(); const name = String(state.name || '').trim(); const slug = String(state.slug || '').trim().toLowerCase(); const jurisdiction = String(state.jurisdiction || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !name || !slug || jurisdiction !== `US-${code}`) throw new Error('Invalid US publication state descriptor');
  return { ...state, code, name, slug, jurisdiction };
}
function identityOf(row) { return { source: canonicalUrl(row?.source_url), application: canonicalUrl(row?.application_url), id: String(row?.id || row?.stable_id || '') }; }
function eventDateOf(row) { return String(row?.event_start || row?.application_deadline || '').trim(); }
function sameCanonicalRouteAndDate(existing, candidate) {
  const current = identityOf(existing);
  const incoming = identityOf(candidate);
  const sameRoute = current.source && current.application && current.source === incoming.source && current.application === incoming.application;
  const currentDate = eventDateOf(existing);
  const incomingDate = eventDateOf(candidate);
  return Boolean(sameRoute && currentDate && incomingDate && currentDate === incomingDate);
}
function sourceIdFromRow(row, sources = []) { const sourceUrl=String(row?.source_url||''), applicationUrl=String(row?.application_url||''); return sources.find(item=>item.source_url===sourceUrl||item.application_url===applicationUrl)?.id||''; }
function sourceIdFromVerdict(item, sources = []) { const direct=item?.source?.id||item?.candidate?.source?.id||item?.candidate?.source_id||''; if(direct)return direct; const rowId=sourceIdFromRow(item?.row,sources); if(rowId)return rowId; const url=String(item?.candidate?.url||item?.url||''); return sources.find(source=>source.source_url===url||source.application_url===url)?.id||''; }

function assertStatePromotionInput(state, stagingManifest, sources = []) {
  const scoped=requireState(state);
  if(!stagingManifest||stagingManifest.country_code!=='US'||stagingManifest.region_code!==scoped.code||stagingManifest.jurisdiction!==scoped.jurisdiction) throw new Error(`${scoped.name} promotion requires a ${scoped.jurisdiction} staging manifest`);
  if(stagingManifest.staging_only!==true||stagingManifest.automatic_publish!==false||stagingManifest.production_writes!==false) throw new Error(`${scoped.name} promotion input must originate from staging-only execution`);
  if(!Array.isArray(stagingManifest.rows)||!stagingManifest.rows.length) throw new Error(`${scoped.name} promotion requires approved reviewed rows`);
  const ids=stagingManifest.rows.map(row=>sourceIdFromRow(row,sources)); if(ids.some(id=>!id)) throw new Error(`${scoped.name} promotion row does not map to an approved source`); if(new Set(ids).size!==ids.length) throw new Error(`${scoped.name} promotion contains duplicate approved-source identities`);
  const sourceById=new Map(sources.map(source=>[source.id,source]));
  for(const id of ids){ const source=sourceById.get(id); if(!source||source.status!=='approved-pilot') throw new Error(`${scoped.name} promotion source is not approved: ${id}`); if(source.country_code!=='US'||source.region_code!==scoped.code||source.jurisdiction!==scoped.jurisdiction) throw new Error(`${scoped.name} promotion source escaped ${scoped.jurisdiction} boundary: ${id}`); }
  for(const row of stagingManifest.rows){ if(row.country_code!=='US'||row.region_code!==scoped.code||row.jurisdiction!==scoped.jurisdiction) throw new Error(`${scoped.name} promotion row escaped state boundary`); if(row.publishable!==false||String(row.quality_status||'').toLowerCase()!=='review') throw new Error(`${scoped.name} promotion input row must still be review-only`); if(!row.stable_id||!row.event_name||!row.organiser||!row.source_url||!row.application_url) throw new Error(`${scoped.name} promotion row is missing reviewed evidence`); }
  return ids;
}
function heldSourceIds(stagingManifest,sources=[]){ return [...new Set((Array.isArray(stagingManifest?.held)?stagingManifest.held:[]).map(item=>sourceIdFromVerdict(item,sources)).filter(Boolean))]; }
function buildStatePromotionManifest(state, stagingManifest, options={}) {
  const scoped=requireState(state), sources=options.sources||[], sourceIds=assertStatePromotionInput(scoped,stagingManifest,sources), stagingHash=sha256(stableJson(stagingManifest));
  const rows=stagingManifest.rows.map((row,index)=>({...row,source_id:sourceIds[index],quality_status:'customer_ready',publishable:true,market_domain:'findpitches.com',currency:'USD',promotion_source:`reviewed-us-${scoped.slug}`}));
  const manifest={schema_version:2,type:'us-reviewed-promotion',country_code:'US',region_code:scoped.code,jurisdiction:scoped.jurisdiction,mode:'addition-only',automatic_publish:false,production_write_authorized:false,expected_additions:rows.length,staging_manifest_sha256:stagingHash,approved_source_ids:[...sourceIds],held_source_ids:heldSourceIds(stagingManifest,sources),rows}; manifest.rows_sha256=sha256(stableJson(rows)); return manifest;
}
function verifyStatePromotionManifest(state,manifest,stagingManifest,options={}) {
  const scoped=requireState(state), rebuilt=buildStatePromotionManifest(scoped,stagingManifest,options);
  if(manifest?.type!=='us-reviewed-promotion'||manifest?.mode!=='addition-only'||manifest?.region_code!==scoped.code||manifest?.jurisdiction!==scoped.jurisdiction) throw new Error(`${scoped.name} promotion manifest boundary/type mismatch`);
  if(manifest?.automatic_publish!==false||manifest?.production_write_authorized!==false) throw new Error(`${scoped.name} promotion may not authorize production writes`);
  if(manifest?.expected_additions!==rebuilt.expected_additions||manifest?.staging_manifest_sha256!==rebuilt.staging_manifest_sha256||manifest?.rows_sha256!==sha256(stableJson(manifest.rows||[]))||manifest?.rows_sha256!==rebuilt.rows_sha256||stableJson(manifest.rows)!==stableJson(rebuilt.rows)) throw new Error(`${scoped.name} promotion manifest verification failed`);
  return true;
}
function planStateProductionSnapshot(state,snapshot,promotionManifest,stagingManifest,options={}) {
  const scoped=requireState(state); verifyStatePromotionManifest(scoped,promotionManifest,stagingManifest,options); const existing=Array.isArray(snapshot?.rows)?snapshot.rows:[], candidates=promotionManifest.rows||[];
  if(!Number.isInteger(promotionManifest.expected_additions)||promotionManifest.expected_additions<1||candidates.length!==promotionManifest.expected_additions) throw new Error(`${scoped.name} production preview reviewed-row count mismatch`);
  const bySource=new Map(),byApplication=new Map(),byId=new Map(); for(const row of existing){const i=identityOf(row);if(i.source)bySource.set(i.source,row);if(i.application)byApplication.set(i.application,row);if(i.id)byId.set(i.id,row);}
  const seenSources=new Set(),seenApplications=new Set(),seenIds=new Set(),prepared=[],alreadyPresent=[];
  for(const row of candidates){
    if(row.country_code!=='US'||row.region_code!==scoped.code||row.jurisdiction!==scoped.jurisdiction) throw new Error(`${scoped.name} production row escaped state boundary`);
    if(row.publishable!==true||row.quality_status!=='customer_ready') throw new Error(`${scoped.name} production row is not customer ready`);
    const i=identityOf(row); if(!i.source||!i.application||!i.id) throw new Error(`${scoped.name} production row missing identity evidence`);
    const matches=[bySource.get(i.source),byApplication.get(i.application),byId.get(i.id)].filter(Boolean);
    if(matches.length){
      const first=matches[0];
      if(matches.some(match=>match!==first)) throw new Error(`${scoped.name} production identity collision:${i.id}`);
      const ei=identityOf(first);
      if(ei.source===i.source&&ei.application===i.application&&ei.id===i.id){ alreadyPresent.push({...row,id:i.id}); continue; }
      if(sameCanonicalRouteAndDate(first,row)){ alreadyPresent.push({...row,id:ei.id,stable_id:ei.id}); continue; }
      throw new Error(`${scoped.name} production identity collision:${i.id}`);
    }
    if(seenSources.has(i.source)||seenApplications.has(i.application)||seenIds.has(i.id)) throw new Error(`${scoped.name} production duplicate:${i.id}`);
    seenSources.add(i.source);seenApplications.add(i.application);seenIds.add(i.id);prepared.push({...row,id:i.id});
  }
  const rows=[...existing,...prepared]; return {preview:{...snapshot,source:`preview:reviewed-us-${scoped.slug}`,total:rows.length,rows},summary:{before_count:existing.length,after_count:rows.length,reviewed_rows:candidates.length,already_present:alreadyPresent.length,existing_ids:alreadyPresent.map(row=>row.id),additions:prepared.length,added_ids:prepared.map(row=>row.id),production_write_authorized:false,deploy_authorized:false}};
}
module.exports={stableJson,sha256,canonicalUrl,identityOf,eventDateOf,sameCanonicalRouteAndDate,sourceIdFromRow,sourceIdFromVerdict,assertStatePromotionInput,buildStatePromotionManifest,verifyStatePromotionManifest,planStateProductionSnapshot};
