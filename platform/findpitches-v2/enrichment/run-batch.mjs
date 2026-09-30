import { normalizeEnrichment } from '../customer/enrichment.mjs';
import { extractNamedFields } from './named-fields.mjs';
import { isTerminalPdfError } from '../providers/fetch/pdf-error-policy.mjs';
import { enabledGeographies } from '../geography/catalog.mjs';
import { extractStructuredEventLocation } from './structured-event-location.mjs';

const DEFAULT_LIMIT = 8;
const LEASE_MINUTES = 5;
const RETRY_MINUTES = 30;
const MAX_LINKS = 3;
const MAX_ATTEMPTS = 5;

export async function enqueueEnrichmentRulesetRefresh(db,{now=new Date(),limit=8,ruleset}={}){
  if(!db?.prepare) throw new Error('findpitches_v2_enrichment_db_missing');
  const version=String(ruleset||'').trim();
  if(!version) throw new Error('findpitches_v2_enrichment_ruleset_missing');
  const timestamp=now.toISOString();
  const metaKey='enrichment_ruleset_version';
  const sweepKey='enrichment_ruleset_sweep_started_at';
  const sweepVersionKey='enrichment_ruleset_sweep_version';
  const current=await db.prepare('SELECT value FROM runtime_meta WHERE key=?').bind(metaKey).first();
  if(current?.value===version) return Object.freeze({ruleset:version,enqueued:0,complete:true});
  let sweep=await db.prepare('SELECT value FROM runtime_meta WHERE key=?').bind(sweepKey).first();
  let sweepVersion=await db.prepare('SELECT value FROM runtime_meta WHERE key=?').bind(sweepVersionKey).first();
  if(sweepVersion?.value!==version || !sweep?.value){
    await db.prepare("INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(sweepVersionKey,version,timestamp).run();
    await db.prepare("INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(sweepKey,timestamp,timestamp).run();
    sweep={value:timestamp};
    sweepVersion={value:version};
  }
  const cap=Math.max(0,Math.min(Number(limit)||0,24));
  if(cap===0) return Object.freeze({ruleset:version,sweep_started_at:sweep.value,enqueued:0,complete:false});
  const rows=await db.prepare(`
    SELECT c.id,c.last_checked
      FROM candidates c
      LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
      LEFT JOIN enrichment_queue q ON q.candidate_id=c.id
     WHERE c.status='validated'
       AND c.last_checked<=?
       AND (e.candidate_id IS NULL OR e.enriched_at<?)
       AND (q.candidate_id IS NULL OR q.status!='leased' OR q.lease_until<=?)
     ORDER BY c.last_checked ASC,c.id ASC
     LIMIT ?`).bind(sweep.value,sweep.value,timestamp,cap).all();
  const candidates=Array.isArray(rows?.results)?rows.results:[];
  for(const row of candidates){
    await db.prepare(`
      INSERT INTO enrichment_queue
      (candidate_id,status,attempts,available_at,lease_until,last_error,source_last_checked,created_at,updated_at)
      VALUES (?,'ready',0,?,NULL,?,?,?,?)
      ON CONFLICT(candidate_id) DO UPDATE SET
        status='ready',attempts=0,available_at=excluded.available_at,lease_until=NULL,
        last_error=excluded.last_error,source_last_checked=excluded.source_last_checked,updated_at=excluded.updated_at`)
      .bind(row.id,timestamp,'ruleset_refresh:'+version,row.last_checked,timestamp,timestamp).run();
  }
  if(candidates.length===0){
    await db.prepare("INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(metaKey,version,timestamp).run();
  }
  return Object.freeze({ruleset:version,sweep_started_at:sweep.value,enqueued:candidates.length,complete:candidates.length===0});
}

export async function enqueueValidatedForEnrichment(db, { now = new Date(), limit = 50 } = {}) {
  const timestamp = now.toISOString();
  const rows = await db.prepare(
    `SELECT c.id, c.last_checked
       FROM candidates c
       LEFT JOIN candidate_enrichment e ON e.candidate_id = c.id
       LEFT JOIN enrichment_queue q ON q.candidate_id = c.id
      WHERE c.status = 'validated'
        AND (e.candidate_id IS NULL OR e.source_last_checked < c.last_checked)
        AND (q.candidate_id IS NULL OR q.source_last_checked < c.last_checked OR (q.status = 'complete' AND e.candidate_id IS NULL))
      ORDER BY c.last_checked ASC, c.id ASC
      LIMIT ?`
  ).bind(Math.max(1, Math.min(Number(limit) || 50, 100))).all();
  const candidates = Array.isArray(rows?.results) ? rows.results : [];
  for (const row of candidates) {
    await db.prepare(
      `INSERT INTO enrichment_queue
       (candidate_id,status,attempts,available_at,lease_until,last_error,source_last_checked,created_at,updated_at)
       VALUES (?,'ready',0,?,NULL,NULL,?,?,?)
       ON CONFLICT(candidate_id) DO UPDATE SET
         status='ready', attempts=0, available_at=excluded.available_at, lease_until=NULL,
         last_error=NULL, source_last_checked=excluded.source_last_checked, updated_at=excluded.updated_at`
    ).bind(row.id,timestamp,row.last_checked,timestamp,timestamp).run();
  }
  return Object.freeze({ enqueued: candidates.length });
}

export async function previewCandidateEnrichment(candidate={}, {fetchProvider}={}){
 if(!fetchProvider?.fetch) throw new Error('findpitches_v2_enrichment_fetch_missing');
 const pages=await fetchCandidatePages(candidate,fetchProvider);
 return Object.freeze({
  enrichment:extractEnrichment(candidate,pages),
  fetched_urls:Object.freeze(pages.map(page=>page.final_url))
 });
}

export async function runEnrichmentBatch(db, { fetchProvider, now = new Date(), limit = DEFAULT_LIMIT } = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_enrichment_db_missing');
  if (!fetchProvider?.fetch) throw new Error('findpitches_v2_enrichment_fetch_missing');
  const timestamp=now.toISOString();
  const leaseUntil=new Date(now.getTime()+LEASE_MINUTES*60000).toISOString();
  await db.prepare("UPDATE enrichment_queue SET status='dead',lease_until=NULL,updated_at=? WHERE attempts>=? AND status IN ('ready','leased')").bind(timestamp,MAX_ATTEMPTS).run();
  const rows=await db.prepare(
    `SELECT q.candidate_id,q.attempts,q.source_last_checked,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json,c.evidence_json
       FROM enrichment_queue q JOIN candidates c ON c.id=q.candidate_id
      WHERE c.status='validated' AND ((q.status='ready' AND q.available_at<=?) OR (q.status='leased' AND q.lease_until<=?))
      ORDER BY q.available_at ASC,q.candidate_id ASC LIMIT ?`
  ).bind(timestamp,timestamp,Math.max(1,Math.min(Number(limit)||DEFAULT_LIMIT,24))).all();
  const items=Array.isArray(rows?.results)?rows.results:[];
  const outcomes={processed:0,complete:0,failed:0,pages_fetched:0};

  for(const row of items){
    const claim=await db.prepare(
      `UPDATE enrichment_queue SET status='leased',lease_until=?,attempts=attempts+1,updated_at=?
        WHERE candidate_id=? AND ((status='ready' AND available_at<=?) OR (status='leased' AND lease_until<=?))`
    ).bind(leaseUntil,timestamp,row.candidate_id,timestamp,timestamp).run();
    if(Number(claim?.meta?.changes||0)!==1) continue;
    outcomes.processed++;
    try{
      const pages=await fetchCandidatePages(row,fetchProvider);
      outcomes.pages_fetched+=pages.length;
      const enrichment=extractEnrichment(row,pages);
      const provenance=Object.fromEntries(Object.entries(enrichment).filter(([,v])=>v?.evidence?.length).map(([k,v])=>[k,{evidence:v.evidence,confidence:v.confidence}]));
      await db.prepare(
        `INSERT INTO candidate_enrichment
         (candidate_id,source_last_checked,enrichment_json,provenance_json,fetched_urls_json,enriched_at,updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(candidate_id) DO UPDATE SET source_last_checked=excluded.source_last_checked,
         enrichment_json=excluded.enrichment_json,provenance_json=excluded.provenance_json,
         fetched_urls_json=excluded.fetched_urls_json,enriched_at=excluded.enriched_at,updated_at=excluded.updated_at`
      ).bind(row.candidate_id,row.source_last_checked,JSON.stringify(enrichment),JSON.stringify(provenance),JSON.stringify(pages.map(p=>p.final_url)),timestamp,timestamp).run();
      await db.prepare("UPDATE enrichment_queue SET status='complete',lease_until=NULL,last_error=NULL,updated_at=? WHERE candidate_id=?")
        .bind(timestamp,row.candidate_id).run();
      outcomes.complete++;
    }catch(error){
      const retryAt=new Date(now.getTime()+RETRY_MINUTES*60000).toISOString();
      await db.prepare("UPDATE enrichment_queue SET status=?,available_at=?,lease_until=NULL,last_error=?,updated_at=? WHERE candidate_id=?")
        .bind(isTerminalPdfError(error) || Number(row.attempts||0)+1>=MAX_ATTEMPTS?'dead':'ready',retryAt,String(error?.message||error).slice(0,500),timestamp,row.candidate_id).run();
      outcomes.failed++;
    }
  }
  return Object.freeze(outcomes);
}

async function fetchCandidatePages(row,fetchProvider){
  const seeds=[row.canonical_url,row.application_url].filter(Boolean);
  const pages=[],seen=new Set();
  for(const url of seeds){
    if(seen.has(url)) continue;
    const page=await fetchProvider.fetch(url); seen.add(url); pages.push(page);
  }
  const links=[];
  for(const page of pages.slice()){
    for(const link of usefulLinks(page)){
      if(!seen.has(link) && sameSite(page.final_url,link)) links.push(link);
    }
  }
  for(const link of [...new Set(links)].slice(0,MAX_LINKS)){
    try{const page=await fetchProvider.fetch(link);seen.add(link);pages.push(page);}catch{}
  }
  return pages;
}

function usefulLinks(page){
  const out=[],base=page.final_url;
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(page.body||''))){
    const label=plain(m[2]).toLowerCase();
    const signal=(label+" "+m[1]).toLowerCase();
    let priority=null;
    if(/(venue|location|where\b|visit\b|plan your visit|getting here|get here|directions|find us|show info|event info|event details|visitor info)/.test(signal)) priority=0;
    else if(/(apply|application|vendor|trader|stall|exhibit|market)/.test(signal)) priority=1;
    else if(/contact/.test(signal)) priority=2;
    if(priority===null) continue;
    try{out.push({url:new URL(m[1],base).toString(),priority});}catch{}
  }
  return out.sort((a,b)=>a.priority-b.priority||a.url.localeCompare(b.url)).map(item=>item.url);
}
function sameSite(a,b){try{const x=new URL(a).hostname.replace(/^www\./,''),y=new URL(b).hostname.replace(/^www\./,'');return x===y;}catch{return false;}}

function extractEnrichment(row,pages){
  const docs=[
    ...pages.map(p=>({url:p.final_url,text:plainWithLines(p.body),kind:'source_page'})),
    ...candidateSearchEvidenceDocs(row)
  ];
  const joined=docs.map(d=>d.text).join("\n");
  const geography=parse(row.geography_json);
  const rawDocs=pages.map(p=>({url:p.final_url,body:p.body}));
  const named=extractNamedFields(rawDocs);
  const structured=extractStructuredEventLocation(rawDocs);
  const sourceConflict=sourceGeographyConflict(geography,docs);
  const strictLocation=sourceConflict?null:verifiedLocationForGeography(named.location ?? structured.location,geography);
  const structuredArea=sourceConflict?null:verifiedLocationForGeography(structured.location_area,geography);
  const result={
    organiser:named.organiser ?? evidenceField(row.organiser,docs),
    location:strictLocation,
    location_area:sourceConflict?null:(structuredArea ?? extractVerifiedLocalityHint(geography,docs) ?? extractHtmlHeadingPlaceEvidence(geography,rawDocs) ?? extractSupportedPlaceEvidence(geography,docs) ?? extractSupportedAreaEvidence(geography,docs))
  };
  const deadline=firstDateInDocs(docs,[
    /(?:application|applications|apply|vendor|trader|stallholder|exhibitor)[^.!?\n]{0,100}(?:deadline|closes?|closing\s+date|close\s+by|due|apply\s+by)[^.!?\n]{0,80}/i,
    /(?:application\s+deadline|closing\s+date|applications?\s+close|apply\s+by|vendor\s+applications?\s+due)\s*[:\-]?\s*[^.!?\n]{0,100}/i
  ]);
  if(deadline) result.application_deadline=datedEvidence(deadline);
  const eventDate=firstDateInDocs(docs,[
    /(?:event|festival|fair|market|show)[^.!?\n]{0,100}(?:date|takes\s+place|held|on|runs?\s+from)[^.!?\n]{0,80}/i,
    /(?:event\s+date|festival\s+date|fair\s+date|market\s+date)\s*[:\-]?\s*[^.!?\n]{0,100}/i
  ]);
  if(eventDate) result.event_start=datedEvidence(eventDate);
  const description=descriptionExcerpt(docs);
  if(description) result.description=withEvidence(description.value,description.excerpt,docs);
  return normalizeEnrichment(result);
}
function sourceGeographyConflict(geography,docs){
 const market=String(geography?.country_code||'').trim().toUpperCase();
 const expected=String(geography?.region_code||'').trim().toUpperCase();
 if(!market||!expected)return false;
 const textValue=docs.filter(doc=>doc.kind!=='search_result').map(doc=>String(doc.text||'')).join('\n');
 if(!textValue)return false;
 if(market==='GB'&&explicitForeignGbLocation(textValue))return true;
 let geos=[];try{geos=enabledGeographies(market);}catch{return false;}
 const mentions=new Set();
 for(const item of geos){
  const variants=[item.name,...(item.aliases||[])].map(v=>String(v||'').trim()).filter(v=>v.length>=4);
  if(variants.some(v=>normalizedMention(textValue,v)))mentions.add(String(item.code).toUpperCase());
 }
 if(mentions.size===0||mentions.has(expected))return false;
 return mentions.size===1;
}
function verifiedLocationForGeography(field,geography){
 if(!field?.value)return null;
 const market=String(geography?.country_code||'').trim().toUpperCase();
 const expected=String(geography?.region_code||'').trim().toUpperCase();
 const evidence=field?.evidence?.[0]?.excerpt||'';
 const combined=[field.value,evidence].filter(Boolean).join(' ');
 if(market==='GB'&&explicitForeignGbLocation(combined))return null;
 if(!market||!expected||!evidence)return field;
 let geos=[];try{geos=enabledGeographies(market);}catch{return field;}
 const mentions=new Set();
 for(const item of geos){
  const variants=[item.name,...(item.aliases||[])].map(v=>String(v||'').trim()).filter(v=>v.length>=4);
  if(variants.some(v=>normalizedMention(evidence,v)))mentions.add(String(item.code).toUpperCase());
 }
 if(mentions.size&& !mentions.has(expected))return null;
 return field;
}
function explicitForeignGbLocation(value){
 const v=String(value||'');
 if(/\b(?:united\s+states|usa|u\.s\.a\.?|u\.s\.)\b/i.test(v)||/\bUS\b/.test(v))return true;
 const usCode='(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)';
 if(new RegExp(',\\s*'+usCode+'\\b').test(v))return true;
 if(new RegExp('["\\\']addressRegion["\\\']\\s*:\\s*["\\\']'+usCode+'["\\\']','i').test(v))return true;
 return false;
}
export function extractVerifiedLocalityHint(geography,docs){
 const hint=String(geography?.locality||'').replace(/\s+/g,' ').trim();
 if(hint.length<3||hint.length>120)return null;
 for(const doc of docs){
  const sentences=String(doc.text||'').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  for(const sentence of sentences){
   if(sentence.length>500||!normalizedMention(sentence,hint))continue;
   if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing|office|headquarters|privacy|cookie|terms\s+and\s+conditions)\b/i.test(sentence))continue;
   return {value:hint,precision:'place',evidence:[{source:doc.url,excerpt:sentence.slice(0,240),kind:doc.kind==='search_result'?'search_result_snippet':'verified_location_hint'}],confidence:doc.kind==='search_result'?.68:.84};
  }
 }
 return null;
}
export function extractHtmlHeadingPlaceEvidence(geography,docs){
 const market=String(geography?.country_code||'').trim().toUpperCase();
 if(market!=='GB')return null;
 const expected=String(geography?.region_code||'').trim().toUpperCase();
 const variants=gbRegionVariants(geography);
 if(!variants.length)return null;
 for(const doc of docs){
  const body=String(doc?.body||'').replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  if(!eventContext(plain(body)))continue;
  const re=/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let match;
  while((match=re.exec(body))){
   const heading=plain(match[1]);
   if(!heading||heading.length>180)continue;
   for(const regionName of variants){
    const escaped=escapeRegex(regionName);
    const pattern=new RegExp('\\b([A-Z][A-Za-z’\\\'\\.-]*(?:\\s+[A-Z][A-Za-z’\\\'\\.-]*){0,3})\\s*,\\s*'+escaped+'\\b');
    const found=heading.match(pattern);if(!found)continue;
    const place=cleanSupportedPlace(found[1],variants);if(!place||isOtherGbRegionName(place,expected))continue;
    return {value:place,precision:'place',evidence:[{source:doc.url,excerpt:heading.slice(0,240),kind:'event_page_location_heading'}],confidence:.78};
   }
  }
 }
 return null;
}
export function extractSupportedPlaceEvidence(geography,docs){
 const market=String(geography?.country_code||'').trim().toUpperCase();
 if(market!=='GB')return null;
 const region=String(geography?.region||'').trim();
 const code=String(geography?.region_code||'').trim().toUpperCase();
 let item=null;try{item=enabledGeographies('GB').find(x=>x.code===code)||null;}catch{}
 const variants=[region,item?.name,...(item?.aliases||[])].map(x=>String(x||'').trim()).filter(x=>x.length>=3);
 if(!variants.length)return null;
 for(const doc of docs){
  const docText=String(doc.text||'');
  const docHasEventContext=eventContext(docText);
  const sentences=docText.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  for(const sentence of sentences){
   if(sentence.length>500)continue;
   if(!eventContext(sentence)&&!(docHasEventContext&&(explicitLocationLine(sentence)||locationPageUrl(doc.url))))continue;
   if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing|office|headquarters)\b/i.test(sentence))continue;
   for(const regionName of variants){
    const escaped=escapeRegex(regionName);
    const patterns=[
     new RegExp('\\b([A-Z][A-Za-z’\\\'\\.-]*(?:\\s+[A-Z][A-Za-z’\\\'\\.-]*){0,3})\\s*,\\s*'+escaped+'\\b'),
     new RegExp('\\b([A-Z][A-Za-z’\\\'\\.-]*(?:\\s+[A-Z][A-Za-z’\\\'\\.-]*){0,3})\\s+in\\s+'+escaped+'\\b')
    ];
    for(const pattern of patterns){
     const match=sentence.match(pattern);if(!match)continue;
     const place=cleanSupportedPlace(match[1],variants);if(!place||isOtherGbRegionName(place,code))continue;
     const kind=doc.kind==='search_result'?'search_result_snippet':(eventContext(sentence)?'source_event_context':'event_location_page');
     return {value:place,precision:'place',evidence:[{source:doc.url,excerpt:sentence.slice(0,240),kind}],confidence:doc.kind==='search_result'?.66:(kind==='event_location_page'?.76:.82)};
    }
   }
  }
 }
 return null;
}
export function extractSupportedAreaEvidence(geography,docs){
 const candidates=supportedGeographyCandidates(geography);
 for(const candidate of candidates){
  if(candidate.value.length<3)continue;
  for(const doc of docs){
   const sentences=String(doc.text||'').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
   for(const sentence of sentences){
    if(sentence.length>500||!candidate.variants.some(variant=>normalizedMention(sentence,variant)))continue;
    if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing|office|headquarters)\b/i.test(sentence))continue;
    if(!/\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(sentence))continue;
    return {value:candidate.value,precision:candidate.precision,evidence:[{source:doc.url,excerpt:sentence.slice(0,240),kind:doc.kind==='search_result'?'search_result_snippet':null}],confidence:doc.kind==='search_result'?.62:(candidate.precision==='place'?.8:.72)};
   }
  }
 }
 return null;
}
function supportedGeographyCandidates(geography){
 const result=[];
 const add=(value,precision,variants=[])=>{
  const name=String(value||'').trim();if(!name)return;
  result.push({value:name,precision,variants:[name,...variants].map(x=>String(x||'').trim()).filter(Boolean)});
 };
 add(geography?.locality,'place');
 add(geography?.subregion,'area');
 const region=String(geography?.region||'').trim();
 if(region){
  const code=String(geography?.region_code||'').trim().toUpperCase();
  const market=String(geography?.country_code||'').trim().toUpperCase();
  let item=null;
  try{item=enabledGeographies(market).find(x=>x.code===code)||null;}catch{}
  if(code&&region.toUpperCase()===code&&item?.name){
   add(item.name,'area',item.aliases||[]);
  }else{
   const suffix=code&&region.toUpperCase().endsWith(' '+code)?region.slice(0,-code.length).trim():null;
   if(suffix){
    const variants=[suffix+' '+code,suffix+', '+code];
    if(item?.name)variants.push(suffix+' '+item.name,suffix+', '+item.name);
    add(region,'place',variants);
   }else{
    add(region,'area',[item?.name,...(item?.aliases||[])]);
   }
  }
 }
 return result;
}
function gbRegionVariants(geography){
 const region=String(geography?.region||'').trim();
 const code=String(geography?.region_code||'').trim().toUpperCase();
 let item=null;try{item=enabledGeographies('GB').find(x=>x.code===code)||null;}catch{}
 return [region,item?.name,...(item?.aliases||[])].map(x=>String(x||'').trim()).filter(x=>x.length>=3);
}
function isOtherGbRegionName(value,expectedCode){
 const needle=normalizePlaceText(value);
 if(!needle)return false;
 try{
  for(const item of enabledGeographies('GB')){
   if(String(item.code).toUpperCase()===String(expectedCode||'').toUpperCase())continue;
   if([item.name,...(item.aliases||[])].some(v=>normalizePlaceText(v)===needle))return true;
  }
 }catch{}
 return false;
}
function explicitLocationLine(value){return /^\s*(?:where|venue|location|event\s+venue|event\s+location)\s*[:\-]/i.test(String(value||''));}
function locationPageUrl(value){
 try{return /\/(?:where(?:-to-find-us)?|location|venue|visit|directions|getting-here|find-us|show-info)(?:\/|$)/i.test(new URL(String(value)).pathname);}
 catch{return false;}
}
function cleanSupportedPlace(value,regions){
 const name=String(value||'').replace(/\s+/g,' ').trim().replace(/^[,;:\-\s]+|[,;:\-\s]+$/g,'');
 if(name.length<3||name.length>60)return null;
 if(regions.some(r=>normalizePlaceText(r)===normalizePlaceText(name)))return null;
 if(/^(?:the|this|our|your|vendor|vendors|trader|traders|stallholder|stallholders|exhibitor|exhibitors|festival|fair|market|event|show|county|region|area|online|tbc|tbd)$/i.test(name))return null;
 if(/\b(?:festival|fair|event|show|market|concert)$/i.test(name))return null;
 if(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(name))return null;
 return name;
}
function eventContext(sentence){
 return /\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(sentence);
}
function escapeRegex(value){return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function normalizedMention(sentence,variant){
 const haystack=normalizePlaceText(sentence),needle=normalizePlaceText(variant);
 return needle.length>=3 && (' '+haystack+' ').includes(' '+needle+' ');
}
function normalizePlaceText(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function candidateSearchEvidenceDocs(row){
 const evidence=parseArray(row?.evidence_json);
 const docs=[];
 for(const item of evidence){
  if(item?.kind!=='search_result')continue;
  const source=String(item?.source||'').trim();
  if(!safeHttp(source))continue;
  const title=String(item?.title||'').trim();
  const snippet=String(item?.snippet||'').trim();
  const text=[title,snippet].filter(Boolean).join('\n').trim();
  if(!text)continue;
  docs.push({url:source,text,kind:'search_result'});
 }
 return docs;
}
function safeHttp(value){try{const u=new URL(String(value||''));return u.protocol==='http:'||u.protocol==='https:';}catch{return false;}}
function parseArray(value){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}}
function evidenceField(value,docs){if(!value)return null;const doc=docs.find(d=>d.text.toLowerCase().includes(String(value).toLowerCase()));return doc?{value,evidence:[{source:doc.url,excerpt:excerptAround(doc.text,String(value))}],confidence:.9}:value;}
const DATE_VALUE=/\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2})\b/i;
function firstDateInDocs(docs,patterns){
 for(const doc of docs){
  for(const pattern of patterns){
   const m=doc.text.match(pattern); if(!m)continue;
   const excerpt=m[0].slice(0,240); const dm=excerpt.match(DATE_VALUE);
   if(dm)return {value:dm[0],excerpt,source:doc.url};
  }
 }
 return null;
}
function datedEvidence(match){return {value:match.value,evidence:[{source:match.source,excerpt:match.excerpt}],confidence:.78};}
function withEvidence(value,excerpt,docs){
 const source=docs.find(doc=>String(doc.text||'').includes(String(excerpt||'')))?.url||docs[0]?.url||null;
 return {value,evidence:[{source,excerpt}],confidence:.7};
}

function descriptionExcerpt(docs){for(const d of docs){const parts=d.text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>=80&&x.length<=400);const s=parts.find(x=>/(vendor|trader|stallholder|exhibitor|apply|application)/i.test(x));if(s)return {value:s.slice(0,400),excerpt:s.slice(0,240)};}return null;}
function excerptAround(text,needle){const i=text.toLowerCase().indexOf(needle.toLowerCase());return i<0?null:text.slice(Math.max(0,i-80),i+needle.length+120).trim().slice(0,240);}
function plainWithLines(html){
 return String(html||'')
  .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<\/(?:p|div|h[1-6]|li|section|article|tr|td|th)>/gi,'\n')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"')
  .split(/\r?\n/).map(line=>line.replace(/[\t ]+/g,' ').trim()).filter(Boolean).join('\n');
}
function plain(html){return String(html||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
