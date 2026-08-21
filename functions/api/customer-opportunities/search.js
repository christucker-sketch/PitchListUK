import { opportunitySnapshot } from '../../_data/opportunities.mjs';
import { accessTokenCookie, checkoutSessionAccess, getCookie, json as stripeJson, resolveCanonicalEntitlement, resolveCanonicalTokenBinding, sessionCookie } from '../../_lib/stripe.mjs';

function json(payload, status = 200, headers = {}) {
  return stripeJson(payload, status, headers);
}

async function accessContext(request, env, url) {
  if (['1', 'true', 'yes'].includes(String(env.PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS || '').toLowerCase())) {
    return { mode: 'subscriber', reason: 'public_full_access' };
  }

  const required = env.PITCHLIST_DATABASE_ACCESS_CODE || '';
  if (required && url.searchParams.get('access') === required) return { mode: 'subscriber', reason: 'access_code' };
  if (required && request.headers.get('x-pitchlist-access') === required) return { mode: 'subscriber', reason: 'access_code' };
  const cookie = request.headers.get('cookie') || '';
  if (required && cookie.split(';').map(value => value.trim()).includes(`pitchlist_database_access=${required}`)) {
    return { mode: 'subscriber', reason: 'access_code' };
  }

  const sessionId = String(
    url.searchParams.get('session_id')
    || request.headers.get('x-pitchlist-session')
    || getCookie(request, 'pitchlist_session_id')
    || ''
  ).trim();
  if (sessionId) {
    try {
      const access = await checkoutSessionAccess(env, sessionId);
      if (access.allowed) {
        return {
          mode: 'subscriber',
          reason: 'stripe_session',
          session_id: sessionId,
          email: access.email,
          set_cookie: sessionCookie(sessionId)
        };
      }
    } catch {
      // Fall through to access-token checks; a stale checkout cookie should not block a valid email unlock.
    }
  }

  const token = String(
    url.searchParams.get('access_token')
    || request.headers.get('x-pitchlist-access-token')
    || getCookie(request, 'pitchlist_access_token')
    || ''
  ).trim();
  if (token) {
    const entitlement = resolveCanonicalEntitlement(await resolveCanonicalTokenBinding(env, token));
    if (entitlement.allowed) {
      return {
        mode: 'subscriber',
        reason: 'stripe_access_token',
        email: entitlement.email,
        customer: entitlement.customer,
        set_cookie: accessTokenCookie(token)
      };
    }
    return { mode: 'preview', reason: 'stripe_access_token_invalid' };
  }

  return { mode: 'preview', reason: 'not_subscribed' };
}

function normalisePostcode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function outcodeFrom(value) {
  const compact = normalisePostcode(value);
  if (!compact) return '';
  if (/^\w+\d[A-Z]{2}$/.test(compact) && compact.length > 3) return compact.slice(0, -3);
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match ? match[1] : compact;
}

const FULL_POSTCODE = /^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/;
const OUTCODE = /^(?:GIR|[A-Z]{1,2}\d[A-Z\d]?)$/;
const TRUNCATED_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d$/;

function postcodeCandidates(value) {
  const requested = normalisePostcode(value);
  if (!requested) return [];
  if (FULL_POSTCODE.test(requested)) {
    const outcode = requested === 'GIR0AA' ? 'GIR' : requested.slice(0, -3);
    return [
      { type: 'postcodes', value: requested },
      { type: 'outcodes', value: outcode }
    ];
  }
  if (!OUTCODE.test(requested)) return [];
  const candidates = [{ type: 'outcodes', value: requested }];
  if (TRUNCATED_POSTCODE.test(requested)) {
    const shorter = requested.slice(0, -1);
    if (OUTCODE.test(shorter) && shorter !== requested) {
      candidates.push({ type: 'outcodes', value: shorter });
    }
  }
  return candidates;
}

function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

async function resolveOrigin(value) {
  const requested = normalisePostcode(value);
  if (!requested) return null;
  const candidates = postcodeCandidates(requested);
  if (!candidates.length) throw new Error(`Could not resolve postcode/outcode: ${value}`);
  for (const [index, candidate] of candidates.entries()) {
    const url = `https://api.postcodes.io/${candidate.type}/${encodeURIComponent(candidate.value)}`;
    const response = await fetch(url);
    if (!response.ok) continue;
    const body = await response.json();
    const result = body.result || {};
    if (Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude))) {
      return {
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
        outcode: candidate.type === 'outcodes' ? candidate.value : outcodeFrom(candidate.value),
        postcode_resolution: {
          requested,
          resolved: candidate.value,
          fallback_used: index > 0
        }
      };
    }
  }
  throw new Error(`Could not resolve postcode/outcode: ${value}`);
}

function categoryPhrases(value) {
  return String(value || '').toLowerCase().split(/[,\n]+/).map(v => v.trim()).filter(Boolean);
}

const CATEGORY_ALIASES = [
  {
    match: /coffee|matcha|espresso|latte|cappuccino|cafe|café|hot drink|tea\b|bubble tea/,
    terms: ['coffee', 'hot drinks', 'drinks', 'beverages', 'dessert'],
    food: true
  },
  {
    match: /toastie|toasties|sandwich|panini|bagel|cuban|wrap|snack/,
    terms: ['sandwich', 'hot food', 'snacks'],
    food: true
  },
  {
    match: /bar|cocktail|prosecco|fizz|beer|wine|gin|rum|alcohol|mobile bar|drinks?/,
    terms: ['bar', 'drinks', 'beverages', 'independent drinks'],
    food: true
  },
  {
    match: /pizza|burger|bbq|grill|taco|burrito|curry|noodle|loaded|fries|wings|kebab|gyros|wrap/,
    terms: ['hot food'],
    food: true
  },
  {
    match: /cake|bakery|bakes|dessert|ice cream|donut|doughnut|waffle|crepe|sweet/,
    terms: ['dessert', 'bakery', 'artisan'],
    food: true
  },
  {
    match: /craft|artisan|maker|gift|jewellery|jewelry|ceramic|candle|soap|art\b/,
    terms: ['crafts', 'artisan', 'makers', 'stallholders', 'exhibitors'],
    food: false
  },
  {
    match: /food|cater|vendor|trader|street food|truck|trailer|stall/,
    terms: ['food traders', 'street food', 'mobile catering', 'hot food'],
    food: true
  }
];

const FOOD_TRADER_FALLBACK_TERMS = [
  'food traders',
  'street food',
  'mobile catering',
  'hot food',
  'event concessions',
  'food festival',
  'food vendor',
  'food and drink'
];

function categoryIntent(value) {
  const direct = new Set();
  const aliases = new Set();
  let food = false;
  for (const phrase of categoryPhrases(value)) {
    direct.add(phrase);
    for (const token of phrase.split(/\s+/).map(v => v.trim()).filter(v => v.length > 2)) {
      direct.add(token);
    }
    for (const group of CATEGORY_ALIASES) {
      if (group.match.test(phrase)) {
        for (const term of group.terms) aliases.add(term);
        if (group.food) food = true;
      }
    }
  }
  for (const term of direct) aliases.delete(term);
  return { direct: [...direct], aliases: [...aliases], food };
}

function categoryMatchBasis(row, requestedCategory) {
  const intent = categoryIntent(requestedCategory);
  if (!intent.direct.length) return 'none';
  if (intent.direct.some(term => row._search.includes(term))) return 'direct';
  if (intent.aliases.some(term => row._search.includes(term))) return 'alias';
  if (intent.food && FOOD_TRADER_FALLBACK_TERMS.some(term => row._search.includes(term))) {
    return 'broad_food_fallback';
  }
  return '';
}

const NEUTRAL_KEYWORD_INTENT = /^(?:pitch|pitches|opportunity|opportunities)$/;
const MARKET_KEYWORD_INTENT = /^(?:market|markets)$/;
const MARKET_SIGNAL = /\b(?:markets?|marketplace|farmers?\s+market|artisan\s+market|street\s+market|stallholders?)\b/;

function keywordPhrases(value) {
  return String(value || '').toLowerCase().split(/[,\n]+/).map(v => v.trim()).filter(Boolean);
}

function keywordIntent(value) {
  const direct = new Set();
  let neutral = false;
  let market = false;
  for (const phrase of keywordPhrases(value)) {
    if (NEUTRAL_KEYWORD_INTENT.test(phrase)) {
      neutral = true;
      continue;
    }
    if (MARKET_KEYWORD_INTENT.test(phrase)) {
      market = true;
      continue;
    }
    direct.add(phrase);
    for (const token of phrase.split(/\s+/).map(v => v.trim()).filter(v => v.length > 2)) {
      if (NEUTRAL_KEYWORD_INTENT.test(token)) neutral = true;
      else if (MARKET_KEYWORD_INTENT.test(token)) market = true;
      else direct.add(token);
    }
  }
  return { direct: [...direct], neutral, market };
}

function marketSearchable(row) {
  return [
    row.route_type,
    row.event_name,
    row.location,
    row.organiser,
    row.vendor_categories,
    row.notes
  ].join(' ').toLowerCase().replace(/[_-]+/g, ' ');
}

function keywordMatchBasis(row, requestedKeywords) {
  const intent = keywordIntent(requestedKeywords);
  if (!intent.direct.length && !intent.market) return intent.neutral ? 'neutral' : 'none';
  if (intent.market && MARKET_SIGNAL.test(row._market_search)) return 'market';
  if (intent.direct.some(term => row._search.includes(term))) return 'direct';
  return '';
}

function searchable(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.county,
    row.region,
    row.route_type,
    row.organiser_type,
    row.buyer_fit_tags,
    row.quality_status,
    row.vendor_categories,
    row.notes
  ].join(' ').toLowerCase();
}

function sourceHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function previewRow(row) {
  return {
    ...row,
    locked: true,
    source_host: sourceHost(row.source_url),
    application_url: '',
    source_url: '',
    notes: row.notes ? 'Full source and application route unlock after trial signup.' : ''
  };
}

function statusSummary(rows) {
  return rows.reduce((summary, row) => {
    const key = String(row.freshness_status || 'unknown').toLowerCase() || 'unknown';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

function isBroadAreaCentroid(row) {
  if (String(row.coordinate_precision || '').toLowerCase() !== 'place') return false;
  const label = String(row.coordinate_label || '').trim().toLowerCase();
  if (!label) return false;
  const county = String(row.county || '').trim().toLowerCase();
  const region = String(row.region || '').trim().toLowerCase();
  const broadLabels = new Set([
    'london',
    'scotland',
    'wales',
    'northern ireland',
    'south east',
    'south west',
    'north west',
    'north east',
    'midlands',
    'east of england'
  ]);
  return broadLabels.has(label) && (label === county || label === region);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const access = await accessContext(request, env, url);
  const fullAccess = access.mode === 'subscriber';

  const postcode = url.searchParams.get('postcode') || url.searchParams.get('outcode') || '';
  const radius = Number(url.searchParams.get('radius_miles') || url.searchParams.get('radius') || 0);
  const category = url.searchParams.get('category') || '';
  const keywords = url.searchParams.get('q') || '';
  const confidence = String(url.searchParams.get('confidence') || '').trim().toLowerCase();
  const searchFiltered = Boolean(postcode || category || keywords || confidence);
  const requestedLimit = Math.min(Math.max(Number(url.searchParams.get('limit') || 75), 1), 250);
  const requestedOffset = Math.min(Math.max(Number(url.searchParams.get('offset') || 0), 0), 10000);
  const previewLimit = 50;
  const limit = fullAccess ? requestedLimit : Math.min(requestedLimit, previewLimit);

  let origin = null;
  if (postcode) {
    try {
      origin = await resolveOrigin(postcode);
    } catch (err) {
      return json({ error: 'postcode_not_found', message: err.message }, 400);
    }
  }

  const preparedRows = opportunitySnapshot.rows.map(row => {
    const coords = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
      : null;
    const distance = origin && coords ? haversineMiles(origin, coords) : null;
    return {
      ...row,
      distance_miles: distance === null ? null : Math.round(distance * 10) / 10,
      _broad_area_centroid: isBroadAreaCentroid(row),
      _search: searchable(row),
      _market_search: marketSearchable(row)
    };
  });
  const geographicRows = preparedRows.filter(row => {
    if (confidence && String(row.confidence || '').toLowerCase() !== confidence) return false;
    if (origin && radius > 0 && (
      row.distance_miles === null ||
      row.distance_miles > radius ||
      (!['exact', 'place'].includes(row.coordinate_precision) && !row._broad_area_centroid)
    )) return false;
    return true;
  });
  const categorisedRows = geographicRows.map(row => ({
    ...row,
    _category_basis: categoryMatchBasis(row, category)
  }));
  const categoryRows = categorisedRows.filter(row => row._category_basis);
  const keywordRows = geographicRows.filter(row => keywordMatchBasis(row, keywords));
  const rows = categoryRows.map(row => ({
    ...row,
    _keyword_basis: keywordMatchBasis(row, keywords)
  })).filter(row => row._keyword_basis).sort((a, b) => {
    const categoryRank = { direct: 0, alias: 1, broad_food_fallback: 2, none: 3 };
    const confidenceRank = { high: 0, medium: 1, low: 2 };
    const categoryDifference = (categoryRank[a._category_basis] ?? 9) - (categoryRank[b._category_basis] ?? 9);
    if (categoryDifference) return categoryDifference;
    if (origin && a._broad_area_centroid !== b._broad_area_centroid) {
      return a._broad_area_centroid ? 1 : -1;
    }
    if (origin && a.distance_miles !== b.distance_miles) {
      if (a.distance_miles === null) return 1;
      if (b.distance_miles === null) return -1;
      return a.distance_miles - b.distance_miles;
    }
    return (confidenceRank[String(a.confidence || '').toLowerCase()] ?? 9) - (confidenceRank[String(b.confidence || '').toLowerCase()] ?? 9)
      || String(a.event_start || '9999').localeCompare(String(b.event_start || '9999'))
      || String(a.event_name || '').localeCompare(String(b.event_name || ''));
  });

  const visibleRows = fullAccess ? rows : rows.slice(0, previewLimit);
  const offset = Math.min(requestedOffset, visibleRows.length);
  const pageRows = visibleRows.slice(offset, offset + limit);
  const nextOffset = offset + pageRows.length < visibleRows.length ? offset + pageRows.length : null;
  const matchSummary = rows.reduce((summary, row) => {
    summary.category[row._category_basis] = (summary.category[row._category_basis] || 0) + 1;
    summary.keyword[row._keyword_basis] = (summary.keyword[row._keyword_basis] || 0) + 1;
    return summary;
  }, { category: {}, keyword: {} });
  const recovery = {
    geographic_matches: geographicRows.length,
    without_keywords: {
      count: categoryRows.length,
      recovers_matches: Boolean(keywords) && categoryRows.length > rows.length
    },
    without_category: {
      count: keywordRows.length,
      recovers_matches: Boolean(category) && keywordRows.length > rows.length
    },
    without_category_and_keywords: {
      count: geographicRows.length,
      recovers_matches: Boolean(category || keywords) && geographicRows.length > rows.length
    }
  };

  return json({
    updated: opportunitySnapshot.exported_at,
    source: opportunitySnapshot.source,
    access: fullAccess ? 'subscriber' : 'preview',
    access_reason: access.reason,
    account_email: fullAccess ? (access.email || '') : '',
    preview_limit: fullAccess ? null : previewLimit,
    locked_fields: fullAccess ? [] : ['application_url', 'source_url'],
    total: opportunitySnapshot.total,
    count: rows.length,
    offset,
    returned: pageRows.length,
    next_offset: nextOffset,
    has_more: nextOffset !== null,
    recovery,
    match_summary: matchSummary,
    status_summary: statusSummary(rows),
    search_filtered: searchFiltered,
    postcode_resolution: origin?.postcode_resolution || null,
    postcode_distance_ready: Boolean(origin),
    rows: pageRows.map(({ _search, _market_search, _broad_area_centroid, _category_basis, _keyword_basis, ...row }) => {
      const output = _broad_area_centroid
        ? { ...row, coordinate_precision: 'area', distance_miles: null }
        : row;
      const qualified = {
        ...output,
        match_basis: {
          category: _category_basis,
          keyword: _keyword_basis
        }
      };
      return fullAccess ? qualified : previewRow(qualified);
    })
  }, 200, access.set_cookie ? { 'set-cookie': access.set_cookie } : {});
}
