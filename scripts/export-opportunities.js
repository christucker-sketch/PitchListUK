const fs = require('fs');
const path = require('path');

const siteRoot = path.join(__dirname, '..');
const pitchlistRoot = process.env.PITCHLIST_HAL_ROOT || path.resolve(siteRoot, '..', '..', 'pitchlist-uk');
const { searchOpportunities } = require(path.join(pitchlistRoot, 'lib', 'opportunity-database'));

const result = searchOpportunities(pitchlistRoot, {
  audience: 'customer',
  include_stale: 'false',
  include_expired: 'false',
  category: '',
  limit: 1000
}, new Date());

const publicStatuses = new Set(['customer_ready', 'review']);
const BOILERPLATE_TITLE = /(skip to main content|we use cookies|to help us give you the best experience|accept all|your privacy|hit enter to search|esc to close|no results found)/i;
const BLOCKED_HOST = /(^|\.)(pitchlist\.uk|festfinder\.co\.uk|pitchmarketsandeventsuk\.com|kfma\.org\.uk|streetfoodfests\.com|moderngov\.co\.uk|ultimatechristmasmarkets\.com|eventseye\.com|pdffiller\.com|mall-kiosk\.com|feedr\.co|gopopup\.com)\b/i;
const NON_UK_HOST = /(\.ca$|\.nyc$|(^|\.)(downtownkentwa|farmingvillechamber|visitsuffolkva|smmarket|devon\.ca|essexmarket|essexct|londonderrynh|watersidedistrict|downtownnorfolk|festevents|thefairiscoming)\b)/i;
const NON_UK_PLACE = /\b(kent wa|kent washington|south milwaukee|suffolk downtown|suffolk va|farmingville|essex ct|londonderry nh|norfolk waterfront|isle of wight county fair)\b/i;
const NON_OPPORTUNITY_DOC = /\b(policy|guidance|checklist|terms and conditions|licensing policy|food hygiene|national guidance|risk assessment|privacy policy)\b/i;
const NON_OPPORTUNITY_ROUTE = /(guidance|checklist|policy|terms|online-accounts|account\/signin|\/signin|\/login)/i;
const NON_OPPORTUNITY_TITLE = /^(application form|home exhibit show submenu|events booking|business improvement districts|catering marketplace|food and drink consultancy|how much does it cost|welcome to natural & organic food show|menu more in this section|street trader licences)|show submenu|^search home/i;
const APPLICATION_SIGNAL = /\b(apply|application|booking|form|register|registration|become a trader|trade with us|stallholder|vendor|exhibitor|caterer|concession|pitch)\b/i;

function hostFor(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isUkPublicRow(row) {
  const sourceHost = hostFor(row.source_url);
  const applicationHost = hostFor(row.application_url);
  const text = [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    row.notes,
    row.source_url,
    row.application_url
  ].join(' ');

  if (BLOCKED_HOST.test(sourceHost) || BLOCKED_HOST.test(applicationHost)) return false;
  if (NON_UK_HOST.test(sourceHost) || NON_UK_HOST.test(applicationHost) || NON_UK_PLACE.test(text)) return false;
  if (NON_OPPORTUNITY_ROUTE.test(row.application_url || '')) return false;
  if (NON_OPPORTUNITY_TITLE.test(cleanTitle(row.event_name)) || NON_OPPORTUNITY_TITLE.test(cleanTitle(row.organiser))) return false;
  if (BOILERPLATE_TITLE.test(row.event_name || '')) return false;
  if ((row.event_name || '').length > 120) return false;
  if (NON_OPPORTUNITY_DOC.test(row.event_name || '')) return false;
  if (NON_OPPORTUNITY_DOC.test(text) && !APPLICATION_SIGNAL.test(row.application_url || row.source_url || '')) return false;
  if (row.area_confidence === 'unknown' || /^unknown$/i.test(row.region || '')) return false;
  if (!(row.market_domain === 'pitchlist.uk' || row.tax_region === 'UK' || row.country === 'United Kingdom')) return false;
  return true;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s*[-|]\s*Skip to main content.*$/i, '')
    .replace(/\s+Skip to main content.*$/i, '')
    .replace(/\s+(facebook|instagram|twitter|x)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function displayOrganiser(row, eventName) {
  const organiser = cleanTitle(row.organiser);
  if (!organiser || organiser.toLowerCase() === eventName.toLowerCase()) return '';
  return organiser;
}

function publicTitle(row) {
  const eventName = cleanTitle(row.event_name);
  const organiser = cleanTitle(row.organiser);
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(eventName) && organiser) return organiser;
  return eventName;
}

function areaOverride(row) {
  const text = [row.event_name, row.organiser, row.location, row.region, row.notes, row.source_url, row.application_url].join(' ').toLowerCase();
  const matches = [
    ['Isle of Wight', /\bisle of wight\b|\biow\./],
    ['Norfolk', /\bnorfolk\b/],
    ['Suffolk', /\bsuffolk\b/],
    ['Essex', /\bessex\b/],
    ['Bedfordshire', /\bcentral bedfordshire\b|\bbedfordshire\b/],
    ['Berkshire', /\breading\b/],
    ['Hampshire', /\bbasingstoke\b|\bhampshire\b/],
    ['Wiltshire', /salisbury/],
    ['West Sussex', /midsussex|mid sussex|haywards heath/],
    ['Kent', /\bkent county show\b|\brochester\b|\bbroadstairs\b|\bsandwich\b/],
    ['Tyne and Wear', /\bnewcastle\b/]
  ];
  const hit = matches.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : '';
}

function dedupeKey(row) {
  const sourceHost = hostFor(row.source_url);
  const title = publicTitle(row).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\b(application|form|vendor|stallholder|opportunities|opportunity)\b/g, '').replace(/\s+/g, ' ');
  const route = String(row.application_url || row.source_url || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
  return `${sourceHost}|${route || title}`;
}

function coordinateFields(row, title, area) {
  const coordinateText = [title, row.organiser, area || row.location, area || row.region, row.source_url, row.application_url].join(' ').toLowerCase();
  const coordinateOverrides = [
    ['Rochester', /rochester/, 51.3890, 0.5067],
    ['Broadstairs', /broadstairs/, 51.3590, 1.4394],
    ['Sandwich', /sandwichevents|sandwich community|sandwich/, 51.2740, 1.3370],
    ['Detling', /kent county show|kcas\.org\.uk/, 51.3018, 0.5885],
    ['Salisbury', /salisbury/, 51.0688, -1.7945],
    ['Haywards Heath', /midsussex|mid sussex|haywards heath/, 50.9977, -0.1031]
  ];
  const override = coordinateOverrides.find(([, pattern]) => pattern.test(coordinateText));
  if (override) {
    const [label, , latitude, longitude] = override;
    return {
      latitude,
      longitude,
      coordinate_source: 'export-place-override',
      coordinate_precision: 'place',
      coordinate_label: label
    };
  }

  const precision = String(row.coordinate_precision || '');
  if (precision === 'place') {
    const label = String(row.coordinate_label || '').toLowerCase();
    if (label && !coordinateText.includes(label)) {
      return {
        latitude: null,
        longitude: null,
        coordinate_source: '',
        coordinate_precision: '',
        coordinate_label: ''
      };
    }
  }
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    coordinate_source: row.coordinate_source,
    coordinate_precision: row.coordinate_precision,
    coordinate_label: row.coordinate_label
  };
}

const seen = new Set();
const rows = result.rows.filter(row => (
  publicStatuses.has(row.quality_status) &&
  isUkPublicRow(row)
)).filter(row => {
  const key = dedupeKey(row);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}).map(row => {
  const title = publicTitle(row);
  const area = areaOverride(row);
  const coords = coordinateFields(row, title, area);
  return {
  id: row.id,
  event_name: title,
  organiser: displayOrganiser(row, title),
  location: area || row.location,
  county: area || row.county,
  region: area || row.region,
  event_start: row.event_start,
  event_end: row.event_end,
  application_deadline: row.application_deadline,
  stall_fee: row.stall_fee,
  vendor_categories: row.vendor_categories,
  last_checked: row.last_checked,
  freshness_status: row.freshness_status,
  freshness_age_days: row.freshness_age_days,
  confidence: row.confidence,
  quality_status: row.quality_status,
  area_confidence: row.area_confidence,
  route_type: row.route_type,
  organiser_type: row.organiser_type,
  country: row.country,
  jurisdiction: row.jurisdiction,
  currency: row.currency,
  market_domain: row.market_domain,
  tax_region: row.tax_region,
  buyer_fit_tags: row.buyer_fit_tags,
  notes: row.notes,
  application_url: row.application_url,
  source_url: row.source_url,
  ...coords
  };
});

const payload = {
  exported_at: new Date().toISOString(),
  source: 'pitchlist-hal-events-active',
  total: rows.length,
  rows
};

const outDir = path.join(siteRoot, 'functions', '_data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'opportunities.mjs'),
  `export const opportunitySnapshot = ${JSON.stringify(payload, null, 2)};\n`
);
console.log(`Exported ${rows.length} customer-safe opportunities to functions/_data/opportunities.mjs`);
