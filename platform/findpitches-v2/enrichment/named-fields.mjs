import { assessVenueEvidence } from './venue-evidence.mjs';
// Conservative, source-backed extraction for HTML and extracted PDF text.
// Match explicit labelled statements, never infer a value from search geography.
const ORGANISER_PATTERNS = [
  /\b(?:organis(?:er|ation)|organiz(?:er|ation))\s*:\s*([^\n.!?;|]{3,100})/i,
  /\b(?:organis(?:ed|er|ing)|organiz(?:ed|er|ing))\s+by\s*[:\-]?\s*([^\n.!?;|]{3,100})/i,
  /\b(?:event\s+organis(?:er|er)|event\s+organiz(?:er|ation)|hosted\s+by|presented\s+by)\s*[:\-]?\s*([^\n.!?;|]{3,100})/i
];
const LOCATION_PATTERNS = [
  /\b(?:event\s+venue|venue|event\s+location|location|held\s+at|taking\s+place\s+at)\s*[:\-]?\s*([^\n.!?;|]{3,130})/i
];
const STOP = /\s+(?:application\s+deadline|deadline|apply\s+now|register\s+now|book\s+now|terms\s+and\s+conditions|contact\s+us|click\s+here)\b.*$/i;

function clean(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').replace(STOP, '').trim()
    .replace(/^[\s:;,\-]+|[\s:;,\-]+$/g, '');
  if (!text || text.length < 3 || /^(?:tbc|tbd|unknown|n\/a|here|us|you|the event|the organiser|the organizer|the venue)$/i.test(text)) return null;
  if (/https?:\/\/|www\.|@|<|>|\d{5,}/i.test(text)) return null;
  // Do not swallow an entire paragraph or a neighbouring labelled field.
  if (/\b(?:organis(?:ed|er)|organiz(?:ed|er)|venue|location|deadline)\s*:/i.test(text)) return null;
  return text;
}

function scan(docs, patterns) {
  for (const doc of docs) {
    // Preserve line boundaries from extracted PDF text and HTML tag breaks.
    const source = String(doc.body ?? doc.text ?? '').replace(/<\/(?:p|div|h[1-6]|li|section|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|apos);/gi, match => ({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'"})[match.toLowerCase()] || match);
    for (const line of source.split(/\r?\n/)) {
      const bounded = line.replace(/[\t ]+/g, ' ').trim();
      if (!bounded || bounded.length > 500) continue;
      for (const pattern of patterns) {
        const match = pattern.exec(bounded);
        if (!match) continue;
        // An organiser's contact/registered office is not the event venue.
        if (patterns === LOCATION_PATTERNS) {
          const prefix = bounded.slice(Math.max(0, match.index - 35), match.index);
          if (/(?:office|headquarters|registered|postal|mailing|contact|business)\s+$/i.test(prefix)) continue;
        }
        const value = clean(match[1]);
        if (!value) continue;
        if (patterns === LOCATION_PATTERNS && !assessVenueEvidence(value, bounded).accepted) continue;
        // Source and exact matched statement, not a guessed region/candidate title.
        return {value, evidence:[{source:doc.url,excerpt:(patterns === LOCATION_PATTERNS ? bounded : match[0]).slice(0,220)}],confidence:0.88};
      }
    }
  }
  return null;
}
export function extractNamedFields(docs = []) {
  return Object.freeze({
    organiser: scan(docs, ORGANISER_PATTERNS),
    location: scan(docs, LOCATION_PATTERNS)
  });
}
