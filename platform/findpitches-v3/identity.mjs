import { platformId } from './contract.mjs';

export function canonicalUrl(value) {
  try { const u=new URL(value); u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');for(const key of [...u.searchParams.keys()]) if(/^utm_|^(fbclid|gclid)$/i.test(key))u.searchParams.delete(key);u.searchParams.sort();u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString(); } catch { return null; }
}
const STOP=new Set('the and of at a an to for in on application apply vendor vendors trader traders market festival fair event exhibitors exhibitor registration form'.split(' '));
function tokens(value) { return [...new Set(String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t.length>2&&!STOP.has(t)))]; }
function overlap(a,b) { const x=tokens(a), y=new Set(tokens(b));const shared=x.filter(t=>y.has(t));return { count:shared.length,ratio:shared.length/Math.max(1,Math.min(x.length,y.size)) }; }
export function edition(record) { return String(record.event_start||'').match(/\b20\d{2}\b/)?.[0] ?? String(record.event_name||'').match(/\b20\d{2}\b/)?.[0] ?? null; }
function specific(url) { try { const u=new URL(url);return Boolean(u.searchParams.get('id')) || u.pathname.split('/').filter(Boolean).some(part=>!['events','event','applications','application','vendors','vendor','stallholders','solutions','vendor-management'].includes(part)); } catch { return false; } }
export function identityKeys(record) {
  const keys=[];
  for(const url of [record.canonical_url,record.application_url]) if(url)keys.push('url:'+canonicalUrl(url));
  const identifier=record.source_identifier??platformId(record.application_url);
  if(identifier && record.source_platform)keys.push('platform:'+record.source_platform+':'+identifier);
  for(const token of tokens(record.event_name))keys.push('name:'+token);
  return [...new Set(keys)];
}
export function identityAnchor(record) {
  if(record.source_identifier&&record.source_platform)return 'platform:'+record.source_platform+':'+record.source_identifier;
  for(const url of [record.application_url,record.canonical_url])if(specific(url))return 'url:'+canonicalUrl(url);
  return 'producer:'+record.producer_name+':'+record.producer_record_id;
}
export function reconcileIdentity(incoming,candidates) {
  const matches=[];
  for(const candidate of candidates) {
    if(candidate.market!==incoming.market || candidate.environment!==incoming.environment) continue;
    const a=edition(incoming), b=edition(candidate);
    if(a&&b&&a!==b) continue;
    const aId=incoming.source_identifier??platformId(incoming.application_url), bId=candidate.source_identifier??platformId(candidate.application_url);
    const samePlatform=Boolean(incoming.source_platform&&incoming.source_platform===candidate.source_platform);
    if(samePlatform&&aId&&bId&&aId!==bId) continue;
    const sameId=samePlatform&&aId&&aId===bId;
    const urls=[incoming.canonical_url,incoming.application_url].filter(Boolean).map(canonicalUrl);
    const exact=urls.some(u=>specific(u)&&[candidate.canonical_url,candidate.application_url].filter(Boolean).map(canonicalUrl).includes(u));
    if(incoming.event_start&&candidate.event_start&&incoming.event_start!==candidate.event_start&&!exact&&!sameId)continue;
    const name=overlap(incoming.event_name,candidate.event_name), org=overlap(incoming.organiser,candidate.organiser), location=overlap(incoming.location,candidate.location);
    if((exact||sameId) && (name.count>=1 || org.count>=1 || location.count>=1)) matches.push({ outcome:'EXACT_MATCH',entity_id:candidate.id,reason:sameId?'platform_identifier':'specific_route_and_corroboration' });
    else if(exact||sameId) matches.push({ outcome:'CONFLICT',entity_id:candidate.id,reason:'exact_route_conflicting_identity' });
    else if(name.count>=3&&name.ratio>=.75&&(org.count>=1&&org.ratio>=.65||location.count>=1&&location.ratio>=.7))matches.push({ outcome:'PROBABLE_MATCH',entity_id:candidate.id,reason:'distinctive_name_and_corroboration' });
  }
  const exact=matches.filter(m=>m.outcome==='EXACT_MATCH');
  if(exact.length===1&&matches.length===1)return {...exact[0],candidates:[exact[0].entity_id]};
  if(matches.length)return { outcome:matches.some(m=>m.outcome==='CONFLICT')||exact.length>1?'CONFLICT':'PROBABLE_MATCH',entity_id:null,candidates:matches.map(m=>m.entity_id),reason:matches.length>1?'ambiguous_identity':matches[0].reason };
  return { outcome:'NEW_ENTITY',entity_id:null,candidates:[],reason:'distinct_source_identity' };
}
