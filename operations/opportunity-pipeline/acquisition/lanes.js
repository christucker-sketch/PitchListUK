const CORE_LANES = [
  {
    id: 'london-food-trucks',
    title: 'London food trucks and street food',
    category: 'food',
    priority: 100,
    queries: [
      'London food truck trader application 2026',
      'London street food trader application 2026',
      'Battersea street food trader application 2026',
      'Greenwich market street food trader application',
      'London council street trading food vendor application',
      'Greater London food festival trader application 2026'
    ]
  },
  {
    id: 'north-east-council-markets',
    title: 'North East council markets and street trading routes',
    category: 'food',
    priority: 98,
    lane_type: 'region_route',
    route_type: 'street_trading_pitch',
    organiser_type: 'local_council',
    queries: [
      'County Durham Sunderland Newcastle Gateshead Middlesbrough Stockton Hartlepool street trading food vendor application',
      'North East England council market trader application food vendor',
      'Sunderland Gateshead South Tyneside North Tyneside street trading consent food vendor',
      'Middlesbrough Stockton Hartlepool Redcar Cleveland market trader street trading application',
      'Durham Markets food producers crafters market become a trader',
      'Teesside market trader application food vendor Orange Pip Stockton Middlesbrough'
    ]
  },
  {
    id: 'south-east-food',
    title: 'South East food festivals and public events',
    category: 'food',
    priority: 95,
    queries: [
      'South East England food festival trader application 2026',
      'Surrey food festival trader application 2026',
      'Kent food festival trader application 2026',
      'Hertfordshire food vendor application event 2026',
      'Sussex street food trader application 2026',
      'Berkshire food and drink festival stallholder application 2026'
    ]
  },
  {
    id: 'council-street-trading',
    title: 'Council street trading and public event permits',
    category: 'food',
    priority: 90,
    queries: [
      'site:.gov.uk street trading food vendor application 2026',
      'site:.gov.uk event trader application food vendor',
      'site:.gov.uk markets street trading trader application',
      'site:.gov.uk public event food vendor application',
      'site:.gov.uk mobile catering street trading application',
      'site:.gov.uk temporary event food trader application'
    ]
  },
  {
    id: 'christmas-markets-2026',
    title: 'Christmas markets 2026',
    category: 'food_and_craft',
    priority: 85,
    queries: [
      'UK Christmas market trader application 2026',
      'London Christmas market trader application 2026',
      'South East Christmas market stallholder application 2026',
      'site:.gov.uk Christmas market stallholder application 2026',
      'Christmas market food trader application 2026 UK',
      'Christmas market craft stallholder application 2026 UK'
    ]
  },
  {
    id: 'county-shows',
    title: 'County and agricultural shows',
    category: 'food',
    priority: 80,
    queries: [
      'county show trade stand application 2026 UK',
      'agricultural show caterer application 2026 UK',
      'county show food vendor application 2026',
      'South East county show trade stand application 2026',
      'site:.org.uk county show trade stands application 2026',
      'site:.co.uk agricultural show trade stand application 2026'
    ]
  },
  {
    id: 'artisan-craft-markets',
    title: 'Artisan, craft and jewellery markets',
    category: 'craft',
    priority: 75,
    queries: [
      'London makers market stallholder application 2026 jewellery',
      'Hertfordshire craft fair stallholder application 2026',
      'South East artisan market stallholder application 2026',
      'UK craft market stallholder application 2026 handmade',
      'jewellery market exhibitor application 2026 UK',
      'designer maker market application 2026 London'
    ]
  },
  {
    id: 'diet-and-niche-food',
    title: 'Dietary and niche food opportunities',
    category: 'food',
    priority: 70,
    queries: [
      'vegan festival food trader application 2026 UK',
      'halal food festival trader application 2026 UK',
      'dessert trader application food festival 2026 UK',
      'coffee trader festival application 2026 UK',
      'BBQ food festival trader application 2026 UK',
      'world food festival trader application 2026 UK'
    ]
  },
  {
    id: 'national-food-festivals',
    title: 'National food festival routes',
    category: 'food',
    priority: 65,
    queries: [
      'UK food festival trader applications 2026 street food',
      'site:.co.uk trader application food festival 2026',
      'site:.org.uk trader application food festival 2026',
      'intitle:"trader application" "food festival" UK 2026',
      'inurl:trader-application food festival 2026 UK',
      'food and drink festival exhibitor application 2026 UK'
    ]
  }
];

const FIRST_PARTY_WEAK_REGION_LANES = [
  {
    id: 'weak-regions-first-party-applications',
    title: 'Weak-region first-party trader applications',
    category: 'food_and_craft',
    priority: 99,
    lane_type: 'approved_source_route',
    route_type: 'market',
    organiser_type: 'market_operator',
    queries: [
      'site:durhammarkets.co.uk/become-a-trader "Become A Trader"',
      'site:newcastle.gov.uk/business/newcastle-markets "apply for a stall" farmers market',
      'site:online.northumberland.gov.uk/citizenportal "Market Stall Application"',
      'site:tastecumbria.co.uk/trader-application-form "Trader Application Form"',
      'site:barnsley.gov.uk/services/markets/trade-at-our-local-markets "apply for a stall"',
      'site:rotherham.gov.uk/markets/apply-market-street-trader-licence "market trader"',
      'site:dorchester-tc.gov.uk/Our-Services/Markets stallholder',
      'site:saundersmarkets.co.uk/aylesbury-market "Trader Application"'
    ]
  }
];

const EXPANSION_LANES = [
  {
    id: 'farmers-markets',
    title: 'Farmers markets and local producer markets',
    category: 'food_and_craft',
    priority: 64,
    lane_type: 'route',
    route_type: 'farmers_market',
    organiser_type: 'market_operator',
    queries: [
      'UK farmers market trader application food vendor 2026',
      'farmers market stallholder application local producer UK',
      'London farmers market food stall application 2026',
      'South East farmers market stallholder application 2026',
      'site:.org.uk farmers market stallholder application food',
      'site:.co.uk farmers market trader application UK'
    ]
  },
  {
    id: 'night-twilight-markets',
    title: 'Night markets and twilight markets',
    category: 'food',
    priority: 63,
    lane_type: 'route',
    route_type: 'night_market',
    organiser_type: 'market_operator',
    queries: [
      'UK night market street food trader application 2026',
      'twilight market food vendor application UK 2026',
      'London night market trader application street food',
      'South East night market stallholder application food',
      'evening market food trader application UK',
      'street food night market vendor application UK'
    ]
  },
  {
    id: 'shopping-centre-popups',
    title: 'Shopping centre and retail park pop-ups',
    category: 'food_and_craft',
    priority: 62,
    lane_type: 'organiser',
    route_type: 'shopping_centre',
    organiser_type: 'shopping_centre',
    queries: [
      'UK shopping centre pop up food trader application',
      'shopping centre mall kiosk trader application UK',
      'retail park pop up food vendor application UK',
      'London shopping centre food pop up application',
      'South East shopping centre trader application food',
      'shopping centre commercialisation pop up traders UK'
    ]
  },
  {
    id: 'university-campus-food',
    title: 'University and college campus food pop-ups',
    category: 'food',
    priority: 61,
    lane_type: 'organiser',
    route_type: 'university_campus',
    organiser_type: 'university',
    queries: [
      'UK university campus food truck trader application',
      'university street food vendor application UK',
      'students union food vendor application 2026 UK',
      'London university food pop up vendor application',
      'college campus food trader application UK',
      'university market stallholder food application UK'
    ]
  },
  {
    id: 'business-park-office-popups',
    title: 'Business park and office pop-up food routes',
    category: 'food',
    priority: 60,
    lane_type: 'organiser',
    route_type: 'office_pop_up',
    organiser_type: 'corporate',
    queries: [
      'UK business park food truck pitch application',
      'office pop up food vendor application UK',
      'corporate catering pop up food truck UK',
      'London office food truck pitch application',
      'business park street food vendor application',
      'workplace food pop up trader application UK'
    ]
  },
  {
    id: 'racecourses-showgrounds',
    title: 'Racecourses and showgrounds',
    category: 'food',
    priority: 59,
    lane_type: 'organiser',
    route_type: 'showground',
    organiser_type: 'showground',
    queries: [
      'UK racecourse food trader application 2026',
      'racecourse catering pitch application UK',
      'showground trade stand food application 2026 UK',
      'showground caterer application 2026 UK',
      'equine event food vendor application UK',
      'horse racing food vendor pitch application UK'
    ]
  },
  {
    id: 'visitor-attractions-food',
    title: 'Visitor attractions and heritage site food pitches',
    category: 'food',
    priority: 58,
    lane_type: 'organiser',
    route_type: 'visitor_attraction',
    organiser_type: 'visitor_attraction',
    queries: [
      'UK visitor attraction food vendor application',
      'museum food truck pitch application UK',
      'castle event food trader application UK',
      'National Trust food vendor application event',
      'English Heritage event trader application food',
      'zoo food vendor pitch application UK'
    ]
  },
  {
    id: 'brewery-taproom-food-trucks',
    title: 'Brewery and taproom food truck residencies',
    category: 'food',
    priority: 57,
    lane_type: 'route',
    route_type: 'brewery',
    organiser_type: 'private_landowner',
    queries: [
      'UK brewery food truck residency application',
      'taproom food truck vendor application UK',
      'brewery street food pop up traders UK',
      'London brewery food truck pitch application',
      'South East brewery food vendor pop up',
      'craft brewery food trader application UK'
    ]
  },
  {
    id: 'sports-events-food-vendors',
    title: 'Sports clubs and mass participation events',
    category: 'food',
    priority: 56,
    lane_type: 'organiser',
    route_type: 'sports_event',
    organiser_type: 'sports_club',
    queries: [
      'UK marathon food vendor application 2026',
      'running event food trader application UK',
      'football club food vendor pitch application UK',
      'rugby club food vendor application UK',
      'sports event catering vendor application 2026 UK',
      'triathlon event food trader application UK'
    ]
  },
  {
    id: 'bonfire-fireworks-events',
    title: 'Bonfire night and fireworks events',
    category: 'food',
    priority: 55,
    lane_type: 'seasonal',
    route_type: 'fireworks',
    organiser_type: 'local_council',
    queries: [
      'UK bonfire night food trader application 2026',
      'fireworks event food vendor application UK 2026',
      'site:.gov.uk bonfire night trader application food',
      'London fireworks food trader application 2026',
      'South East bonfire event food vendor application',
      'fireworks display catering pitch application UK'
    ]
  },
  {
    id: 'summer-fetes-carnivals',
    title: 'Summer fairs, fetes and carnivals',
    category: 'food_and_craft',
    priority: 54,
    lane_type: 'route',
    route_type: 'carnival',
    organiser_type: 'charity',
    queries: [
      'UK summer fair stallholder application food 2026',
      'village fete food stall application UK 2026',
      'carnival food vendor application 2026 UK',
      'community fair food trader application UK',
      'school summer fair food stallholder application UK',
      'charity fete food vendor pitch application UK'
    ]
  },
  {
    id: 'bid-town-centre-events',
    title: 'BID and town centre event routes',
    category: 'food_and_craft',
    priority: 53,
    lane_type: 'organiser',
    route_type: 'town_centre_event',
    organiser_type: 'BID',
    queries: [
      'UK BID event trader application food vendor',
      'business improvement district market trader application UK',
      'town centre event food trader application 2026',
      'high street event stallholder application food UK',
      'Christmas lights switch on food trader application UK',
      'town centre market food vendor application UK'
    ]
  },
  {
    id: 'private-venue-landowner-pitches',
    title: 'Private venues and landowner pitch routes',
    category: 'food',
    priority: 52,
    lane_type: 'organiser',
    route_type: 'permanent_pitch',
    organiser_type: 'private_landowner',
    queries: [
      'UK private land food truck pitch application',
      'food truck permanent pitch application UK',
      'venue food truck pitch application UK',
      'outdoor venue food trader application UK',
      'farm shop food truck pitch application UK',
      'private estate event food vendor application UK'
    ]
  },
  {
    id: 'conference-exhibition-catering',
    title: 'Conference, exhibition and trade show catering',
    category: 'food',
    priority: 51,
    lane_type: 'route',
    route_type: 'exhibition',
    organiser_type: 'event_agency',
    queries: [
      'UK exhibition food vendor application 2026',
      'trade show catering vendor application UK',
      'conference food trader application UK',
      'expo food stallholder application 2026 UK',
      'event agency food vendor application UK',
      'exhibition centre catering pitch application UK'
    ]
  },
  {
    id: 'wedding-venue-catering-opportunities',
    title: 'Wedding venues and private hire catering routes',
    category: 'food',
    priority: 50,
    lane_type: 'organiser',
    route_type: 'wedding',
    organiser_type: 'wedding_venue',
    queries: [
      'UK wedding venue food truck supplier application',
      'wedding venue street food supplier application UK',
      'private hire catering supplier application UK',
      'wedding fair food vendor application 2026 UK',
      'wedding venue preferred supplier catering application',
      'mobile catering wedding venue supplier UK'
    ]
  }
];

const IRELAND_REGION_GROUPS = [
  {
    area: 'Ireland - Dublin',
    search_area: 'Dublin Ireland',
    counties: ['Dublin']
  },
  {
    area: 'Ireland - Eastern',
    search_area: 'Kildare Louth Meath Wicklow Ireland',
    counties: ['Kildare', 'Louth', 'Meath', 'Wicklow']
  },
  {
    area: 'Ireland - Midland',
    search_area: 'Laois Longford Offaly Westmeath Ireland',
    counties: ['Laois', 'Longford', 'Offaly', 'Westmeath']
  },
  {
    area: 'Ireland - Border',
    search_area: 'Cavan Donegal Leitrim Monaghan Sligo Ireland',
    counties: ['Cavan', 'Donegal', 'Leitrim', 'Monaghan', 'Sligo']
  },
  {
    area: 'Ireland - West',
    search_area: 'Galway Mayo Roscommon Ireland',
    counties: ['Galway', 'Mayo', 'Roscommon']
  },
  {
    area: 'Ireland - Mid-West',
    search_area: 'Clare Limerick Tipperary Ireland',
    counties: ['Clare', 'Limerick', 'Tipperary']
  },
  {
    area: 'Ireland - South-East',
    search_area: 'Carlow Kilkenny Waterford Wexford Tipperary Ireland',
    counties: ['Carlow', 'Kilkenny', 'Waterford', 'Wexford', 'Tipperary']
  },
  {
    area: 'Ireland - South-West',
    search_area: 'Cork Kerry Ireland',
    counties: ['Cork', 'Kerry']
  },
  {
    area: 'Northern Ireland',
    search_area: 'Northern Ireland Belfast Antrim Armagh Down Fermanagh Londonderry Tyrone',
    counties: ['Antrim', 'Armagh', 'Down', 'Fermanagh', 'Londonderry', 'Tyrone']
  }
];

const IRELAND_ROUTE_LANES = [
  {
    id: 'ireland-food-festivals',
    title: 'Ireland food festivals and public events',
    category: 'food',
    priority: 49,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'food_festival',
    organiser_type: 'festival_company',
    queries: [
      'Ireland food festival trader application 2026',
      'Ireland food and drink festival exhibitor application 2026',
      'site:.ie food festival trader application 2026',
      'site:.ie food festival stallholder application',
      'Dublin food festival trader application 2026',
      'Cork food festival trader application 2026'
    ]
  },
  {
    id: 'ireland-markets-street-food',
    title: 'Ireland markets and street food pitches',
    category: 'food',
    priority: 48,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'market',
    organiser_type: 'market_operator',
    queries: [
      'Ireland market stallholder application food vendor 2026',
      'Ireland street food trader application 2026',
      'Dublin market food vendor application',
      'Cork market stallholder application food',
      'Galway market trader application food vendor',
      'site:.ie market stallholder application food'
    ]
  },
  {
    id: 'ireland-council-casual-trading',
    title: 'Ireland local authority casual trading routes',
    category: 'food',
    priority: 47,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'street_trading_pitch',
    organiser_type: 'local_council',
    queries: [
      'site:.ie casual trading licence food vendor Ireland',
      'site:.ie casual trading application food stall',
      'Ireland local authority event trader application food vendor',
      'Dublin casual trading licence food vendor',
      'Cork casual trading food vendor application',
      'Galway casual trading licence market trader'
    ]
  },
  {
    id: 'ireland-christmas-markets',
    title: 'Ireland Christmas and festive markets',
    category: 'food_and_craft',
    priority: 46,
    country: 'Ireland',
    lane_type: 'seasonal',
    route_type: 'christmas_market',
    organiser_type: 'market_operator',
    queries: [
      'Ireland Christmas market trader application 2026',
      'Ireland Christmas market stallholder application 2026',
      'Dublin Christmas market trader application 2026',
      'Cork Christmas market stallholder application 2026',
      'Galway Christmas market trader application',
      'site:.ie Christmas market food trader application'
    ]
  },
  {
    id: 'ireland-agricultural-shows',
    title: 'Ireland agricultural shows and county shows',
    category: 'food',
    priority: 45,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'agricultural_show',
    organiser_type: 'agricultural_society',
    queries: [
      'Ireland agricultural show trade stand application 2026',
      'Ireland agricultural show caterer application 2026',
      'Ireland county show food vendor application 2026',
      'site:.ie agricultural show trade stand application',
      'site:.ie show caterer application food vendor',
      'National Ploughing Championships trader application food'
    ]
  },
  {
    id: 'ireland-artisan-craft-markets',
    title: 'Ireland artisan and craft market stallholders',
    category: 'craft',
    priority: 44,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'artisan_market',
    organiser_type: 'market_operator',
    queries: [
      'Ireland craft market stallholder application 2026',
      'Ireland artisan market stallholder application',
      'Dublin makers market stallholder application',
      'Cork craft fair exhibitor application',
      'Galway artisan market stallholder application',
      'site:.ie craft fair stallholder application'
    ]
  },
  {
    id: 'ireland-farmers-markets',
    title: 'Ireland farmers markets and local producers',
    category: 'food_and_craft',
    priority: 43,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'farmers_market',
    organiser_type: 'market_operator',
    queries: [
      'Ireland farmers market stallholder application food producer',
      'Ireland farmers market trader application',
      'Dublin farmers market stall application',
      'Cork farmers market trader application',
      'Galway farmers market food stallholder application',
      'site:.ie farmers market stallholder application'
    ]
  },
  {
    id: 'ireland-university-campus-food',
    title: 'Ireland university and campus food pop-ups',
    category: 'food',
    priority: 42,
    country: 'Ireland',
    lane_type: 'organiser',
    route_type: 'university_campus',
    organiser_type: 'university',
    queries: [
      'Ireland university food vendor application',
      'Ireland student union food vendor application',
      'Dublin university food truck pitch application',
      'Cork university campus food vendor application',
      'Galway university food market stallholder application',
      'site:.ie students union food vendor application'
    ]
  },
  {
    id: 'ireland-brewery-taproom-food-trucks',
    title: 'Ireland brewery and taproom food truck residencies',
    category: 'food',
    priority: 41,
    country: 'Ireland',
    lane_type: 'organiser',
    route_type: 'brewery',
    organiser_type: 'private_landowner',
    queries: [
      'Ireland brewery food truck residency application',
      'Ireland taproom food truck vendor application',
      'Dublin brewery food truck pitch application',
      'Cork brewery street food pop up traders',
      'Galway brewery food vendor pop up',
      'site:.ie brewery food truck application'
    ]
  },
  {
    id: 'ireland-sports-community-events',
    title: 'Ireland sports and community event food vendors',
    category: 'food',
    priority: 40,
    country: 'Ireland',
    lane_type: 'country_route',
    route_type: 'sports_event',
    organiser_type: 'sports_club',
    queries: [
      'Ireland marathon food vendor application 2026',
      'Ireland community event food vendor application 2026',
      'Dublin running event food trader application',
      'Cork sports event food vendor application',
      'Galway community festival food trader application',
      'site:.ie event food vendor application Ireland'
    ]
  }
];

function irelandRegionLane(group, index) {
  return {
    id: `ireland-region-${slugify(group.area.replace(/^Ireland - /, ''))}`,
    title: `${group.area} trader opportunities`,
    category: 'food',
    priority: 39 - index,
    country: group.area === 'Northern Ireland' ? 'United Kingdom' : 'Ireland',
    area: group.area,
    lane_type: 'ireland_region',
    queries: [
      `${group.search_area} food festival trader application 2026`,
      `${group.search_area} street food trader application 2026`,
      `${group.search_area} market stallholder application food vendor 2026`,
      `${group.search_area} event trader application food vendor 2026`,
      `${group.search_area} casual trading licence food vendor`,
      `${group.search_area} mobile catering pitch application 2026`
    ]
  };
}

const COUNTY_AREAS = [
  'Aberdeenshire',
  'Aberdeen',
  'Angus',
  'Antrim',
  'Argyll and Bute',
  'Armagh',
  'Ayrshire',
  'Bedfordshire',
  'Berkshire',
  'Blaenau Gwent',
  'Bridgend',
  'Bristol',
  'Buckinghamshire',
  'Caerphilly',
  'Cambridgeshire',
  'Cardiff',
  'Carmarthenshire',
  'Ceredigion',
  'Cheshire',
  'Conwy',
  'Cornwall',
  'County Durham',
  'Cumbria',
  'Denbighshire',
  'Derbyshire',
  'Devon',
  'Dorset',
  'Down',
  'East Ayrshire',
  'East Dunbartonshire',
  'Dumfries and Galloway',
  'Dundee',
  'East Lothian',
  'East Renfrewshire',
  'East Riding of Yorkshire',
  'East Sussex',
  'Edinburgh',
  'Essex',
  'Falkirk',
  'Fermanagh',
  'Fife',
  'Flintshire',
  'Glasgow',
  'Gloucestershire',
  'Greater Manchester',
  'Gwynedd',
  'Hampshire',
  'Herefordshire',
  'Hertfordshire',
  'Highland',
  'Inverclyde',
  'Isle of Anglesey',
  'Isle of Wight',
  'Kent',
  'Lancashire',
  'Leicestershire',
  'Lincolnshire',
  'Londonderry',
  'London',
  'Merseyside',
  'Merthyr Tydfil',
  'Midlothian',
  'Monmouthshire',
  'Moray',
  'Neath Port Talbot',
  'Newport',
  'Norfolk',
  'North Yorkshire',
  'North Ayrshire',
  'North Lanarkshire',
  'Northamptonshire',
  'Northumberland',
  'Nottinghamshire',
  'Orkney',
  'Oxfordshire',
  'Pembrokeshire',
  'Perth and Kinross',
  'Powys',
  'Renfrewshire',
  'Rhondda Cynon Taf',
  'Rutland',
  'Scottish Borders',
  'Shetland',
  'Shropshire',
  'Somerset',
  'South Ayrshire',
  'South Lanarkshire',
  'South Yorkshire',
  'Staffordshire',
  'Stirling',
  'Suffolk',
  'Surrey',
  'Swansea',
  'Torfaen',
  'Tyne and Wear',
  'Tyrone',
  'Vale of Glamorgan',
  'Warwickshire',
  'West Berkshire',
  'West Dunbartonshire',
  'West Lothian',
  'West Midlands',
  'West Sussex',
  'West Yorkshire',
  'Wiltshire',
  'Worcestershire',
  'Wrexham'
];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function countyLane(area, index) {
  const priorityAreas = new Map([
    ['County Durham', 94],
    ['Tyne and Wear', 93],
    ['Northumberland', 92],
    ['Cumbria', 91],
    ['South Yorkshire', 90],
    ['Dorset', 89],
    ['Buckinghamshire', 88]
  ]);
  return {
    id: `county-${slugify(area)}`,
    title: `${area} local trader opportunities`,
    category: 'food',
    priority: priorityAreas.get(area) || 40 - Math.floor(index / 10),
    area,
    lane_type: 'county',
    queries: [
      `${area} food festival trader application 2026`,
      `${area} street food trader application 2026`,
      `${area} council street trading food vendor application`,
      `${area} market stallholder application food vendor 2026`,
      `${area} event trader application food vendor 2026`,
      `${area} mobile catering pitch application 2026`
    ]
  };
}

const COUNTY_LANES = COUNTY_AREAS.map(countyLane);
const IRELAND_REGION_LANES = IRELAND_REGION_GROUPS.map(irelandRegionLane);
const IRELAND_LANES = [...IRELAND_ROUTE_LANES, ...IRELAND_REGION_LANES];
// PitchListUK is a UK product. Republic-of-Ireland lanes remain exported only so
// historical reports can be interpreted, but they are deliberately excluded
// from every selectable/scheduled lane set.
const LANES = [...CORE_LANES, ...FIRST_PARTY_WEAK_REGION_LANES, ...EXPANSION_LANES, ...COUNTY_LANES];

function allLaneIds() {
  return LANES.map(lane => lane.id);
}

function findLane(id) {
  return LANES.find(lane => lane.id === id);
}

function selectLanes(ids = [], maxLanes = LANES.length) {
  const requested = ids.length ? ids.map(id => {
    const lane = findLane(id);
    if (!lane) throw new Error(`Unknown growth lane: ${id}`);
    return lane;
  }) : [...LANES].sort((a, b) => b.priority - a.priority);
  return requested.slice(0, Math.max(1, Number(maxLanes) || LANES.length));
}

module.exports = {
  LANES,
  CORE_LANES,
  EXPANSION_LANES,
  FIRST_PARTY_WEAK_REGION_LANES,
  IRELAND_REGION_GROUPS,
  IRELAND_ROUTE_LANES,
  IRELAND_REGION_LANES,
  IRELAND_LANES,
  COUNTY_AREAS,
  COUNTY_LANES,
  allLaneIds,
  findLane,
  selectLanes
};
