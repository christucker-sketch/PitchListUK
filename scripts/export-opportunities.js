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
const BOILERPLATE_TITLE = /(skip to main content|we use cookies|to help us give you the best experience|accept all|your privacy|hit enter to search|esc to close|no results found|lorem ipsum|save changes close save changes)/i;
const BLOCKED_HOST = /(^|\.)(pitchlist\.uk|festfinder\.co\.uk|pitchmarketsandeventsuk\.com|kfma\.org\.uk|streetfoodfests\.com|moderngov\.co\.uk|ultimatechristmasmarkets\.com|eventseye\.com|pdffiller\.com|mall-kiosk\.com|feedr\.co|gopopup\.com|certificates\.lsba\.org\.uk|spaceandpeople\.co\.uk|britisheventcatering\.co\.uk|foodmarketplace\.co\.uk|themarketwfd\.com|youtube\.com|youtu\.be|whatsonni\.com)\b/i;
const NON_UK_HOST = /(\.ca$|\.nyc$|(^|\.)(downtownkentwa|farmingvillechamber|visitsuffolkva|smmarket|devon\.ca|essexmarket|essexct|londonderrynh|watersidedistrict|downtownnorfolk|festevents|thefairiscoming)\b)/i;
const NON_UK_PLACE = /\b(kent wa|kent washington|south milwaukee|suffolk downtown|suffolk va|farmingville|essex ct|londonderry nh|norfolk waterfront|isle of wight county fair)\b/i;
const NON_OPPORTUNITY_DOC = /\b(policy|guidance|checklist|terms and conditions|licensing policy|food hygiene|national guidance|risk assessment|privacy policy|glossary|case study)\b/i;
const NON_OPPORTUNITY_ROUTE = /(guidance|checklist|policy|terms|online-accounts|account\/signin|\/signin|\/login)/i;
const NON_OPPORTUNITY_TITLE = /^(application form|home exhibit show submenu|events booking|business improvement districts|catering marketplace|food and drink consultancy|how much does it cost|welcome to natural & organic food show|menu more in this section|street trader licences|retail services|trade show catering|vendor management|vendor application - the market at the western fair district|indoor office pop-up catering|outside catering suppliers|casual trading in ireland|read more food|home festivals family fun)|show submenu|^search home/i;
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
  if (/\.pdf(?:$|[?#])/i.test(row.source_url || row.application_url || '') && /\b202[0-4]\b/.test(text)) return false;
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
    .replace(/\s*[-|]?\s*Skip to content.*$/i, '')
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

function publicDisplay(row) {
  const host = hostFor(row.source_url || row.application_url);
  const text = [row.event_name, row.organiser, row.source_url, row.application_url].join(' ').toLowerCase();
  const overrides = [
    [/greenwichmarket\.london/, 'Greenwich Market trader application', 'Greenwich Market'],
    [/boroughmarket\.org\.uk/, 'Borough Market trader application', 'Borough Market'],
    [/spitalfields\.co\.uk/, 'Spitalfields Market trader application', 'Spitalfields Market'],
    [/lambeth\.gov\.uk/, 'Lambeth Council food market trader application', 'Lambeth Council'],
    [/sutton\.gov\.uk/, 'Sutton Council event trader application', 'Sutton Council'],
    [/kerbfood\.com/, 'KERB Seven Dials trader application', 'KERB'],
    [/localmakers\.uk/, 'Local Makers Market trader application', 'Local Makers Market'],
    [/popup-london\.co\.uk/, 'PopUp London trader application', 'PopUp London'],
    [/streetfoodish\.com/, 'Streetfoodish trader application', 'Streetfoodish'],
    [/allthingsfungi\.co\.uk/, 'All Things Fungi festival vendor application', 'All Things Fungi'],
    [/lfm\.org\.uk/, 'London Farmers Markets trader application', 'London Farmers Markets'],
    [/saladdaysmarket\.co\.uk/, 'Salad Days Market trader application', 'Salad Days Market'],
    [/n4makersmarket\.co\.uk/, "N4 Makers' Market exhibitor application", "N4 Makers' Market"],
    [/cityoflondon\.gov\.uk/, 'City of London street trading application', 'City of London'],
    [/worldhalalfoodfestival\.com/, 'World Halal Food Festival trader application', 'World Halal Food Festival'],
    [/spiritofchristmasfair\.co\.uk/, 'Spirit of Christmas Fair exhibitor application', 'Spirit of Christmas Fair'],
    [/tastefestivals\.com/, 'Taste of London trader application', 'Taste of London'],
    [/rafmuseum\.org\.uk/, 'Barnet Food Festival trader application', 'RAF Museum London'],
    [/londonwelsh\.org/, 'Welsh Autumn Market trader application', 'London Welsh Centre'],
    [/bristol\.gov\.uk/, 'Bristol Council street trading application', 'Bristol City Council'],
    [/cotswold\.gov\.uk/, 'Cotswold District Council street trading application', 'Cotswold District Council'],
    [/westoxon\.gov\.uk/, 'West Oxfordshire Council street trading application', 'West Oxfordshire District Council'],
    [/ceredigion\.gov\.uk/, 'Ceredigion Council street trading application', 'Ceredigion County Council'],
    [/denbighshire\.gov\.uk/, 'Denbighshire Council street trading application', 'Denbighshire County Council'],
    [/midsussex\.gov\.uk/, 'Mid Sussex Council street trading application', 'Mid Sussex District Council'],
    [/npt\.gov\.uk/, 'Neath Port Talbot Council street trading application', 'Neath Port Talbot Council'],
    [/stanstedpark\.co\.uk/, 'Stansted Park food and drink vendor application', 'Stansted Park'],
    [/solsticefest\.uk/, 'SolsticeFest trader application', 'SolsticeFest']
  ];
  const hit = overrides.find(([pattern]) => pattern.test(host) || pattern.test(text));
  if (hit) return { title: hit[1], organiser: hit[2] };
  const title = publicTitle(row);
  return { title, organiser: displayOrganiser(row, title) };
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
    ['Somerset', /\bsomerset\b|solsticefest/],
    ['Cambridgeshire', /\bcambridge folk\b|\bcambridge\b/],
    ['Hampshire', /\bbasingstoke\b|\bhampshire\b|stanstedpark/],
    ['Wiltshire', /salisbury/],
    ['West Sussex', /midsussex|mid sussex|haywards heath/],
    ['Kent', /\bkent county show\b|\brochester\b|\bbroadstairs\b|\bsandwich\b/],
    ['Tyne and Wear', /\bnewcastle\b/],
    ['Northern Ireland', /\bnorthern ireland\b|\barmagh\b|amptrunning/]
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
    ['Haywards Heath', /midsussex|mid sussex|haywards heath/, 50.9977, -0.1031],
    ['RAF Museum London', /barnet food festival|rafmuseum\.org\.uk\/london\/whats-going-on\/events\/barnet-food-festival/, 51.5982, -0.2389],
    ['London Stadium', /world halal food festival|worldhalalfoodfestival|london stadium/, 51.5386, -0.0165],
    ['Olympia London', /spirit of christmas|olympia/, 51.4963, -0.2105],
    ['Greenwich Market', /greenwichmarket/, 51.4816, -0.0098],
    ['Borough Market', /boroughmarket/, 51.5055, -0.0910],
    ['Spitalfields Market', /spitalfields/, 51.5196, -0.0756],
    ["Regent's Park", /taste of london|regent's park|regents park/, 51.5313, -0.1569],
    ['Lambeth', /lambeth\.gov\.uk|food market trader/, 51.4607, -0.1163],
    ['City of London', /cityoflondon|petticoat lane/, 51.5154, -0.0773],
    ['Finsbury Park', /n4makersmarket|n4 makers/, 51.5647, -0.1060],
    ['Sutton', /sutton\.gov\.uk/, 51.3618, -0.1945],
    ['Seven Dials', /kerbfood|seven dials/, 51.5138, -0.1269]
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
  const display = publicDisplay(row);
  const title = display.title;
  const area = areaOverride(row);
  const coords = coordinateFields(row, title, area);
  return {
  id: row.id,
  event_name: title,
  organiser: display.organiser,
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
