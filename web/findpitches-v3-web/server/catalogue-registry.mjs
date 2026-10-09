// V3-owned market configuration and stable region taxonomy, copied from the approved handover.
// No fixtures, approximate geocoder, browser state or stub functions.
const slug = s => String(s).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
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
export {MARKETS,REGIONS};
