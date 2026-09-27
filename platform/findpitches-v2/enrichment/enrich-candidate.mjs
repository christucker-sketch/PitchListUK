// Serper-free enrichment lane for validated FindPitches opportunities.
// This worker only fetches URLs already discovered for a candidate.

const RELEVANT_LINK = /\b(apply|application|vendor|vendors|trader|traders|stallholder|exhibitor|market|event|contact)\b/i;

export async function enrichValidatedCandidate(candidate = {}, { fetchProvider, maxPages = 4 } = {}) {
  if (!fetchProvider?.fetch) throw new Error('findpitches_enrichment_fetch_provider_missing');
  const seeds = unique([candidate.canonical_url, candidate.application_url].filter(Boolean));
  const pages = [], visited = new Set();

  for (const url of seeds) {
    if (pages.length >= maxPages) break;
    await visit(url);
  }

  // Follow only a small same-site set of useful links. No search provider/Serper is used.
  const discoveredLinks = unique(pages.flatMap(page => extractLinks(page.body, page.final_url))
    .filter(link => sameSite(link, seeds))
    .filter(link => RELEVANT_LINK.test(link)));
  for (const url of discoveredLinks) {
    if (pages.length >= maxPages) break;
    await visit(url);
  }

  const evidence = pages.map(page => ({ source: page.final_url, excerpt: page.text.slice(0, 500) }));
  const combined = pages.map(page => page.text).join('\n');
  return Object.freeze({
    candidate_id: candidate.id ?? candidate.candidate_id ?? null,
    pages_fetched: pages.length,
    enrichment: Object.freeze({
      organiser: evidenceField(extractOrganiser(combined), evidence),
      location: evidenceField(extractLocation(combined), evidence),
      event_start: evidenceField(extractDate(combined, /(?:event|starts?|date)\s*[:\-]?\s*/i), evidence),
      application_deadline: evidenceField(extractDate(combined, /(?:deadline|applications? close|apply by)\s*[:\-]?\s*/i), evidence),
      description: evidenceField(extractDescription(pages), evidence)
    })
  });

  async function visit(url) {
    const key=String(url);
    if (visited.has(key)) return;
    visited.add(key);
    try {
      const page=await fetchProvider.fetch(key);
      const text=htmlToText(page.body);
      pages.push({...page,text});
    } catch {
      // One bad page must not fail the whole enrichment attempt.
    }
  }
}

function extractLinks(html, base) {
  const links=[];
  for (const match of String(html||'').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try { const url=new URL(match[1],base); if(['http:','https:'].includes(url.protocol)) links.push(url.toString()); } catch {}
  }
  return links;
}
function sameSite(url,seeds) {
  try {
    const host=new URL(url).hostname.replace(/^www\./,'');
    return seeds.some(seed=>{try{return new URL(seed).hostname.replace(/^www\./,'')===host;}catch{return false;}});
  } catch { return false; }
}
function htmlToText(html) {
  return String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
}
function extractDescription(pages) {
  const page=pages[0]; if(!page) return null;
  const match=String(page.body||'').match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || String(page.body||'').match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  return match?.[1]?.replace(/\s+/g,' ').trim() || null;
}
function extractDate(text,prefix) {
  const after=String(text||'').match(new RegExp(prefix.source+'([^.!|]{0,100})',prefix.flags));
  if(!after) return null;
  const date=after[1].match(/\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/i);
  return date?.[0] || null;
}
function extractOrganiser(text) {
  return String(text||'').match(/(?:organised|organized|hosted|presented)\s+by\s+([^|.!]{2,100})/i)?.[1]?.trim() || null;
}
function extractLocation(text) {
  return String(text||'').match(/(?:location|venue|where)\s*[:\-]\s*([^|.!]{3,140})/i)?.[1]?.trim() || null;
}
function evidenceField(value,evidence) {
  return value ? Object.freeze({value,evidence:Object.freeze(evidence),confidence:null}) : null;
}
function unique(values){return [...new Set(values)];}
