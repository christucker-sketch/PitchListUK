// Reference mapping: one producer record (findpitches-discovery-export-v1, as delivered to V3 by the Pi) →
// the opportunity object the V3 site renders (contract/V3_CUSTOMER_API.md §3.1).
// V3's API should apply the same rules server-side. Redaction of the paid fields (source_url, application_url) is a
// separate server step that depends on the signed-in user's plan (contract §3.1, "access").
// Pure function, no I/O. Used by dev/stub-server.mjs to build its fixtures.

const PLATFORM_NAMES = new Set(['ukcraftfairs.com', 'ukcraftfairs', 'cluemart', 'localstalls', 'eventeny', 'marketspread', 'entrythingy']);
const CURRENCY = { GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', IE: 'EUR', NZ: 'NZD', SG: 'SGD', HK: 'HKD' };

// Producer opportunity_type → site event type (contract §3.4)
export function siteType(rec) {
  const t = rec.opportunity_type;
  if (!t) return null;
  if (t === 'christmas_market') return rec.country_code === 'GB' || rec.country_code === 'IE' || rec.country_code === 'NZ' || rec.country_code === 'AU' ? 'christmas_market' : 'holiday_market';
  return ({
    food_festival: 'food_festival', festival: 'festival', music_festival: 'festival', street_festival: 'festival', cultural_event: 'festival',
    market: 'market', farmers_market: 'market', craft_fair: 'market', agricultural_show: 'show', exhibition: 'show',
    fair_fete: 'event', university_event: 'event', sporting_event: 'sport'
  })[t] || 'event';
}

// Producer vendor_categories → site "sells" (food | craft | market | general). Evidence only; never a default.
export function siteSells(rec) {
  const m = { food: 'food', craft: 'craft', art: 'craft', produce: 'market', retail: 'general', general: 'general' };
  return [...new Set((rec.vendor_categories || []).map(c => m[c]).filter(Boolean))];
}

const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// Producer application_state (+ dates) → site application status (contract §3.2). Evidence only.
export function siteApplication(rec, today) {
  const dl = rec.application_deadline || null;
  const end = rec.event_end || (rec.recurring ? null : rec.event_start);
  if (end && end < today) return { status: 'ended', deadline: dl, basis: 'event_dates' };
  switch (rec.application_state) {
    case 'OPEN_NOW': {
      if (dl) {
        const n = daysBetween(today, dl);
        if (n < 0) return { status: 'closed', deadline: dl, basis: 'deadline' };
        return { status: n <= 14 ? 'closing_soon' : 'open', deadline: dl, days_left: n, basis: 'deadline' };
      }
      return { status: 'open_now', deadline: null, basis: 'source' };
    }
    case 'ROLLING': return { status: 'rolling', deadline: dl, basis: 'source' };
    case 'ENQUIRY_AVAILABLE': return { status: 'enquire', deadline: null, basis: 'source' };
    case 'UPCOMING_NOT_OPEN': return { status: 'opens_later', deadline: null, opens_on: rec.applications_open_on || null, basis: 'source' };
    case 'CLOSED_CURRENT_CYCLE': return { status: 'closed', deadline: dl, basis: dl ? 'deadline' : 'source' };
    case 'HISTORICAL': return { status: 'ended', deadline: dl, basis: 'event_dates' };
    default: return { status: 'unknown', deadline: null, basis: null };
  }
}

export function cleanOrganiser(o) {
  if (!o || typeof o !== 'string') return null;
  const s = o.replace(/\s+/g, ' ').trim();
  return PLATFORM_NAMES.has(s.toLowerCase()) ? null : s || null;
}

// 'Dorking, Dorking, England' → 'Dorking, England' (venue and town are often the same string)
const dedupeParts = s => (s ? [...new Set(String(s).split(/,\s*/).map(x => x.trim()).filter(Boolean))].join(', ') : null);
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; } };
const stateCode = rc => (rc && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(rc) ? rc.split('-')[1] : null);

export function toSiteOpportunity(rec, today) {
  const routeUrl = (rec.application_routes || []).map(r => r.url).find(u => /^https:\/\//.test(u || '')) || null;
  return {
    id: rec.opportunity_id,
    market: rec.country_code,
    title: rec.event_name,
    source_title: null,
    type: siteType(rec),
    organiser: {
      name: cleanOrganiser(rec.organiser),
      type: rec.source_type === 'council_site' || rec.discovery_source === 'council' ? 'council' : null,
      verified: false
    },
    location: {
      label: dedupeParts(rec.location) || rec.locality || rec.region || 'Location not given',
      locality: rec.locality || null, region: rec.region || null,
      region_code: rec.country_code === 'US' ? stateCode(rec.region_code) : (rec.region_code || null),
      postal_code: null, lat: null, lng: null, precision: null          // the producer does not geocode
    },
    dates: { start: rec.event_start || null, end: rec.event_end || null, recurring: rec.recurring === true,
             application_deadline: rec.application_deadline || null },
    application: siteApplication(rec, today),
    fee: { text: null, currency: CURRENCY[rec.country_code] || null },
    sells: siteSells(rec),
    notes: null,                                                         // no customer description exists yet
    checked: { last_checked: (rec.last_checked || '').slice(0, 10) || null, freshness: null },
    confidence: (rec.confidence || {}).level || null,
    _restricted: {                                                        // paid fields: server redacts for Free users
      source_domain: host(rec.source_url), source_url: rec.source_url || null,
      application_url: rec.application_url || routeUrl || null
    }
  };
}
