export const EXPORT_SCHEMA = 'findpitches-discovery-export-v1';
export const EVIDENCE_SCHEMA = 'findpitches-evidence-v1';
export const FIELDS = Object.freeze(['event_name','organiser','location','region_code','event_start','event_end','application_deadline','canonical_url','application_url','application_state','lifecycle_state','recurring','source_platform','source_identifier']);
export const PRODUCERS = Object.freeze({
  'independent-structured': Object.freeze({ type: 'structured', authority: 100 }),
  'city-search': Object.freeze({ type: 'search', authority: 50 }),
  'source-led-search': Object.freeze({ type: 'search', authority: 50 }),
  'legacy_v2': Object.freeze({ type: 'legacy_recovery', authority: 40 }),
});
export const AUTHORITIES = Object.freeze({ direct_form:95, official_page:90, official_pdf:85, trusted_directory:75, extracted_page:60, search_snippet:50, inferred:40 });
export function validFieldValue(field,value) {
  if(value===null)return true;
  if(field==='recurring')return typeof value==='boolean'||value===0||value===1;
  if(typeof value!=='string'||value.length>4000)return false;
  if(['canonical_url','application_url'].includes(field))return publicHttps(value);
  if(field==='application_state')return ['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE','WATCH','CLOSED','UNKNOWN'].includes(value);
  if(field==='lifecycle_state')return ['NEW','WATCH','UPDATED','STATE_CHANGED','CLOSED','REOPENED','WITHDRAWN','UNCHANGED'].includes(value);
  return true;
}

export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key)+':'+stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
export function publicHttps(value) {
  try {
    const u=new URL(value);
    const host=u.hostname.toLowerCase();
    return u.protocol==='https:' && !u.username && !u.password && host.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) && !host.endsWith('.local') && !host.includes(':');
  } catch { return false; }
}
export function platformId(url) {
  try { const u=new URL(url); return /(^|\.)eventeny\.com$/.test(u.hostname) && /^\/events\/vendor\/?$/.test(u.pathname) ? u.searchParams.get('id') : null; } catch { return null; }
}
export function normalizeExport(raw, { producer='independent-structured', environment='shadow' }={}) {
  const errors=[];
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return { errors:['record_object_required'], normalized:null };
  if (!PRODUCERS[producer]) errors.push('unknown_producer');
  if (!['test','shadow'].includes(environment)) errors.push('shadow_or_test_required');
  if (raw.schema_version!==EXPORT_SCHEMA) errors.push('unsupported_schema');
  const id=raw.opportunity_id ?? raw.producer_record_id;
  if (typeof id!=='string' || !id.trim() || id.length>256) errors.push('producer_record_id_required');
  const market=raw.country_code ?? raw.market;
  if (!['GB','US','CA','AU','NZ','IE','SG','HK'].includes(market)) errors.push('unsupported_market');
  const normalized={ schema_version:EVIDENCE_SCHEMA, producer_name:producer, producer_type:PRODUCERS[producer]?.type, producer_record_id:id, market, region_code:raw.region_code??null,
    environment, shadow_only:true, promotion_eligible:false, publication_eligible:false,
    event_name:raw.event_name??raw.title??null, organiser:raw.organiser??null, location:raw.location??raw.locality??raw.venue??null,
    event_start:raw.event_start??null,event_end:raw.event_end??null,application_deadline:raw.application_deadline??null,
    canonical_url:raw.canonical_url??raw.source_url??null, application_url:raw.application_url??null,
    application_state:raw.application_state??'UNKNOWN',lifecycle_state:raw.lifecycle_state??raw.lifecycle_event??'NEW',recurring:raw.recurring??null,
    source_platform:raw.source_platform??raw.discovery_source??null, source_identifier:raw.source_identifier??platformId(raw.application_url)??null,
    confidence:raw.confidence??null,evidence:raw.evidence??[],provenance:raw.provenance??[],
    first_seen:raw.first_seen??null,last_seen:raw.last_seen??null,last_checked:raw.last_checked??null,source_fingerprint:raw.source_fingerprint??raw.content_fingerprint??null,
  };
  if(producer==='legacy_v2') {
    normalized.legacy_v2=raw.legacy_v2;
    normalized.field_evidence=raw.field_evidence;
    if(raw.legacy_v2?.audit_status!=='pending'||raw.legacy_v2?.shadow_only!==true)errors.push('legacy_shadow_audit_required');
    for(const field of FIELDS)if(normalized[field]!==null&&normalized[field]!==undefined&&normalized[field]!=='') {
      const proof=raw.field_evidence?.[field];
      if(!proof||!['retained_structured','retained_excerpt','direct_event','direct_heading','source_route','historical_state'].includes(proof.kind)
        ||!publicHttps(proof.source)||typeof proof.excerpt!=='string'||!proof.excerpt.trim()||proof.excerpt.length>4000)errors.push('legacy_field_evidence_required_'+field);
    }
  }
  if (typeof normalized.event_name!=='string' || !normalized.event_name.trim()) errors.push('event_name_required');
  for(const field of FIELDS) if(!validFieldValue(field,normalized[field]))errors.push('invalid_'+field);
  for(const field of ['first_seen','last_seen','last_checked'])if(normalized[field]!==null&&(typeof normalized[field]!=='string'||!Number.isFinite(Date.parse(normalized[field]))))errors.push('invalid_'+field);
  if (!['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE','WATCH','CLOSED','UNKNOWN'].includes(normalized.application_state)) errors.push('invalid_application_state');
  if (!['NEW','WATCH','UPDATED','STATE_CHANGED','CLOSED','REOPENED','WITHDRAWN','UNCHANGED'].includes(normalized.lifecycle_state)) errors.push('invalid_lifecycle_state');
  if (!normalized.canonical_url && !normalized.application_url) errors.push('source_route_required');
  for(const field of ['canonical_url','application_url']) if(normalized[field] && !publicHttps(normalized[field])) errors.push('unsafe_'+field);
  if(raw.environment && raw.environment!==environment || raw.shadow_only===false || raw.promotion_eligible===true || raw.publication_eligible===true) errors.push('client_scope_escalation');
  return { errors,normalized:errors.length?null:normalized };
}
