const fs = require('fs');

const AREA_CENTROIDS = {
  Bedfordshire: { latitude: 52.1357, longitude: -0.4680 },
  Berkshire: { latitude: 51.4668, longitude: -1.1854 },
  Bristol: { latitude: 51.4545, longitude: -2.5879 },
  Buckinghamshire: { latitude: 51.8072, longitude: -0.8128 },
  Cambridgeshire: { latitude: 52.2053, longitude: 0.1218 },
  Cheshire: { latitude: 53.2326, longitude: -2.6103 },
  'County Durham': { latitude: 54.7294, longitude: -1.8812 },
  Devon: { latitude: 50.7156, longitude: -3.5309 },
  Essex: { latitude: 51.7343, longitude: 0.4691 },
  Gloucestershire: { latitude: 51.8642, longitude: -2.2380 },
  'Greater Manchester': { latitude: 53.4576, longitude: -2.1578 },
  Hampshire: { latitude: 51.0577, longitude: -1.3081 },
  Hertfordshire: { latitude: 51.8098, longitude: -0.2377 },
  Kent: { latitude: 51.2787, longitude: 0.5217 },
  Lancashire: { latitude: 53.7632, longitude: -2.7044 },
  London: { latitude: 51.5072, longitude: -0.1276 },
  Merseyside: { latitude: 53.4084, longitude: -2.9916 },
  Midlands: { latitude: 52.4862, longitude: -1.8904 },
  Monmouthshire: { latitude: 51.8116, longitude: -2.7160 },
  'North East': { latitude: 54.9783, longitude: -1.6178 },
  'North East England': { latitude: 54.9783, longitude: -1.6178 },
  'North West': { latitude: 53.4808, longitude: -2.2426 },
  'Northamptonshire': { latitude: 52.2405, longitude: -0.9027 },
  'Northern Ireland': { latitude: 54.5973, longitude: -5.9301 },
  Oxfordshire: { latitude: 51.7520, longitude: -1.2577 },
  Scotland: { latitude: 56.4907, longitude: -4.2026 },
  Somerset: { latitude: 51.1051, longitude: -2.9262 },
  'South East': { latitude: 51.2787, longitude: 0.5217 },
  'South West': { latitude: 51.4545, longitude: -2.5879 },
  'South West England': { latitude: 51.4545, longitude: -2.5879 },
  'South Yorkshire': { latitude: 53.3811, longitude: -1.4701 },
  Staffordshire: { latitude: 52.8793, longitude: -2.0572 },
  Surrey: { latitude: 51.2362, longitude: -0.5704 },
  'Tyne and Wear': { latitude: 54.9783, longitude: -1.6178 },
  Wales: { latitude: 52.1307, longitude: -3.7837 },
  'West Midlands': { latitude: 52.4862, longitude: -1.8904 },
  'West Sussex': { latitude: 50.9280, longitude: -0.4617 },
  'West Yorkshire': { latitude: 53.8008, longitude: -1.5491 },
  Wiltshire: { latitude: 51.3492, longitude: -1.9927 }
};

const PLACE_CENTROIDS = [
  ['Abergavenny', ['abergavenny'], 51.8241, -3.0174],
  ['Arley Hall', ['arley hall'], 53.3223, -2.4934],
  ['Bath', ['bathnes', 'bath & north east somerset', 'bath'], 51.3811, -2.3590],
  ['Bedford', ['bedford river festival', 'bedford'], 52.1364, -0.4607],
  ['Billingham', ['billingham'], 54.6085, -1.2920],
  ['Bishop Auckland', ['bishop auckland'], 54.6647, -1.6768],
  ['Blyth', ['blyth town council', 'blyth'], 55.1275, -1.5086],
  ['Bournemouth', ['bcp council', 'bournemouth', 'poole', 'christchurch'], 50.7192, -1.8808],
  ['Box Moor', ['box moor', 'hemel hempstead'], 51.7513, -0.4725],
  ['Bristol', ['forwards 2026', 'valley fest', 'bristol'], 51.4545, -2.5879],
  ['Broadstairs', ['broadstairs'], 51.3590, 1.4394],
  ['Bucks County Show', ['bucks county show', 'aylesbury'], 51.8156, -0.8084],
  ['Caithness', ['caithness'], 58.4543, -3.0895],
  ['Cambridge', ['cambridge folk festival', 'strawberry fair', 'cambridge'], 52.2053, 0.1218],
  ['Cardiff', ['st fagans', 'cardiff'], 51.4866, -3.1791],
  ['Chepstow', ['chepstow'], 51.6419, -2.6742],
  ['Dover', ['dover'], 51.1279, 1.3134],
  ['Dorset County Show', ['dorset county show', 'dorchester'], 50.7107, -2.4406],
  ['Darlington', ['darlington'], 54.5236, -1.5595],
  ['Durham', ['durham markets', 'durham market', 'durham city', ' durham '], 54.7753, -1.5849],
  ['Edinburgh', ['edinburgh', 'hogmanay'], 55.9533, -3.1883],
  ['Exeter', ['exeter cathedral', 'exeter'], 50.7184, -3.5339],
  ['Farnham', ['farnham'], 51.2143, -0.7989],
  ['Ford and Etal', ['ford and etal', 'etal'], 55.6482, -2.1195],
  ['Gateshead', ['gateshead'], 54.9527, -1.6034],
  ['Glasgow', ['glasgow'], 55.8642, -4.2518],
  ['Harrogate', ['great yorkshire show', 'ripley castle', 'harrogate'], 53.9921, -1.5418],
  ['Heaton Park', ['heaton park', 'manchester'], 53.5346, -2.2536],
  ['Heighington', ['heighington christmas market', 'heighington'], 54.5958, -1.6177],
  ['Hartlepool', ['hartlepool'], 54.6917, -1.2129],
  ['Knutsford', ['knutsford'], 53.3029, -2.3721],
  ['Knaresborough', ['knaresborough'], 54.0091, -1.4677],
  ['Leeds', ['leeds christmas market', 'yeadon, leeds', 'leeds'], 53.8008, -1.5491],
  ['Leicester', ['leicestershire county show', 'leicester'], 52.6369, -1.1398],
  ['Lichfield', ['lichfield'], 52.6835, -1.8265],
  ['Loddiswell', ['loddiswell'], 50.3216, -3.8033],
  ['London', ['excel london', 'raf museum london', 'borough market', 'greenwich market', 'notting hill carnival', 'westminster', 'barnet', 'london'], 51.5072, -0.1276],
  ['Ludlow', ['ludlow food festival', 'ludlow'], 52.3670, -2.7183],
  ['Luton', ['luton'], 51.8787, -0.4200],
  ['Marlow', ['marlow'], 51.5719, -0.7769],
  ['Navan', ['navan'], 53.6528, -6.6810],
  ['Neston', ['neston town council', 'neston'], 53.2918, -3.0634],
  ['Newcastle upon Tyne', ['newcastle'], 54.9783, -1.6178],
  ['Middlesbrough', ['middlesbrough', 'orange pip'], 54.5742, -1.2348],
  ['North Tyneside', ['north tyneside'], 55.0182, -1.4855],
  ['Northampton', ['northampton'], 52.2405, -0.9027],
  ['Nottingham', ['victoria embankment, nottingham', 'nottingham'], 52.9548, -1.1581],
  ['Oxford', ['oxford'], 51.7520, -1.2577],
  ['Pembrokeshire', ['pembrokeshire'], 51.6741, -4.9089],
  ['Peterborough', ['peterborough'], 52.5695, -0.2405],
  ['Preston', ['preston'], 53.7632, -2.7044],
  ['Redcar', ['redcar', 'redcar and cleveland'], 54.6166, -1.0590],
  ['Salisbury', ['salisbury charter market', 'salisbury city council', 'salisbury'], 51.0688, -1.7945],
  ['Seaham', ['seaham'], 54.8390, -1.3457],
  ['Sheffield', ['graves park', 'peddler market sheffield', 'sheffield'], 53.3811, -1.4701],
  ['South Shields', ['south shields', 'south tyneside'], 54.9986, -1.4323],
  ['Sprowston', ['sprowston'], 52.6554, 1.3208],
  ['Stafford', ['staffordshire county showground', 'stafford'], 52.8067, -2.1171],
  ['St Albans', ['st albans'], 51.7527, -0.3394],
  ['Stockton-on-Tees', ['stockton-on-tees', 'stockton on tees', 'stockton markets', 'stockton market'], 54.5700, -1.3280],
  ['Stirling', ['stirling highland games', 'stirling farmers', 'stirling'], 56.1165, -3.9369],
  ['Stone', ['stone food', 'stone'], 52.9059, -2.1486],
  ['Sunderland', ['sunderland'], 54.9069, -1.3838],
  ['Swansea', ['swansea'], 51.6214, -3.9436],
  ['Thame', ['thame food festival', 'thame'], 51.7484, -0.9789],
  ['Trentham', ['trentham'], 52.9629, -2.1973],
  ['Twyford', ['twyford village fete', 'twyford'], 51.4752, -0.8634],
  ['Westmorland', ['westmorland county show', 'westmorland'], 54.2670, -2.7160],
  ['Worcester', ['worcester show', 'worcester'], 52.1936, -2.2216],
  ['York', ['york food festival', 'york '], 53.9590, -1.0815]
];

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

function matchNeedle(text, needle) {
  const escaped = String(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function rowCoordinateText(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    row.notes,
    row.source_url,
    row.application_url
  ].filter(Boolean).join(' ').toLowerCase();
}

function rowCoordinates(row) {
  const latitude = Number(row.latitude || row.lat);
  const longitude = Number(row.longitude || row.lng || row.lon);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude, source: 'row', precision: 'exact', label: row.location || row.event_name || 'row coordinates' };
  }

  const text = rowCoordinateText(row);
  for (const [label, needles, placeLat, placeLon] of PLACE_CENTROIDS) {
    if (needles.some(needle => matchNeedle(text, needle))) {
      return { latitude: placeLat, longitude: placeLon, source: 'place-centroid', precision: 'place', label };
    }
  }

  const area = AREA_CENTROIDS[row.county] ? row.county : row.region;
  const coords = AREA_CENTROIDS[area];
  return coords ? { ...coords, source: 'area-centroid', precision: 'area', label: area } : null;
}

function readCache(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cachePath, cache) {
  if (!cachePath) return;
  fs.mkdirSync(require('path').dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

async function resolvePostcode(value, options = {}) {
  const postcode = normalisePostcode(value);
  if (!postcode) return null;
  const outcode = outcodeFrom(postcode);
  const cachePath = options.cachePath || '';
  const cache = readCache(cachePath);
  const cacheKey = postcode.length > outcode.length ? postcode : outcode;
  if (cache[cacheKey]) return cache[cacheKey];

  const fetcher = options.fetch || fetch;
  const candidates = postcode.length > outcode.length
    ? [`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`]
    : [`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`];

  for (const url of candidates) {
    try {
      const res = await fetcher(url, { headers: { 'user-agent': 'PitchListUKBot/0.1 (+https://pitchlist.uk)' } });
      if (!res.ok) continue;
      const body = await res.json();
      const result = body.result || {};
      if (Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude))) {
        const resolved = {
          postcode: cacheKey,
          outcode,
          latitude: Number(result.latitude),
          longitude: Number(result.longitude),
          source: url.includes('/outcodes/') ? 'postcodes.io/outcode' : 'postcodes.io/postcode'
        };
        cache[cacheKey] = resolved;
        writeCache(cachePath, cache);
        return resolved;
      }
    } catch {}
  }
  return null;
}

module.exports = {
  AREA_CENTROIDS,
  PLACE_CENTROIDS,
  haversineMiles,
  normalisePostcode,
  outcodeFrom,
  resolvePostcode,
  rowCoordinates
};
