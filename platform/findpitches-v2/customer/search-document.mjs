// Pure customer search document builder.
// Produces displayable/searchable text from customer-ready opportunities without touching D1.

export function buildCustomerSearchDocument(opportunity = {}) {
  const offerings = Array.isArray(opportunity.offerings) ? opportunity.offerings : [];
  const offeringTerms = unique(offerings.flatMap(item => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];
    return [item.label, item.kind, item.cuisine, item.product];
  }));

  const display = Object.freeze({
    title: text(opportunity.title),
    organiser: text(opportunity.organiser),
    location: text(opportunity.location),
    offerings: Object.freeze(offerings.map(displayOffering).filter(Boolean))
  });

  const searchableTerms = unique([
    opportunity.title,
    opportunity.organiser,
    opportunity.location,
    opportunity.region_code,
    ...offeringTerms
  ]);

  return Object.freeze({
    id: text(opportunity.id),
    market: upper(opportunity.market),
    region_code: text(opportunity.region_code),
    display,
    offering_terms: Object.freeze(offeringTerms),
    searchable_terms: Object.freeze(searchableTerms),
    search_text: searchableTerms.join(' ')
  });
}

function displayOffering(item) {
  if (typeof item === 'string') {
    const label=text(item); return label ? Object.freeze({label,kind:null,cuisine:null,product:null}) : null;
  }
  if (!item || typeof item !== 'object') return null;
  const label=text(item.label ?? item.name);
  return label ? Object.freeze({label,kind:text(item.kind),cuisine:text(item.cuisine),product:text(item.product)}) : null;
}
function unique(values) {
  const seen=new Set(), out=[];
  for (const value of values) {
    const v=text(value); if (!v) continue;
    const key=v.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key); out.push(v);
  }
  return out;
}
function text(value){const v=String(value ?? '').trim();return v||null;}
function upper(value){const v=text(value);return v?v.toUpperCase():null;}
