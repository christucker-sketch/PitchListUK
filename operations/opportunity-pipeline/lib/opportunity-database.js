const fs = require('fs');
const path = require('path');
const { normaliseCounty } = require('./geo-normalise');
const { haversineMiles, rowCoordinates } = require('./geo-radius');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (quoted && c === '"' && n === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && c === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
  }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}

function uniq(values) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function daysSince(value, now = new Date()) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((now.getTime() - parsed.getTime()) / 86400000);
}

function freshness(row, now = new Date()) {
  const age = daysSince(row.last_checked, now);
  if (age === null) return { status: 'unknown', age_days: null };
  if (age <= 14) return { status: 'fresh', age_days: age };
  if (age <= 45) return { status: 'aging', age_days: age };
  return { status: 'stale', age_days: age };
}

function enrich(row, index, now = new Date()) {
  const county = row.region || row.location ? normaliseCounty(row.region, row.location) : 'Unknown';
  const fresh = freshness(row, now);
  const searchable = [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    county,
    row.vendor_categories,
    row.buyer_fit_tags,
    row.route_type,
    row.organiser_type,
    row.country,
    row.jurisdiction,
    row.currency,
    row.market_domain,
    row.quality_status,
    row.notes,
    row.stall_fee,
    row.application_url,
    row.source_url
  ].join(' ').toLowerCase();
  return {
    id: row.id || `OPP-${String(index + 1).padStart(5, '0')}`,
    county,
    freshness_status: fresh.status,
    freshness_age_days: fresh.age_days,
    search_text: searchable,
    ...row
  };
}

function loadOpportunityDatabase(root, now = new Date()) {
  const file = path.join(root, 'data/events-active.csv');
  const rows = parseCsv(fs.readFileSync(file, 'utf8')).map((row, index) => enrich(row, index, now));
  return {
    rows,
    source_file: 'data/events-active.csv',
    updated: new Date().toISOString(),
    total: rows.length
  };
}

function includesText(row, query) {
  if (!query) return true;
  return query.split(/\s+/).filter(Boolean).every(part => row.search_text.includes(part.toLowerCase()));
}

function splitTerms(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function categoryPhrases(value) {
  return String(value || '').toLowerCase().split(/[,\n]+/).map(v => v.trim()).filter(Boolean);
}

const CATEGORY_ALIASES = [
  {
    match: /coffee|matcha|espresso|latte|cappuccino|cafe|café|hot drink|tea\b|bubble tea/,
    terms: ['coffee', 'hot drinks', 'drinks', 'beverages', 'dessert', 'food traders', 'street food', 'mobile catering', 'market']
  },
  {
    match: /toastie|toasties|sandwich|panini|bagel|cuban|wrap|snack/,
    terms: ['sandwich', 'hot food', 'snacks', 'street food', 'mobile catering', 'food traders', 'market']
  },
  {
    match: /bar|cocktail|prosecco|fizz|beer|wine|gin|rum|alcohol|mobile bar|drinks?/,
    terms: ['bar', 'drinks', 'beverages', 'independent drinks', 'food traders', 'street food', 'festival', 'market']
  },
  {
    match: /pizza|burger|bbq|grill|taco|burrito|curry|noodle|loaded|fries|wings|kebab|gyros|wrap/,
    terms: ['street food', 'hot food', 'mobile catering', 'food traders', 'festival', 'market']
  },
  {
    match: /cake|bakery|bakes|dessert|ice cream|donut|doughnut|waffle|crepe|sweet/,
    terms: ['dessert', 'bakery', 'food traders', 'street food', 'market', 'artisan']
  },
  {
    match: /craft|artisan|maker|gift|jewellery|jewelry|ceramic|candle|soap|art\b/,
    terms: ['crafts', 'artisan', 'market', 'stallholders', 'exhibitors']
  },
  {
    match: /food|cater|vendor|trader|street food|truck|trailer|stall/,
    terms: ['food traders', 'street food', 'mobile catering', 'stallholders', 'event concessions', 'market']
  }
];

function expandedCategoryTerms(value) {
  const terms = new Set();
  for (const phrase of categoryPhrases(value)) {
    terms.add(phrase);
    for (const token of phrase.split(/\s+/).map(v => v.trim()).filter(v => v.length > 2)) {
      terms.add(token);
    }
    for (const group of CATEGORY_ALIASES) {
      if (group.match.test(phrase)) {
        for (const term of group.terms) terms.add(term);
      }
    }
  }
  return [...terms].filter(Boolean);
}

function categoryMatches(row, requestedCategory) {
  const terms = expandedCategoryTerms(requestedCategory);
  if (!terms.length) return true;
  return terms.some(term => row.search_text.includes(term));
}

function searchOpportunities(root, filters = {}, now = new Date()) {
  const db = loadOpportunityDatabase(root, now);
  const query = String(filters.q || '').trim();
  const county = String(filters.county || '').trim();
  const category = String(filters.category || '').trim();
  const confidence = String(filters.confidence || '').trim().toLowerCase();
  const freshnessStatus = String(filters.freshness || '').trim().toLowerCase();
  const country = String(filters.country || '').trim().toLowerCase();
  const jurisdiction = String(filters.jurisdiction || '').trim().toLowerCase();
  const currency = String(filters.currency || '').trim().toLowerCase();
  const marketDomain = String(filters.market_domain || filters.domain || '').trim().toLowerCase();
  const audience = String(filters.audience || filters.mode || 'admin').trim().toLowerCase();
  const includeStale = ['1', 'true', 'yes'].includes(String(filters.include_stale || '').toLowerCase());
  const includeExpired = ['1', 'true', 'yes'].includes(String(filters.include_expired || '').toLowerCase());
  const origin = filters.origin && Number.isFinite(Number(filters.origin.latitude)) && Number.isFinite(Number(filters.origin.longitude))
    ? { latitude: Number(filters.origin.latitude), longitude: Number(filters.origin.longitude) }
    : null;
  const radiusMiles = Number(filters.radius_miles || filters.radius || 0);
  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 1000);

  const rowsWithDistance = db.rows.map(row => {
    const coords = rowCoordinates(row);
    const distance = origin && coords ? haversineMiles(origin, coords) : null;
    return {
      ...row,
      latitude: coords ? coords.latitude : null,
      longitude: coords ? coords.longitude : null,
      coordinate_source: coords ? coords.source : '',
      coordinate_precision: coords ? coords.precision : '',
      coordinate_label: coords ? coords.label : '',
      distance_miles: distance === null ? null : Math.round(distance * 10) / 10
    };
  });

  const filtered = rowsWithDistance.filter(row => {
    if (!includeExpired && String(row.lifecycle_status || '').toLowerCase() === 'expired') return false;
    if (audience === 'customer' && !includeStale && !['fresh', 'aging'].includes(row.freshness_status)) return false;
    if (origin && radiusMiles > 0 && (row.distance_miles === null || row.distance_miles > radiusMiles)) return false;
    if (!includesText(row, query)) return false;
    if (county && row.county.toLowerCase() !== county.toLowerCase() && String(row.region || '').toLowerCase() !== county.toLowerCase()) return false;
    if (confidence && String(row.confidence || '').toLowerCase() !== confidence) return false;
    if (freshnessStatus && row.freshness_status !== freshnessStatus) return false;
    if (country && String(row.country || '').toLowerCase() !== country) return false;
    if (jurisdiction && String(row.jurisdiction || '').toLowerCase() !== jurisdiction) return false;
    if (currency && String(row.currency || '').toLowerCase() !== currency) return false;
    if (marketDomain && String(row.market_domain || '').toLowerCase() !== marketDomain) return false;
    if (!categoryMatches(row, category)) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    const confidenceRank = { high: 0, medium: 1, low: 2 };
    const freshRank = { fresh: 0, aging: 1, stale: 2, unknown: 3 };
    if (origin && a.distance_miles !== b.distance_miles) {
      if (a.distance_miles === null) return 1;
      if (b.distance_miles === null) return -1;
      return a.distance_miles - b.distance_miles;
    }
    return (freshRank[a.freshness_status] ?? 9) - (freshRank[b.freshness_status] ?? 9)
      || (confidenceRank[String(a.confidence || '').toLowerCase()] ?? 9) - (confidenceRank[String(b.confidence || '').toLowerCase()] ?? 9)
      || String(a.event_start || '9999').localeCompare(String(b.event_start || '9999'))
      || String(a.event_name || '').localeCompare(String(b.event_name || ''));
  });

  return {
    updated: db.updated,
    source_file: db.source_file,
    total: db.total,
    count: filtered.length,
    returned: Math.min(sorted.length, limit),
    filters: {
      q: query,
      county,
      category: expandedCategoryTerms(category),
      confidence,
      freshness: freshnessStatus,
      country,
      jurisdiction,
      currency,
      market_domain: marketDomain,
      audience,
      include_stale: includeStale,
      include_expired: includeExpired,
      postcode: filters.postcode || filters.outcode || '',
      radius_miles: Number.isFinite(radiusMiles) ? radiusMiles : 0,
      limit
    },
    facets: {
      counties: uniq(db.rows.map(r => r.county)),
      confidence: uniq(db.rows.map(r => r.confidence)),
      freshness: uniq(db.rows.map(r => r.freshness_status)),
      countries: uniq(db.rows.map(r => r.country)),
      jurisdictions: uniq(db.rows.map(r => r.jurisdiction)),
      currencies: uniq(db.rows.map(r => r.currency)),
      market_domains: uniq(db.rows.map(r => r.market_domain))
    },
    postcode_distance_ready: Boolean(origin),
    postcode_distance_note: origin ? 'Radius search uses postcode/outcode origin. Opportunities use row coordinates when present, then known place centroids, then area centroids.' : 'Provide postcode and radius_miles to enable radius search.',
    rows: sorted.slice(0, limit).map(({ search_text, ...row }) => row)
  };
}

function stalePriority(row) {
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  const freshnessRank = { stale: 0, unknown: 1, aging: 2, fresh: 3 };
  const ageRank = row.freshness_age_days === null ? 9999 : -row.freshness_age_days;
  return [
    freshnessRank[row.freshness_status] ?? 9,
    confidenceRank[String(row.confidence || '').toLowerCase()] ?? 9,
    ageRank,
    String(row.event_start || '9999'),
    String(row.event_name || '')
  ];
}

function comparePriority(a, b) {
  const ap = stalePriority(a);
  const bp = stalePriority(b);
  for (let i = 0; i < ap.length; i++) {
    if (typeof ap[i] === 'number' || typeof bp[i] === 'number') {
      const diff = Number(ap[i]) - Number(bp[i]);
      if (diff) return diff;
    } else {
      const diff = String(ap[i]).localeCompare(String(bp[i]));
      if (diff) return diff;
    }
  }
  return 0;
}

function freshnessReviewQueue(root, options = {}, now = new Date()) {
  const limit = Math.min(Math.max(Number(options.limit || 75), 1), 250);
  const includeExpired = ['1', 'true', 'yes'].includes(String(options.include_expired || '').toLowerCase());
  const db = loadOpportunityDatabase(root, now);
  const needsReview = db.rows
    .filter(row => (includeExpired || String(row.lifecycle_status || '').toLowerCase() !== 'expired') && ['stale', 'unknown'].includes(row.freshness_status))
    .sort(comparePriority);
  const byCounty = new Map();
  for (const row of needsReview) {
    const stat = byCounty.get(row.county) || { county: row.county, stale: 0, unknown: 0, high_confidence: 0, total: 0 };
    stat.total++;
    if (row.freshness_status === 'stale') stat.stale++;
    if (row.freshness_status === 'unknown') stat.unknown++;
    if (String(row.confidence || '').toLowerCase() === 'high') stat.high_confidence++;
    byCounty.set(row.county, stat);
  }
  const summary = {
    fresh: db.rows.filter(r => r.freshness_status === 'fresh').length,
    aging: db.rows.filter(r => r.freshness_status === 'aging').length,
    stale: db.rows.filter(r => r.freshness_status === 'stale').length,
    unknown: db.rows.filter(r => r.freshness_status === 'unknown').length
  };
  return {
    updated: db.updated,
    source_file: db.source_file,
    total: db.total,
    needs_review: needsReview.length,
    returned: Math.min(needsReview.length, limit),
    summary,
    county_summary: Array.from(byCounty.values()).sort((a, b) => b.high_confidence - a.high_confidence || b.total - a.total || a.county.localeCompare(b.county)),
    rows: needsReview.slice(0, limit).map(({ search_text, ...row }) => row)
  };
}

module.exports = {
  parseCsv,
  daysSince,
  freshness,
  loadOpportunityDatabase,
  searchOpportunities,
  freshnessReviewQueue
};
