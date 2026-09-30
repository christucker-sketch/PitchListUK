import { normalizeEnrichment } from '../customer/enrichment.mjs';
import { extractNamedFields } from './named-fields.mjs';
import { isTerminalPdfError } from '../providers/fetch/pdf-error-policy.mjs';

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

export async function runEnrichmentBatch(db, { fetchProvider, now = new Date(), limit = DEFAULT_LIMIT } = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_enrichment_db_missing');
  if (!fetchProvider?.fetch) throw new Error('findpitches_v2_enrichment_fetch_missing');
  const timestamp=now.toISOString();
  const leaseUntil=new Date(now.getTime()+LEASE_MINUTES*60000).toISOString();
  await db.prepare("UPDATE enrichment_queue SET status='dead',lease_until=NULL,updated_at=? WHERE attempts>=? AND status IN ('ready','leased')").bind(timestamp,MAX_ATTEMPTS).run();
  const rows=await db.prepare(
    `SELECT q.candidate_id,q.attempts,q.source_last_checked,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json
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
    if(!/(apply|application|vendor|trader|stall|exhibit|market|event info|contact)/.test(label+" "+m[1])) continue;
    try{out.push(new URL(m[1],base).toString());}catch{}
  }
  return out;
}
function sameSite(a,b){try{const x=new URL(a).hostname.replace(/^www\./,''),y=new URL(b).hostname.replace(/^www\./,'');return x===y;}catch{return false;}}

function extractEnrichment(row,pages){
  const docs=pages.map(p=>({url:p.final_url,text:plain(p.body)}));
  const joined=docs.map(d=>d.text).join("\n");
  const geography=parse(row.geography_json);
  const named=extractNamedFields(pages.map(p=>({url:p.final_url,body:p.body})));
  const result={
    organiser:named.organiser ?? evidenceField(row.organiser,docs),
    location:named.location,
    location_area:extractSupportedAreaEvidence(geography,docs)
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
export function extractSupportedAreaEvidence(geography,docs){
 const candidates=[geography?.locality,geography?.subregion,geography?.region].map(x=>String(x||'').trim()).filter(Boolean);
 for(const name of candidates){
  if(name.length<3)continue;
  const mentionText=name.toLowerCase();
  for(const doc of docs){
   const sentences=String(doc.text||'').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
   for(const sentence of sentences){
    if(sentence.length>500||!sentence.toLowerCase().includes(mentionText))continue;
    if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing|office|headquarters)\b/i.test(sentence))continue;
    if(!/\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(sentence))continue;
    return {value:name,precision:supportedAreaPrecision(name,geography),evidence:[{source:doc.url,excerpt:sentence.slice(0,240)}],confidence:.72};
   }
  }
 }
 return null;
}
function supportedAreaPrecision(name,geography){
 const value=String(name||'').trim();
 if(geography?.locality && value.toLowerCase()===String(geography.locality).trim().toLowerCase())return 'place';
 if(geography?.subregion && value.toLowerCase()===String(geography.subregion).trim().toLowerCase())return 'area';
 if(/\b(?:county|shire|province|territory|region|district|state)\b/i.test(value))return 'area';
 if(/\s+[A-Z]{2}$/.test(value))return 'place';
 return 'area';
}
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
function plain(html){return String(html||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
