export const PRIORITY_STATE_CODES = Object.freeze([
  'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI',
  'NJ', 'VA', 'WA', 'AZ', 'MA', 'CO', 'TN', 'IN', 'MO', 'MD',
  'MN', 'WI', 'OR', 'SC', 'AL', 'KY', 'LA', 'OK', 'CT', 'IA',
  'KS', 'NV', 'UT', 'AR', 'NE', 'NM', 'ID', 'ME', 'AK', 'HI',
  'MS', 'MT', 'DE', 'NH', 'ND', 'RI', 'SD', 'VT', 'WV', 'WY'
]);

const STATE_LOCALITIES = Object.freeze({
  CA: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Sacramento', 'Fresno', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Riverside', 'Santa Ana'],
  TX: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Lubbock', 'Laredo', 'Irving'],
  FL: ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'St Petersburg', 'Tallahassee', 'Fort Lauderdale', 'Gainesville', 'Sarasota', 'Pensacola', 'Naples', 'West Palm Beach'],
  NY: ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany', 'New Rochelle', 'Mount Vernon', 'Schenectady', 'Utica', 'White Plains', 'Ithaca'],
  PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Reading', 'Erie', 'Scranton', 'Bethlehem', 'Lancaster', 'Harrisburg', 'York', 'State College', 'Wilkes-Barre'],
  IL: ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield', 'Elgin', 'Peoria', 'Champaign', 'Waukegan', 'Bloomington', 'Evanston'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma', 'Canton', 'Youngstown', 'Lorain', 'Hamilton', 'Dublin'],
  GA: ['Atlanta', 'Augusta', 'Columbus', 'Macon', 'Savannah', 'Athens', 'Sandy Springs', 'Roswell', 'Johns Creek', 'Albany', 'Marietta', 'Valdosta'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Cary', 'Wilmington', 'High Point', 'Asheville', 'Concord', 'Greenville'],
  MI: ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor', 'Lansing', 'Dearborn', 'Livonia', 'Troy', 'Kalamazoo', 'Flint', 'Traverse City'],
  NJ: ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Edison', 'Woodbridge', 'Lakewood', 'Toms River', 'Hamilton', 'Trenton', 'Clifton', 'Camden'],
  VA: ['Virginia Beach', 'Chesapeake', 'Norfolk', 'Richmond', 'Newport News', 'Alexandria', 'Hampton', 'Roanoke', 'Portsmouth', 'Suffolk', 'Lynchburg', 'Charlottesville'],
  WA: ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Kent', 'Everett', 'Renton', 'Yakima', 'Bellingham', 'Olympia', 'Walla Walla'],
  AZ: ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Glendale', 'Gilbert', 'Tempe', 'Peoria', 'Surprise', 'Flagstaff', 'Yuma'],
  MA: ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell', 'Brockton', 'Quincy', 'Lynn', 'New Bedford', 'Fall River', 'Pittsfield', 'Salem'],
  CO: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Thornton', 'Arvada', 'Westminster', 'Pueblo', 'Boulder', 'Greeley', 'Durango']
});

const QUERY_TEMPLATES = Object.freeze([
  { id: 'vendor-applications', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} "vendor applications" market festival fair` },
  { id: 'become-vendor', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} "become a vendor" market festival fair` },
  { id: 'vendor-registration', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} vendor registration market festival event` },
  { id: 'farmers-market', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} farmers market vendor application` },
  { id: 'festival', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} festival vendor application` },
  { id: 'arts-crafts', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} arts crafts market vendor application` },
  { id: 'food-truck', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} food truck vendor application event` },
  { id: 'holiday-market', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} holiday Christmas market vendor application` },
  { id: 'exhibitor', build: ({ locality, stateName, year }) => `"${locality}" "${stateName}" ${year} exhibitor application fair show festival` },
  { id: 'government-events', build: ({ locality, stateName, year }) => `site:.gov "${locality}" "${stateName}" ${year} vendor application event festival` }
]);

const EXCLUSIONS = '-site:facebook.com -site:instagram.com -site:youtube.com -site:eventbrite.com -site:linkedin.com -site:reddit.com -site:yelp.com -site:10times.com -site:festivalnet.com';

function sourceLocalities(state) {
  return [...new Set((Array.isArray(state?.sources) ? state.sources : [])
    .map(source => String(source?.locality || '').trim())
    .filter(Boolean))].slice(0, 12);
}

export function growthQueryPlan(state, options = {}) {
  const code = String(state?.code || '').toUpperCase();
  const configured = STATE_LOCALITIES[code] || sourceLocalities(state);
  const localities = configured.length ? configured : [String(state?.name || code).trim()].filter(Boolean);
  if (!localities.length) throw new Error(`No growth discovery geography configured for ${code}`);
  const years = options.years?.length ? options.years : [new Date().getUTCFullYear(), new Date().getUTCFullYear() + 1];
  return localities.flatMap(locality => years.flatMap(year => QUERY_TEMPLATES.map(template => ({
    id: `${code.toLowerCase()}-${String(locality).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}-${template.id}`,
    state_code: code,
    state_name: state.name,
    locality,
    year,
    template_id: template.id,
    query: `${template.build({ locality, stateName: state.name, year })} ${EXCLUSIONS}`
  }))));
}

export function growthQueryBatch(state, options = {}) {
  const plan = growthQueryPlan(state, options);
  const offset = Math.max(0, Number(options.offset || 0));
  const limit = Math.max(1, Math.min(8, Number(options.limit || 4)));
  if (offset >= plan.length) return [];
  return plan.slice(offset, offset + limit);
}

export function growthPlanSize(state, options = {}) {
  return growthQueryPlan(state, options).length;
}
