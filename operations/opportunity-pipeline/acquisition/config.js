function loadEnvValue(key) {
  return process.env[key] || '';
}

const FIELDNAMES = [
  'stable_id','event_name','organiser','source_url','application_url','contact_email','location','region','event_start','event_end','application_deadline','stall_fee','vendor_categories','last_checked','confidence','notes','query_lane','query_text','source_evidence','quality_status','quality_reasons','publishable'
];

const ENRICHMENT_FIELDNAMES = [
  'area_confidence','route_type','organiser_type','buyer_fit_tags','quality_status',
  'country','jurisdiction','currency','market_domain','tax_region'
];

const ACTIVE_FIELDNAMES = [
  ...FIELDNAMES,
  'quality_score',
  'quality_reasons',
  'first_seen',
  'last_seen',
  'lifecycle_status',
  ...ENRICHMENT_FIELDNAMES
];

const REGIONS = [
  'Scotland','Wales','Northern Ireland','North East England','North West England','Yorkshire','West Midlands','East Midlands','East of England','South West England','South East England','London',
  'Manchester','Liverpool','Leeds','Sheffield','Birmingham','Bristol','Newcastle','Nottingham','Cardiff','Glasgow','Edinburgh','Belfast','Kent','Surrey','Sussex','Devon','Cornwall','Norfolk','Suffolk','Essex','Hampshire','Cheshire','Lancashire','Cumbria','Dorset','Somerset','Oxfordshire','Cambridgeshire','Lincolnshire','Northumberland','County Durham','Tyne and Wear','South Yorkshire','Buckinghamshire'
];

const INTENTS = [
  'food festival trader application 2026',
  'street food trader application 2026',
  'festival stallholder application 2026',
  'event exhibitor application food 2026',
  'market trader application food 2026',
  'casual trading licence food vendor',
  'artisan market stallholder application 2026',
  'Christmas market trader application 2026',
  'county show trade stand application 2026',
  'agricultural show caterer application 2026',
  'music festival food vendor application 2026',
  'beer festival food trader application 2026',
  'family festival trader application 2026',
  'summer fair stallholder application 2026',
  'food and drink festival traders apply 2026',
  'sports event food vendor application 2026',
  'running event caterer application 2026',
  'marathon food vendor application 2026',
  'car boot sale trader application 2026',
  'car boot sale food vendor application 2026',
  'fireworks event food vendor application 2026',
  'bonfire night trader application 2026',
  'car show trade stand application 2026',
  'classic car show exhibitor application 2026',
  'motorsport event food vendor application 2026',
  'large public event trader application 2026',
  'community event stallholder application 2026',
  'council event trader application 2026',
  'outdoor event catering application 2026'
];

const SITE_PATTERNS = [
  'site:.gov.uk trader application event food festival',
  'site:.gov.uk event trader application food vendor',
  'site:.gov.uk stallholder application public event',
  'site:.org.uk trader application food festival',
  'site:.org.uk event vendor application food',
  'site:.co.uk trader application food festival',
  'site:.co.uk car show trade stand application',
  'site:.co.uk car boot sale trader application',
  'site:.com trader application food festival UK',
  'intitle:"trader application" "food festival" UK',
  'intitle:"trader application" "public event" UK',
  'intitle:"stallholder application" festival UK',
  'intitle:"trade stand application" "car show" UK',
  'inurl:traders "food festival" "apply" UK',
  'inurl:traders "public event" "apply" UK',
  'inurl:stallholders festival "application" UK',
  '"trade stand application" "county show" UK',
  '"catering application" "festival" UK',
  '"food vendor application" "sports event" UK',
  '"food vendor application" fireworks UK',
  '"bonfire night" "trader application" UK',
  '"car boot" "trader application" UK',
  '"car show" "trade stand application" UK'
];

const DEFAULT_QUERIES = [
  'UK food festival trader applications 2026 street food',
  'UK market trader application street food 2026',
  'UK festival stallholder applications 2026 food drink',
  'UK event exhibitor application food vendors 2026',
  ...SITE_PATTERNS,
  ...REGIONS.flatMap(region => INTENTS.slice(0, 8).map(intent => `${region} ${intent}`)),
];

module.exports = { loadEnvValue, FIELDNAMES, ENRICHMENT_FIELDNAMES, ACTIVE_FIELDNAMES, DEFAULT_QUERIES, REGIONS, INTENTS, SITE_PATTERNS };
