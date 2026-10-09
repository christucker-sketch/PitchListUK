/*
 * DEV STUB ENGINE for the V3 site (dev/stub-server.mjs runs it in Node). NOT shipped, NOT production.
 * It is the executable reference for the behaviour behind contract/V3_CUSTOMER_API.md: search, facets, SEO inventory,
 * saved, alerts. Data = fixtures built from the producer's V3 export (dev/fixtures/opportunities.json).
 * Adapted from the Build 4 FP.api reference implementation; physically part of the V3 package.
 *
 * (original header follows)
 * FindPitches MOCK customer API (offline draft).
 * Implements the FP.api method contract in docs/API_CONTRACT.md using local fixtures + browser storage.
 * Everything here is simulated: no network, no payments, no emails.
 *
 * Canonical market codes: GB, US, CA, AU, IE, NZ, SG, HK.
 * Fixture data exists only for GB and US. The other six markets return honest empty results.
 */
(function () {
  const FP = (window.FP = window.FP || {});
  const CFG = window.FP_CONFIG || {};
  const TODAY = CFG.today || new Date().toISOString().slice(0, 10);
  const FP_GEOCODE_POINTS = false;  // listings carry no coordinates, so postcodes don't become distance searches
  const DATA = (window.FP_FIXTURES && window.FP_FIXTURES.opportunities) || [];

  /* ---------- tiny persistent store (falls back to memory) ---------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fpdraft:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { try { localStorage.setItem('fpdraft:' + k, JSON.stringify(v)); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem('fpdraft:' + k); } catch (e) { delete mem[k]; } }
  };
  FP._mockStore = store;
  // One-off migration from the previous draft build (lowercase 'uk'/'us' in stored state).
  (function migrate() {
    const legacy = { uk: 'GB', us: 'US', ca: 'CA', au: 'AU', ie: 'IE', nz: 'NZ' };
    const cc = store.get('cc', null); if (cc && !store.get('market', null)) { store.set('market', legacy[cc] || 'GB'); store.del('cc'); }
    const al = store.get('alerts', []); let ch = false;
    // Build 3: distances are kilometres everywhere (radius_mi was never part of the contract).
    al.forEach(a => { if (a.query && 'radius_mi' in a.query) { const r = a.query.radius_mi; delete a.query.radius_mi; if (r && r !== 'any') a.query.radius_km = Math.round(+r * 1.609344 * 10) / 10; ch = true; } });
    al.forEach(a => { if (a.query && a.query.country) { a.query.market = legacy[a.query.country] || a.query.country.toUpperCase(); delete a.query.country; ch = true; } });
    if (ch) store.set('alerts', al);
    const s = store.get('session', null); if (s && s.user && s.user.country) { s.user.market = legacy[s.user.country] || 'GB'; delete s.user.country; store.set('session', s); }
  })();

  const wait = (v) => new Promise(res => {
    const [a, b] = CFG.mockLatency || [0, 0];
    setTimeout(() => res(structuredClone(v)), a + Math.random() * (b - a));
  });
  const fail = (code, message, status = 400, extra) => { const e = new Error(message); e.code = code; e.status = status; Object.assign(e, extra || {}); throw e; };

  /* ---------- market registry (mock of the backend market registry) ---------- */
  // launch_status is configuration: 'live' (customer-facing, indexable) or 'building' (coverage-building, noindex).
  // Chris's Build 3 decision: GB and US live; CA, AU, IE, NZ, SG, HK building. Flip a value here to change a market
  // everywhere; no page or component checks market codes for this.
  // postal.label is for form labels; postal.label_mid is the same word mid-sentence (keeps 'ZIP Code', 'Eircode' capitalised).
  // distance_unit = the market's preferred DISPLAY unit. The API/data unit is always kilometres (radius_km, distance_km).
  const MARKETS = [
    { code: 'GB', route_slug: 'uk', display_code: 'UK', name: 'United Kingdom', the: 'the UK', launch_status: 'live', locale: 'en-GB', currency: 'GBP', date_format: 'DD/MM/YYYY', distance_unit: 'mi', radius_options: [10, 25, 50, 100],
      postal: { label_mid: 'postcode', label: 'Postcode', example: 'ME15 6', kind: 'postcode' }, region_label: { singular: 'county', plural: 'counties and regions' },
      vocab: { listings: 'Trader pitches', trader: 'stallholder', traders: 'stallholders and traders', traders_short: 'traders', fee: 'pitch fee', apps: 'trader applications', sport: 'trade stands', pitch: 'pitch' } },
    { code: 'US', route_slug: 'us', display_code: 'US', name: 'United States', the: 'the US', launch_status: 'live', locale: 'en-US', currency: 'USD', date_format: 'MM/DD/YYYY', distance_unit: 'mi', radius_options: [10, 25, 50, 100],
      postal: { label_mid: 'ZIP Code', label: 'ZIP Code', example: '75201', kind: 'zip' }, region_label: { singular: 'state', plural: 'states' },
      vocab: { listings: 'Vendor opportunities', trader: 'vendor', traders: 'vendors', traders_short: 'vendors', fee: 'booth fee', apps: 'vendor applications', sport: 'concessions', pitch: 'booth' } },
    { code: 'CA', route_slug: 'ca', display_code: 'CA', name: 'Canada', the: 'Canada', launch_status: 'building', locale: 'en-CA', currency: 'CAD', date_format: 'YYYY-MM-DD', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      postal: { label_mid: 'postal code', label: 'Postal code', example: 'M5V 3L9', kind: 'postal-code' }, region_label: { singular: 'province or territory', plural: 'provinces and territories' },
      vocab: { listings: 'Vendor opportunities', trader: 'vendor', traders: 'vendors', traders_short: 'vendors', fee: 'booth fee', apps: 'vendor applications', sport: 'concessions', pitch: 'booth' } },
    { code: 'AU', route_slug: 'au', display_code: 'AU', name: 'Australia', the: 'Australia', launch_status: 'building', locale: 'en-AU', currency: 'AUD', date_format: 'DD/MM/YYYY', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      postal: { label_mid: 'postcode', label: 'Postcode', example: '3000', kind: 'postcode' }, region_label: { singular: 'state or territory', plural: 'states and territories' },
      vocab: { listings: 'Stallholder sites', trader: 'stallholder', traders: 'stallholders', traders_short: 'stallholders', fee: 'site fee', apps: 'stallholder applications', sport: 'site holders', pitch: 'site' } },
    { code: 'IE', route_slug: 'ie', display_code: 'IE', name: 'Ireland', the: 'Ireland', launch_status: 'building', locale: 'en-IE', currency: 'EUR', date_format: 'DD/MM/YYYY', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      postal: { label_mid: 'Eircode', label: 'Eircode', example: 'D02 X285', kind: 'eircode' }, region_label: { singular: 'county', plural: 'counties' },
      vocab: { listings: 'Trader pitches', trader: 'trader', traders: 'traders', traders_short: 'traders', fee: 'pitch fee', apps: 'trader applications', sport: 'trade stands', pitch: 'pitch' } },
    { code: 'NZ', route_slug: 'nz', display_code: 'NZ', name: 'New Zealand', the: 'New Zealand', launch_status: 'building', locale: 'en-NZ', currency: 'NZD', date_format: 'DD/MM/YYYY', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      postal: { label_mid: 'postcode', label: 'Postcode', example: '1010', kind: 'postcode' }, region_label: { singular: 'region', plural: 'regions' },
      vocab: { listings: 'Stallholder sites', trader: 'stallholder', traders: 'stallholders', traders_short: 'stallholders', fee: 'site fee', apps: 'stallholder applications', sport: 'site holders', pitch: 'site' } },
    { code: 'SG', route_slug: 'sg', display_code: 'SG', name: 'Singapore', the: 'Singapore', launch_status: 'building', locale: 'en-SG', currency: 'SGD', date_format: 'DD/MM/YYYY', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      postal: { label_mid: 'postal code', label: 'Postal code', example: '238801', kind: 'postal-code' }, region_label: { singular: 'region', plural: 'regions' },
      vocab: { listings: 'Vendor booths', trader: 'vendor', traders: 'vendors', traders_short: 'vendors', fee: 'booth fee', apps: 'vendor applications', sport: 'event booths', pitch: 'booth' } },
    { code: 'HK', route_slug: 'hk', display_code: 'HK', name: 'Hong Kong', the: 'Hong Kong', launch_status: 'building', locale: 'en-HK', currency: 'HKD', date_format: 'DD/MM/YYYY', distance_unit: 'km', radius_options: [10, 25, 50, 100, 200],
      // Hong Kong has no postcodes: search is by district or place name.
      postal: { label_mid: 'district', label: 'District', example: 'Wan Chai', kind: 'district', has_postcodes: false }, region_label: { singular: 'district', plural: 'districts' },
      vocab: { listings: 'Vendor booths', trader: 'vendor', traders: 'vendors', traders_short: 'vendors', fee: 'booth fee', apps: 'vendor applications', sport: 'event booths', pitch: 'booth' } }
  ];
  const MK = Object.fromEntries(MARKETS.map(m => [m.code, m]));

  const TYPES = {
    christmas_market: 'Christmas market', holiday_market: 'Holiday market', food_festival: 'Food festival', festival: 'Festival', market: 'Market',
    street_trading: 'Street trading', show: 'Show', concession: 'Concession', event: 'Event', sport: 'Sports & stadiums'
  };
  const ORG_TYPES = { council: 'Council', festival_organiser: 'Festival organiser', market_operator: 'Market operator', agricultural_society: 'Agricultural society', venue: 'Venue', event_organiser: 'Event organiser', charity: 'Charity', estate: 'Estate', event_platform: 'Event platform' };

  /* ---------- geography (MOCK taxonomy; the backend must own the real one) ---------- */
  const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // GB: nations + English regions (ITL1-style) + counties. Ids are draft ids, not ISO codes.
  const GB_PARENTS = { 'south-east': 'South East', 'south-west': 'South West', 'east-of-england': 'East of England', 'east-midlands': 'East Midlands', 'west-midlands': 'West Midlands', 'north-west': 'North West', 'north-east': 'North East', 'yorkshire-and-the-humber': 'Yorkshire and the Humber', 'london': 'London', 'wales': 'Wales', 'scotland': 'Scotland', 'northern-ireland': 'Northern Ireland', 'midlands': 'The Midlands' };
  const GB_COUNTIES = {
    'south-east': ['Kent', 'Surrey', 'West Sussex', 'East Sussex', 'Hampshire', 'Buckinghamshire', 'Oxfordshire', 'Berkshire', 'Isle of Wight'],
    'south-west': ['Devon', 'Cornwall', 'Somerset', 'Gloucestershire', 'Wiltshire', 'Dorset', 'Bristol'],
    'east-of-england': ['Essex', 'Hertfordshire', 'Cambridgeshire', 'Norfolk', 'Suffolk', 'Bedfordshire'],
    'east-midlands': ['Lincolnshire', 'Northamptonshire', 'Nottinghamshire', 'Leicestershire', 'Derbyshire', 'Rutland'],
    'west-midlands': ['Staffordshire', 'Warwickshire', 'West Midlands county', 'Shropshire', 'Herefordshire', 'Worcestershire'],
    'north-west': ['Greater Manchester', 'Cheshire', 'Lancashire', 'Cumbria', 'Merseyside'],
    'yorkshire-and-the-humber': ['West Yorkshire', 'South Yorkshire', 'North Yorkshire', 'East Riding of Yorkshire'],
    'north-east': ['Tyne and Wear', 'County Durham', 'Northumberland'],
    'scotland': ['Angus', 'Argyll and Bute', 'North Ayrshire', 'Edinburgh', 'Glasgow', 'Fife', 'Highland', 'Aberdeenshire'],
    'wales': ['Monmouthshire', 'Cardiff', 'Gwynedd', 'Pembrokeshire', 'Powys'],
    'northern-ireland': ['Belfast', 'County Antrim', 'County Down']
  };
  const REGIONS = { GB: {}, US: {} };
  Object.entries(GB_PARENTS).forEach(([s, n]) => REGIONS.GB['gb/' + s] = { id: 'gb/' + s, name: n, slug: s, level: ['wales', 'scotland', 'northern-ireland'].includes(s) ? 'nation' : 'region', parent_id: null });
  Object.entries(GB_COUNTIES).forEach(([p, list]) => list.forEach(n => { const nm = n === 'West Midlands county' ? 'West Midlands (county)' : n; const s = n === 'West Midlands county' ? 'west-midlands-county' : slug(n); REGIONS.GB['gb/' + s] = { id: 'gb/' + s, name: nm, slug: s, level: 'county', parent_id: 'gb/' + p }; }));
  const GB_ALIAS = { 'Greater London': 'london', 'London': 'london', 'Scotland': 'scotland', 'Wales': 'wales', 'Northern Ireland': 'northern-ireland', 'South West England': 'south-west', 'Midlands': 'midlands', 'West Midlands': 'west-midlands-county',
    'Hertfordshire / East of England': 'hertfordshire', 'Hampshire / South East England': 'hampshire', 'Leicestershire / East Midlands': 'leicestershire' };
  const STATE_NAMES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  Object.entries(STATE_NAMES).forEach(([c, n]) => REGIONS.US['us/' + slug(n)] = { id: 'us/' + slug(n), name: n, slug: slug(n), level: 'state', parent_id: null, code: 'US-' + c });
  const US_BY_CODE = Object.fromEntries(Object.values(REGIONS.US).map(r => [r.code.slice(3), r.id]));
  // Attach region ids to fixture rows (the real API should return these directly).
  DATA.forEach(o => {
    if (o.market === 'GB') { const r = o.location.region; const s = GB_ALIAS[r] || slug(r || ''); o.location.region_id = REGIONS.GB['gb/' + s] ? 'gb/' + s : null; }
    if (o.market === 'US') o.location.region_id = US_BY_CODE[o.location.region_code] || null;
  });
  const ancestors = (m, id) => { const out = []; let r = REGIONS[m] && REGIONS[m][id]; while (r) { out.push(r.id); r = r.parent_id ? REGIONS[m][r.parent_id] : null; } return out; };

  /* UK postcode areas → approx centre (MOCK geocoder; the real API must geocode full postcodes) */
  const AREAS = {AB:[57.15,-2.1,'Aberdeen'],B:[52.48,-1.9,'Birmingham'],BA:[51.38,-2.36,'Bath'],BB:[53.75,-2.48,'Blackburn'],BD:[53.8,-1.76,'Bradford'],BH:[50.72,-1.88,'Bournemouth'],BL:[53.58,-2.43,'Bolton'],BN:[50.83,-0.14,'Brighton'],BR:[51.4,0.02,'Bromley'],BS:[51.45,-2.59,'Bristol'],BT:[54.6,-5.93,'Belfast'],CA:[54.89,-2.93,'Carlisle'],CB:[52.2,0.12,'Cambridge'],CF:[51.48,-3.18,'Cardiff'],CH:[53.19,-2.89,'Chester'],CM:[51.74,0.47,'Chelmsford'],CO:[51.89,0.9,'Colchester'],CR:[51.37,-0.1,'Croydon'],CT:[51.28,1.08,'Canterbury'],CV:[52.41,-1.51,'Coventry'],CW:[53.1,-2.44,'Crewe'],DA:[51.44,0.22,'Dartford'],DD:[56.46,-2.97,'Dundee'],DE:[52.92,-1.48,'Derby'],DH:[54.78,-1.57,'Durham'],DL:[54.52,-1.55,'Darlington'],DN:[53.52,-1.13,'Doncaster'],DT:[50.71,-2.44,'Dorchester'],DY:[52.51,-2.08,'Dudley'],E:[51.53,-0.03,'East London'],EC:[51.52,-0.09,'City of London'],EH:[55.95,-3.19,'Edinburgh'],EN:[51.65,-0.08,'Enfield'],EX:[50.72,-3.53,'Exeter'],FY:[53.82,-3.05,'Blackpool'],G:[55.86,-4.25,'Glasgow'],GL:[51.86,-2.24,'Gloucester'],GU:[51.24,-0.57,'Guildford'],HA:[51.58,-0.34,'Harrow'],HD:[53.65,-1.78,'Huddersfield'],HG:[53.99,-1.54,'Harrogate'],HP:[51.75,-0.47,'Hemel Hempstead'],HR:[52.06,-2.72,'Hereford'],HU:[53.74,-0.33,'Hull'],HX:[53.72,-1.86,'Halifax'],IG:[51.56,0.08,'Ilford'],IP:[52.06,1.15,'Ipswich'],IV:[57.48,-4.22,'Inverness'],KT:[51.41,-0.3,'Kingston'],L:[53.41,-2.98,'Liverpool'],LA:[54.05,-2.8,'Lancaster'],LE:[52.64,-1.13,'Leicester'],LL:[53.14,-3.8,'North Wales'],LN:[53.23,-0.54,'Lincoln'],LS:[53.8,-1.55,'Leeds'],LU:[51.88,-0.42,'Luton'],M:[53.48,-2.24,'Manchester'],ME:[51.27,0.53,'Maidstone'],MK:[52.04,-0.76,'Milton Keynes'],N:[51.57,-0.11,'North London'],NE:[54.97,-1.61,'Newcastle'],NG:[52.95,-1.15,'Nottingham'],NN:[52.24,-0.9,'Northampton'],NP:[51.59,-3,'Newport'],NR:[52.63,1.3,'Norwich'],NW:[51.55,-0.18,'North West London'],OX:[51.75,-1.26,'Oxford'],PE:[52.57,-0.24,'Peterborough'],PL:[50.38,-4.14,'Plymouth'],PO:[50.82,-1.09,'Portsmouth'],PR:[53.76,-2.7,'Preston'],RG:[51.45,-0.97,'Reading'],RH:[51.23,-0.2,'Redhill'],RM:[51.58,0.18,'Romford'],S:[53.38,-1.47,'Sheffield'],SA:[51.62,-3.94,'Swansea'],SE:[51.47,-0.06,'South East London'],SG:[51.9,-0.2,'Stevenage'],SK:[53.41,-2.15,'Stockport'],SL:[51.51,-0.59,'Slough'],SM:[51.36,-0.19,'Sutton'],SN:[51.56,-1.78,'Swindon'],SO:[50.9,-1.4,'Southampton'],SP:[51.07,-1.79,'Salisbury'],SR:[54.91,-1.38,'Sunderland'],SS:[51.54,0.71,'Southend'],ST:[53,-2.18,'Stoke-on-Trent'],SW:[51.46,-0.17,'South West London'],SY:[52.71,-2.75,'Shrewsbury'],TA:[51.02,-3.1,'Taunton'],TD:[55.6,-2.43,'Scottish Borders'],TN:[51.13,0.26,'Tunbridge Wells'],TQ:[50.46,-3.53,'Torquay'],TR:[50.26,-5.05,'Truro'],TS:[54.57,-1.23,'Middlesbrough'],TW:[51.45,-0.34,'Twickenham'],UB:[51.53,-0.45,'Uxbridge'],W:[51.51,-0.2,'West London'],WA:[53.39,-2.59,'Warrington'],WC:[51.52,-0.12,'Central London'],WD:[51.66,-0.4,'Watford'],WF:[53.68,-1.5,'Wakefield'],WN:[53.55,-2.63,'Wigan'],WR:[52.19,-2.22,'Worcester'],WS:[52.59,-1.98,'Walsall'],WV:[52.59,-2.13,'Wolverhampton'],YO:[53.96,-1.08,'York']};
  const TOWNS = {}; Object.entries(AREAS).forEach(([k, v]) => TOWNS[v[2].toLowerCase()] = k);
  const ZIP = [[10,27,'MA'],[28,29,'RI'],[30,38,'NH'],[39,49,'ME'],[50,59,'VT'],[60,69,'CT'],[70,89,'NJ'],[100,149,'NY'],[150,196,'PA'],[197,199,'DE'],[200,205,'DC'],[206,219,'MD'],[220,246,'VA'],[247,268,'WV'],[270,289,'NC'],[290,299,'SC'],[300,319,'GA'],[320,349,'FL'],[350,369,'AL'],[370,385,'TN'],[386,397,'MS'],[398,399,'GA'],[400,427,'KY'],[430,459,'OH'],[460,479,'IN'],[480,499,'MI'],[500,528,'IA'],[530,549,'WI'],[550,567,'MN'],[570,577,'SD'],[580,588,'ND'],[590,599,'MT'],[600,629,'IL'],[630,658,'MO'],[660,679,'KS'],[680,693,'NE'],[700,714,'LA'],[716,729,'AR'],[730,749,'OK'],[750,799,'TX'],[800,816,'CO'],[820,831,'WY'],[832,838,'ID'],[840,847,'UT'],[850,865,'AZ'],[870,884,'NM'],[889,898,'NV'],[900,961,'CA'],[967,968,'HI'],[970,979,'OR'],[980,994,'WA'],[995,999,'AK']];

  /* ---------- helpers ---------- */
  // Defensive normalisation: optional fields may be missing or malformed in real data; the UI must not break.
  function normalise(o) {
    const n = Object.assign({}, o);
    n.title = (n.title && String(n.title).trim()) || 'Untitled opportunity';
    n.organiser = Object.assign({ name: null, type: null, verified: false }, n.organiser || {});
    n.location = Object.assign({ label: 'Location not given', lat: null, lng: null, precision: null, region_id: null }, n.location || {});
    if (!n.location.label) n.location.label = 'Location not given';
    n.dates = Object.assign({ start: null, end: null, recurring: false, application_deadline: null }, n.dates || {});
    ['start', 'end', 'application_deadline'].forEach(k => { if (n.dates[k] && !/^\d{4}-\d{2}-\d{2}$/.test(n.dates[k])) n.dates[k] = null; });
    n.fee = Object.assign({ text: null, currency: null }, n.fee || {});
    n.sells = Array.isArray(n.sells) ? n.sells : []; // no evidence → empty (never a default category)
    n.checked = Object.assign({ last_checked: null, freshness: null }, n.checked || {});
    n._restricted = Object.assign({ source_domain: null, source_url: null, application_url: null }, n._restricted || {});
    return n;
  }
  const km = (a, b, c, d) => { const R = 6371.0, t = x => x * Math.PI / 180; const dl = t(c - a), dn = t(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const daysFrom = iso => Math.round((new Date(iso + 'T12:00:00Z') - new Date(TODAY + 'T12:00:00Z')) / 864e5);
  const current = o => !o.dates.start || (o.dates.end || o.dates.start) >= TODAY;
  const session = () => store.get('session', { signed_in: false, user: null, access: { tier: 'free', status: 'none' } });
  const entitled = () => { const s = session(); return s.signed_in && ['trial', 'pro'].includes(s.access.tier); };
  const needMarket = m => { const k = String(m || '').toUpperCase(); if (!MK[k]) fail('unknown_market', 'Unknown market: ' + m, 404); return k; };
  const tld = d => { if (!d) return null; const m = d.match(/\.(gov\.uk|org\.uk|co\.uk|gov|org|com|net|uk|us)$/); return m ? '.' + m[1] : null; };

  // What a customer is allowed to see. Free = everything except the source + application route.
  // Application status is derived only from evidence we hold (deadline / event dates). Never invented.
  function applicationStatus(o) {
    const d = o.dates || {}, dl = d.application_deadline, endOrStart = d.end || d.start;
    if (endOrStart && endOrStart < TODAY) return { status: 'ended', deadline: dl || null, basis: 'event_dates' };
    if (dl) { const n = daysFrom(dl); if (n < 0) return { status: 'closed', deadline: dl, basis: 'deadline' }; return { status: n <= 14 ? 'closing_soon' : 'open', deadline: dl, days_left: n, basis: 'deadline' }; }
    return { status: 'unknown', deadline: null, basis: null };
  }
  // The snapshots mix customer-facing descriptions with internal review notes in one `notes` field. The draft hides
  // anything that looks internal. The real API must return a separate customer `description` (see DATA_ISSUES.md).
  const INTERNAL_NOTE = /(automatically staged|first-party|rechecked|needs manual review|recovery import|^verified \d|duplicate|weak relevance|actionable|\bimport\b|query:)/i;
  const customerNotes = n => (n && !INTERNAL_NOTE.test(n) ? String(n) : null);
  function present(o, extra) {
    o = normalise(o);
    const ok = entitled();
    const reg = o.location.region_id ? REGIONS[o.market][o.location.region_id] : null;
    const out = {
      id: o.id, market: o.market, title: o.title, source_title: o.source_title,
      type: o.type, type_label: TYPES[o.type] || 'Event',
      organiser: Object.assign({}, o.organiser, { type_label: ORG_TYPES[o.organiser.type] || null }),
      location: Object.assign({}, o.location, { region_name: reg ? reg.name : (o.location.region || null) }),
      dates: o.dates, application: o.application || applicationStatus(o), fee: o.fee, sells: o.sells, notes: customerNotes(o.notes), checked: o.checked,
      canonical_path: FP.routes ? FP.routes.opportunityPath(o.market, o.id) : null,
      access: ok
        ? { locked: false, source_domain: o._restricted.source_domain, source_url: o._restricted.source_url, application_url: o._restricted.application_url || o._restricted.source_url }
        : { locked: true, source_domain_hint: tld(o._restricted.source_domain), source_url: null, application_url: null }
    };
    return Object.assign(out, extra || {});
  }

  function resolveLocation(market, q) {
    q = String(q || '').trim();
    if (!q) return { kind: 'none', label: null };
    // Region ids and region slugs resolve for every market that has a taxonomy
    const regs = REGIONS[market] || {};
    const byId = regs[q] || Object.values(regs).find(r => r.slug === q.toLowerCase() || r.name.toLowerCase() === q.toLowerCase());
    if (market === 'GB') {
      const u = q.toUpperCase();
      const m = u.match(/^([A-Z]{1,2})\d/) || u.match(/^([A-Z]{1,2})$/);
      const area = (m && AREAS[m[1]]) ? m[1] : TOWNS[q.toLowerCase()];
      if (area && FP_GEOCODE_POINTS) return { kind: 'point', label: AREAS[area][2], query: u, lat: AREAS[area][0], lng: AREAS[area][1], precision: 'postcode_area', _mock: true };
      if (byId) return { kind: 'region', region_id: byId.id, label: byId.name, query: q, precision: byId.level };
      return { kind: 'unknown', label: null, query: q };
    }
    if (market === 'US') {
      if (/^\d{5}/.test(q)) { const p = parseInt(q.slice(0, 3), 10); const z = ZIP.find(([a, b]) => p >= a && p <= b); if (z && US_BY_CODE[z[2]]) { const r = REGIONS.US[US_BY_CODE[z[2]]]; return { kind: 'region', region_id: r.id, region_code: z[2], label: r.name, query: q, precision: 'state', _mock: true }; } }
      const up = q.toUpperCase();
      if (US_BY_CODE[up]) { const r = REGIONS.US[US_BY_CODE[up]]; return { kind: 'region', region_id: r.id, region_code: up, label: r.name, query: up, precision: 'state' }; }
      if (byId) return { kind: 'region', region_id: byId.id, region_code: byId.code.slice(3), label: byId.name, query: q, precision: 'state' };
      return { kind: 'unknown', label: null, query: q };
    }
    // No geocoder/taxonomy in the draft for CA, AU, IE, NZ, SG, HK
    return { kind: 'unresolved', label: null, query: q, _mock: true };
  }

  function whenOk(o, when) {
    if (!when) return true; const s = o.dates.start;
    if (!s) return when === '2027' ? false : !['30', '90', 'xmas'].includes(when);
    const d = daysFrom(s), e = o.dates.end ? daysFrom(o.dates.end) : d;
    if (when === '30') return e >= 0 && d <= 30;
    if (when === '90') return e >= 0 && d <= 90;
    if (when === 'xmas') return /-(11|12)-/.test(s) && s < '2027-01-01';
    if (when === '2027') return s >= '2027-01-01';
    return true;
  }

  function filterRows(p) {
    const market = needMarket(p.market);
    const loc = p.region ? resolveLocation(market, p.region) : resolveLocation(market, p.q);
    // Canonical distance unit is km. (Legacy radius_mi is NOT part of the contract.)
    const radius = p.radius_km === 'any' || p.radius_km == null || p.radius_km === '' ? null : +p.radius_km;
    let rows = DATA.filter(o => o.market === market && current(o)).map(o => {
      let dist = null;
      if (loc.kind === 'point' && o.location.lat != null) dist = km(loc.lat, loc.lng, o.location.lat, o.location.lng);
      return { o, dist };
    });
    if (loc.kind === 'point' && radius) rows = rows.filter(r => r.dist != null && r.dist <= radius);
    if (loc.kind === 'region') rows = rows.filter(r => r.o.location.region_id && ancestors(market, r.o.location.region_id).includes(loc.region_id));
    if (p.sells) rows = rows.filter(r => (r.o.sells || []).includes(p.sells));
    if (p.organiser_types && p.organiser_types.length) rows = rows.filter(r => p.organiser_types.includes(r.o.organiser.type));
    if (p.q_text) { const t = p.q_text.toLowerCase(); rows = rows.filter(r => (r.o.title + ' ' + r.o.location.label + ' ' + (r.o.organiser.name || '')).toLowerCase().includes(t)); }
    rows = rows.filter(r => whenOk(r.o, p.when));
    if (p.month) rows = rows.filter(r => r.o.dates.start && r.o.dates.start.slice(0, 7) === p.month);
    return { market, loc, rows };
  }

  function runSearch(p) {
    const { market, loc, rows: base } = filterRows(p);
    const m = MK[market];
    const coverage = DATA.some(o => o.market === market) ? 'available' : 'none';
    let rows = base;
    const types = {}; rows.forEach(r => types[r.o.type] = (types[r.o.type] || 0) + 1);
    const months = {}; rows.forEach(r => { if (r.o.dates.start) { const k = r.o.dates.start.slice(0, 7); months[k] = (months[k] || 0) + 1; } });
    const undated = rows.filter(r => !r.o.dates.start).length;
    const regions = {}; DATA.forEach(o => { if (o.market === market && current(o) && o.location.region_id) regions[o.location.region_id] = (regions[o.location.region_id] || 0) + 1; });
    if (p.types && p.types.length) rows = rows.filter(r => p.types.includes(r.o.type));
    const sort = p.sort || (loc.kind === 'point' ? 'nearest' : 'soonest');
    const precise = r => r.o.location.precision === 'place' ? 0 : 1;
    const soonKey = r => { const s = r.o.dates.start; return s && s >= TODAY ? s : (s ? '8' : '9'); };
    const cmp = {
      nearest: (a, b) => precise(a) - precise(b) || (a.dist ?? 1e9) - (b.dist ?? 1e9) || soonKey(a).localeCompare(soonKey(b)),
      soonest: (a, b) => soonKey(a).localeCompare(soonKey(b)),
      recently_checked: (a, b) => (b.o.checked.last_checked || '').localeCompare(a.o.checked.last_checked || ''),
      az: (a, b) => a.o.title.localeCompare(b.o.title)
    }[sort] || (() => 0);
    rows.sort(cmp);
    const page = Math.max(1, +p.page || 1), size = Math.min(100, +p.page_size || 25);
    return {
      market, market_status: m.launch_status, coverage, location: loc, sort, page, page_size: size, total: rows.length,
      next_start: rows.map(r => r.o.dates.start).filter(s => s && s >= TODAY).sort()[0] || null,
      results: rows.slice((page - 1) * size, page * size).map(r => present(r.o, { distance_km: r.dist == null ? null : +r.dist.toFixed(1) })),
      facets: { types, months, undated, regions },
      map_points: rows.map(r => ({ id: r.o.id, lat: r.o.location.lat, lng: r.o.location.lng, type: r.o.type, title: r.o.title }))
    };
  }

  /* ---------- the mock API ---------- */
  FP.mockApi = {
    meta: {
      async markets() { return wait(MARKETS.map(m => Object.assign({}, m, {
        opportunity_count: DATA.filter(o => o.market === m.code && current(o)).length, draft_has_data: DATA.some(o => o.market === m.code),
        // Search capabilities the UI adapts to. In the draft these reflect the MOCK geocoder (GB postcode areas; US ZIP→state).
        // The real API is expected to support radius search wherever it has geocoding.
        search: { radius: false, region: !!REGIONS[m.code], geocoder: m.code === 'US' ? 'zip_to_state' : 'none' }  // V3 data has no coordinates yet
      }))); },
      async stats() {
        const live = DATA.filter(current); const by = {};
        MARKETS.forEach(m => { const rows = live.filter(o => o.market === m.code); by[m.code] = { count: rows.length, regions: new Set(rows.map(o => o.location.region_id).filter(Boolean)).size }; });
        return wait({ as_of: TODAY, total: live.length, sports: live.filter(o => o.type === 'sport').length, markets: by });
      },
      types() { return TYPES; },
      async regions({ market }) {
        const mk = needMarket(market); const regs = REGIONS[mk] || {};
        const counts = {}; DATA.forEach(o => { if (o.market === mk && current(o) && o.location.region_id) ancestors(mk, o.location.region_id).forEach(id => counts[id] = (counts[id] || 0) + 1); });
        return wait(Object.values(regs).map(r => Object.assign({}, r, { opportunity_count: counts[r.id] || 0 })));
      }
    },
    geo: { async resolve({ market, q }) { return wait(resolveLocation(needMarket(market), q)); } },
    opportunities: {
      async search(params) { return wait(runSearch(params || {})); },
      async count(params) { return wait({ total: filterRows(params).rows.filter(r => !(params.types && params.types.length) || params.types.includes(r.o.type)).length }); },
      async get(id) {
        const o = DATA.find(x => x.id === id); if (!o) fail('not_found', 'Opportunity not found', 404);
        const similar = DATA.filter(x => x.id !== id && x.market === o.market && x.type === o.type && current(x) &&
          (o.market === 'US' ? x.location.region_code === o.location.region_code : (o.location.lat != null && x.location.lat != null && km(o.location.lat, o.location.lng, x.location.lat, x.location.lng) < 100)))
          .slice(0, 4).map(x => present(x));
        return wait(present(o, { similar, is_current: current(o), region_path: o.location.region_id ? ancestors(o.market, o.location.region_id).reverse().map(i => REGIONS[o.market][i]) : [] }));
      },
      async upcoming({ market, limit = 10, type } = {}) {
        const mk = market ? needMarket(market) : null;
        const rows = DATA.filter(o => (!mk || o.market === mk) && o.dates.start && o.dates.start >= TODAY && (!type || o.type === type))
          .sort((a, b) => a.dates.start.localeCompare(b.dates.start)).slice(0, limit).map(o => present(o));
        return wait(rows);
      },
      async byIds(ids) { return wait(ids.map(id => DATA.find(o => o.id === id)).filter(Boolean).map(o => present(o, { is_current: current(o) }))); }
    },
    seo: {
      // Counts for every (intent × region) combination in a market, so the SEO layer can decide
      // which pages exist, which are indexable and what goes in the sitemap.
      // `intents` is passed in by the draft's SEO config; in production the server should own this registry.
      async inventory({ market, intents }) {
        const mk = needMarket(market); const regs = Object.values(REGIONS[mk] || {});
        const all = DATA.filter(o => o.market === mk && current(o));
        const match = (o, f) => (!f.types || !f.types.length || f.types.includes(o.type)) && (!f.sells || (o.sells || []).includes(f.sells)) && (!f.organiser_types || !f.organiser_types.length || f.organiser_types.includes(o.organiser.type));
        const count = (f, rid) => all.filter(o => match(o, f) && (!rid || (o.location.region_id && ancestors(mk, o.location.region_id).includes(rid)))).length;
        const out = { market: mk, generated_at: TODAY, market_total: all.length, intents: {}, regions: {}, combos: {} };
        intents.forEach(i => out.intents[i.key] = count(i.filters, null));
        regs.forEach(r => { const c = count({}, r.id); if (c) out.regions[r.id] = c; });
        intents.forEach(i => regs.forEach(r => { if (out.regions[r.id]) { const c = count(i.filters, r.id); if (c) out.combos[i.key + '|' + r.id] = c; } }));
        return wait(out);
      }
    },
    session: {
      async get() { return wait(session()); },
      async requestLink({ email }) {
        if (!/.+@.+\..+/.test(email || '')) fail('invalid_email', 'Enter a valid email address');
        const token = 'mock-' + Math.random().toString(36).slice(2, 10);
        store.set('pending_link', { email, token });
        return wait({ sent: true, email, _mock_token: token });
      },
      async completeLink({ token }) {
        const p = store.get('pending_link'); if (!p || p.token !== token) fail('invalid_link', 'That sign-in link has expired', 401);
        const prev = session();
        const s = { signed_in: true, user: { email: p.email, name: p.email.split('@')[0], business_name: null, base_postcode: null, market: store.get('market', 'GB') },
          access: prev.access && prev.access.tier !== 'free' ? prev.access : { tier: 'free', status: 'none' } };
        store.set('session', s); store.del('pending_link'); return wait(s);
      },
      async signOut() { store.set('session', { signed_in: false, user: null, access: { tier: 'free', status: 'none' } }); return wait({ ok: true }); },
      async updateProfile(fields) { const s = session(); if (!s.signed_in) fail('auth_required', 'Sign in first', 401); s.user = Object.assign({}, s.user, fields); store.set('session', s); return wait(s); }
    },
    saved: {
      // Stored as [{id, saved_at}] (build 1–2 stored plain ids; migrated on read).
      _all() { return store.get('saved', []).map(x => typeof x === 'string' ? { id: x, saved_at: null } : x).filter(x => x && x.id); },
      async list() { const items = FP.mockApi.saved._all(); const by = Object.fromEntries(items.map(x => [x.id, x.saved_at]));
        const rows = items.map(x => DATA.find(o => o.id === x.id)).filter(Boolean).map(o => present(o, { is_current: current(o), saved_at: by[o.id] }));
        return wait({ items: rows, missing: items.length - rows.length }); },
      async ids() { return wait(FP.mockApi.saved._all().map(x => x.id)); },
      async add(id) { if (!session().signed_in) fail('auth_required', 'Sign in to save pitches', 401); const all = FP.mockApi.saved._all().filter(x => x.id !== id); all.unshift({ id, saved_at: new Date().toISOString() }); store.set('saved', all); return wait({ ok: true, count: all.length }); },
      async remove(id) { const all = FP.mockApi.saved._all().filter(x => x.id !== id); store.set('saved', all); return wait({ ok: true, count: all.length }); }
    },
    alerts: {
      async list() {
        const list = store.get('alerts', []);
        return wait(list.map(a => { const r = runSearch(Object.assign({}, a.query, { page_size: 3 })); return Object.assign({}, a, { current_matches: r.total, sample: r.results.slice(0, 3) }); }));
      },
      async create({ name, query, frequency = 'weekly' }) {
        if (!session().signed_in) fail('auth_required', 'Sign in to create alerts', 401);
        if (!entitled()) fail('upgrade_required', 'Alerts are part of Pro', 402);
        needMarket(query && query.market);
        const list = store.get('alerts', []);
        const a = { id: 'al_' + Date.now().toString(36), name: name || 'My alert', query, frequency, created_at: new Date().toISOString(), paused: false };
        list.push(a); store.set('alerts', list); return wait(a);
      },
      async update(id, patch) { const list = store.get('alerts', []); const a = list.find(x => x.id === id); if (!a) fail('not_found', 'Alert not found', 404); Object.assign(a, patch); store.set('alerts', list); return wait(a); },
      async remove(id) { store.set('alerts', store.get('alerts', []).filter(a => a.id !== id)); return wait({ ok: true }); }
    },
    billing: {
      async plans({ market = 'GB' } = {}) {
        const mk = needMarket(market), m = MK[mk], gb = mk === 'GB';
        const sym = { GBP: '£', USD: '$', CAD: 'CA$', AUD: 'A$', EUR: '€', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$' }[m.currency] || '';
        return wait([
          { id: 'free', name: 'Free', market: mk, price: 0, price_label: sym + '0', currency: m.currency, interval: null, features: ['Search every checked listing', 'Dates, place, organiser and map', 'Save pitches to your account'] },
          { id: 'pro_monthly', name: 'Pro', market: mk, price: gb ? 4.99 : null, price_label: gb ? '£4.99' : 'TBC', currency: m.currency, interval: 'month', trial_days: 7, card_required: true,
            features: ['Everything in Free', 'The organiser’s application page for every listing', 'Email alerts for new listings that match you', 'Export your shortlist'],
            // Draft: only GB has a confirmed price (£4.99). Other markets are a decision for Chris.
            note: gb ? null : m.launch_status === 'live' ? `${m.name} pricing is being confirmed.` : `${m.name} pricing is set before launch.` }
        ]);
      },
      async startCheckout({ plan_id, market }) {
        if (!session().signed_in) fail('auth_required', 'Sign in first', 401);
        const mk = needMarket(market || 'GB'); if (MK[mk].launch_status !== 'live') fail('market_not_live', MK[mk].name + ' isn’t open yet', 409);
        if (plan_id === 'pro_monthly' && mk !== 'GB') fail('price_not_set', 'Pricing for ' + MK[mk].name + ' hasn’t been set yet', 409);
        const id = 'cs_mock_' + Math.random().toString(36).slice(2, 10); store.set('checkout', { id, plan_id, market: needMarket(market || 'GB') });
        return wait({ checkout_url: `account.html?checkout=success&session_id=${id}`, session_id: id, _simulated: true });
      },
      async getCheckout({ session_id }) {
        const c = store.get('checkout'); if (!c || c.id !== session_id) fail('invalid_session', 'This checkout has expired', 404);
        const plans = await FP.mockApi.billing.plans({ market: c.market }); return wait({ session_id: c.id, market: c.market, plan: plans.find(p => p.id === c.plan_id) });
      },
      async completeCheckout({ session_id }) {
        const c = store.get('checkout'); if (!c || c.id !== session_id) fail('invalid_session', 'Checkout session not found', 404);
        const s = session(); const ends = new Date(new Date(TODAY + 'T12:00:00Z').getTime() + 7 * 864e5).toISOString().slice(0, 10);
        s.access = { tier: 'trial', status: 'trialing', plan_id: c.plan_id, market: c.market, trial_ends: ends, renews_on: ends, cancel_at_period_end: false };
        store.set('session', s); store.del('checkout'); return wait(s);
      },
      async cancel() { const s = session(); if (s.access.tier === 'free') fail('no_subscription', 'No subscription', 400); s.access.cancel_at_period_end = true; store.set('session', s); return wait(s); },
      async resume() { const s = session(); s.access.cancel_at_period_end = false; store.set('session', s); return wait(s); },
      async _simulateEnd() { const s = session(); s.access = { tier: 'free', status: 'canceled' }; store.set('session', s); return wait(s); },
      async _simulatePaid() { const s = session(); if (!s.signed_in) fail('auth_required', 'Sign in first', 401); s.access = Object.assign({}, s.access, { tier: 'pro', status: 'active', trial_ends: null }); store.set('session', s); return wait(s); }
    },
    organisers: {
      async submitListing(form) {
        const req = ['event_name', 'organiser_name', 'email', 'market', 'location', 'application_url'];
        const missing = req.filter(k => !String(form[k] || '').trim()); if (missing.length) fail('validation', 'Please complete: ' + missing.join(', ').replace(/_/g, ' '), 400, { fields: missing });
        needMarket(form.market);
        const list = store.get('submissions', []); const ref = 'FP-' + (1000 + list.length + 1);
        list.push(Object.assign({ reference: ref, status: 'received', received_at: new Date().toISOString() }, form)); store.set('submissions', list);
        return wait({ reference: ref, status: 'received' });
      }
    },
    feedback: { async report({ opportunity_id, reason, note }) { const l = store.get('reports', []); l.push({ opportunity_id, reason, note, at: new Date().toISOString() }); store.set('reports', l); return wait({ ok: true, reference: 'RP-' + (100 + l.length) }); } },
    waitlist: { async join({ email, market }) { if (!/.+@.+\..+/.test(email || '')) fail('invalid_email', 'Enter a valid email address'); const l = store.get('waitlist', []); l.push({ email, market: needMarket(market), at: new Date().toISOString() }); store.set('waitlist', l); return wait({ ok: true }); } },
    analytics: { track(event, props) { if (window.console && console.debug) console.debug('[mock analytics]', event, props || {}); } },
    _dev: { reset() { ['session', 'saved', 'alerts', 'checkout', 'pending_link', 'submissions', 'reports', 'waitlist'].forEach(store.del); } }
  };
})();
