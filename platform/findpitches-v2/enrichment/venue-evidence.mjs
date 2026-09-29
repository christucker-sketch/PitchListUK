// Shared conservative semantic check for candidate event VENUES. This is a
// promotion/extraction safeguard, not geocoding, not a substitute for a human
// venue audit, and not proof that an event is current.
// Use the same predicate in extraction AND the customer projection gate.
const NEGATIVE_CONTEXT = /\b(?:registered|head|corporate|business|contact|mailing|postal|billing|organiser|organizer|vendor|exhibitor)\s+(?:office|address|location|headquarters|contact)|\b(?:our\s+office|our\s+address|mail\s+to|contact\s+us|registered\s+at|terms\s+and\s+conditions)\b/i;
const NON_VENUE = /\b(?:in\s+real[\s-]*time|booth\s+(?:placement|position|allocation|location|number)|stall\s+(?:placement|allocation|number)|your\s+(?:booth|stall)\s+(?:location|position)|subject\s+to\s+change|applicable\s+(?:regulation|law)|privacy\s+policy|cookie\s+policy|terms\s+of\s+service|where\s+applicable|location\s+services|your\s+current\s+location|click\s+here|learn\s+more|download\s+(?:the\s+)?app)\b/i;
const PLACEHOLDER = /^(?:headquarters|office|head\s+office|contact\s+address|tba|tbc|tbd|unknown|n\/a|various|multiple|online|the\s+event|the\s+venue|the\s+location|here|there|in\s+real[\s-]*time)$/i;
// The first group is the value after a label that specifically denotes the event site.
// Generic "Location:" requires separate event context on the same bounded line.
// A bare noun "venue" in prose (venue restriction, venue tour, venue map,
// venue overnight) is not a location label. Require a real label delimiter,
// or an explicit "held at" statement tied to the event.
const VENUE_LABEL = /\b(?:event\s+venue|event\s+location|market\s+venue|festival\s+venue|show\s+venue|fair\s+venue|venue)\s*[:\-]\s*(.{3,160})/i;
const HELD_AT = /\b(?:held\s+at|taking\s+place\s+at|takes\s+place\s+at)\s+(.{3,160})/i;
const GENERIC_LOCATION = /\blocation\s*[:\-]\s*(.{3,160})/i;
const EVENT_CONTEXT = /\b(?:festival|fair|market|event|show|concert|held|taking\s+place|takes\s+place)\b/i;
const ABSTRACT_VALUE = /^(?:&|overnight\b|restriction\b|is\b|are\b|may\b|will\b|availability\b|rentals?\b|tour\b|map\b|noon\b|the\s+venue\b|the\s+event\b|hours\b)/i;
const NAMED_PLACE_START = /^(?:[A-Z][A-Za-z0-9'’.-]*|[0-9]+\s+[A-Za-z])/;

export function assessVenueEvidence(value, excerpt) {
  const name=String(value ?? '').replace(/\s+/g,' ').trim();
  const statement=String(excerpt ?? '').replace(/\s+/g,' ').trim();
  if (name.length < 3 || name.length > 160 || PLACEHOLDER.test(name) ||
      NON_VENUE.test(name) || NEGATIVE_CONTEXT.test(name) ||
      ABSTRACT_VALUE.test(name) || !NAMED_PLACE_START.test(name)) {
    return {accepted:false,reason:'invalid_venue_value'};
  }
  if (!statement || statement.length > 500 || !statement.toLowerCase().includes(name.toLowerCase())) {
    return {accepted:false,reason:'missing_exact_source_statement'};
  }
  // Office/contact text anywhere on a short excerpt is an ambiguity, not venue proof.
  if (NEGATIVE_CONTEXT.test(statement)) return {accepted:false,reason:'office_or_contact_context'};
  if (NON_VENUE.test(statement)) return {accepted:false,reason:'ui_policy_or_booth_context'};
  const venue=statement.match(VENUE_LABEL);
  const heldAt=statement.match(HELD_AT);
  const generic=statement.match(GENERIC_LOCATION);
  if (!venue && !heldAt && !(generic && EVENT_CONTEXT.test(statement.replace(GENERIC_LOCATION,'')))) {
    return {accepted:false,reason:'missing_event_venue_context'};
  }
  const extracted=String((venue || heldAt || generic)[1] || '').trim();
  // Require the named venue to begin at the value of the explicit event label,
  // not appear incidentally later in a paragraph about some other venue.
  if (!extracted.toLowerCase().startsWith(name.toLowerCase())) {
    return {accepted:false,reason:'label_value_mismatch'};
  }
  return {accepted:true,reason:'explicit_venue_statement'};
}

export function classifyVenueEvidence(field) {
  if (!field || typeof field !== 'object' || !('value' in field)) {
    return {accepted:false,reason:'no_source_backed_field'};
  }
  if (!Array.isArray(field.evidence) || !field.evidence.length) {
    return {accepted:false,reason:'missing_evidence'};
  }
  let last='missing_evidence';
  for (const item of field.evidence) {
    try {
      const url=new URL(String(item?.source||''));
      if (url.protocol!=='https:' && url.protocol!=='http:') {
        last='invalid_evidence_url';continue;
      }
    } catch {last='invalid_evidence_url';continue;}
    const result=assessVenueEvidence(field.value,item.excerpt);
    if (result.accepted) return {...result,evidence:item};
    last=result.reason;
  }
  return {accepted:false,reason:last};
}
