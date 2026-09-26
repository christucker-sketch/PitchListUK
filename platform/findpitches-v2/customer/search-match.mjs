// Pure in-memory matcher for the customer API contract.
// This proves search semantics before any D1/index implementation.

export function matchesCustomerSearch(document = {}, query = {}) {
  if (query.market && upper(document.market) !== upper(query.market)) return false;
  if (query.region_code && text(document.region_code) !== text(query.region_code)) return false;

  const haystack = normalize(document.search_text ?? (document.searchable_terms || []).join(' '));
  if (query.q && !containsAll(haystack, query.q)) return false;

  const offeringTerms = normalize((document.offering_terms || []).join(' '));
  if (query.offering && !containsAll(offeringTerms, query.offering)) return false;

  const cuisine = normalize(query.cuisine);
  if (cuisine && !(document.display?.offerings || []).some(item => normalize(item?.cuisine).includes(cuisine))) return false;

  return true;
}

export function filterCustomerSearch(documents = [], query = {}) {
  return Object.freeze(documents.filter(document => matchesCustomerSearch(document, query)));
}

function containsAll(haystack, needle) {
  const words=normalize(needle).split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every(word => haystack.includes(word));
}
function normalize(value){return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').trim();}
function text(value){const v=String(value ?? '').trim();return v||null;}
function upper(value){const v=text(value);return v?v.toUpperCase():null;}
