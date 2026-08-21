const AREA_MAP = [
  ['Greater Manchester', ['greater manchester','manchester','salford','bolton','bury','rochdale','stockport','oldham','trafford','wigan']],
  ['London', ['london','hammersmith','fulham','camden','croydon','islington','hackney','southwark','westminster','greenwich']],
  ['Ireland - Dublin', ['dublin','dun laoghaire','dún laoghaire','fingal','south dublin']],
  ['Ireland - Eastern', ['kildare','louth','meath','wicklow']],
  ['Ireland - Midland', ['laois','longford','offaly','westmeath']],
  ['Ireland - Border', ['cavan','donegal','leitrim','monaghan','sligo']],
  ['Ireland - West', ['galway','mayo','roscommon']],
  ['Ireland - Mid-West', ['clare','limerick','tipperary']],
  ['Ireland - South-East', ['carlow','kilkenny','waterford','wexford']],
  ['Ireland - South-West', ['cork','kerry']],
  ['Northern Ireland', ['northern ireland','belfast','antrim','armagh','down','fermanagh','tyrone','londonderry','derry','lisburn','newry','enniskillen']],
  ['Bristol', ['bristol']],
  ['Cheshire', ['cheshire','northwich','knutsford','arley hall']],
  ['South Yorkshire', ['south yorkshire','sheffield','doncaster','barnsley','rotherham']],
  ['West Yorkshire', ['west yorkshire','leeds','harewood','yorkshire','ilkley','harrogate']],
  ['Oxfordshire', ['oxfordshire','oxford']],
  ['West Sussex', ['west sussex','horsham','chichester','worthing','wealddown','weald and downland']],
  ['Buckinghamshire', ['buckinghamshire','marlow','aylesbury','milton keynes']],
  ['Gloucestershire', ['gloucestershire','cotswold','cheltenham','gloucester']],
  ['Merseyside', ['merseyside','liverpool','wirral']],
  ['Staffordshire', ['staffordshire','stoke-on-trent','trentham','lichfield']],
  ['Somerset', ['somerset','bath','bathnes']],
  ['Devon', ['devon','exeter','plymouth','loddiswell']],
  ['Cornwall', ['cornwall','truro','st ives','porthleven','falmouth']],
  ['Dorset', ['dorset','bournemouth','poole','christchurch']],
  ['Kent', ['kent','broadstairs']],
  ['Norfolk', ['norfolk']],
  ['Suffolk', ['suffolk','ipswich','bury st edmunds','newmarket']],
  ['East Sussex', ['east sussex','brighton','lewes','eastbourne']],
  ['Monmouthshire', ['monmouthshire','abergavenny','chepstow','big love festival']],
  ['Hampshire', ['hampshire']],
  ['Surrey', ['surrey']],
  ['Essex', ['essex']],
  ['Lancashire', ['lancashire','preston','blackpool']],
  ['Tyne and Wear', ['tyne and wear','newcastle','sunderland']],
  ['County Durham', ['county durham','billingham','darlington','durham']],
  ['Cumbria', ['cumbria','cumberland','westmorland','carlisle','keswick']],
  ['Northumberland', ['northumberland','alnwick','berwick']],
  ['Cambridgeshire', ['cambridgeshire','cambridge','strawberry fair','cambridge folk festival']],
  ['Bedfordshire', ['bedfordshire','bedford']],
  ['Hertfordshire', ['hertfordshire','box moor','hemel hempstead','st albans']],
  ['Berkshire', ['berkshire','reading','windsor']],
  ['Wiltshire', ['wiltshire','salisbury']],
  ['Scotland', ['scotland','edinburgh','glasgow','summerhall','knockengorroch']],
  ['Angus', ['angus']],
  ['Argyll and Bute', ['dunoon','argyll','bute']],
  ['Wales', ['wales','welsh','caerphilly','neath','newtown','powys','anglesey','ceredigion']],
  ['West Midlands', ['west midlands','birmingham','coventry','wolverhampton']],
  ['Warwickshire', ['warwickshire','solsticefest']],
  ['Lincolnshire', ['lincolnshire','equinox festival']],
];

const NEIGHBOURS = {
  'Greater Manchester': ['Cheshire','Lancashire','Merseyside','South Yorkshire','West Yorkshire','Staffordshire'],
  'Cheshire': ['Greater Manchester','Merseyside','Staffordshire','Shropshire','Derbyshire'],
  'South Yorkshire': ['West Yorkshire','Greater Manchester','Derbyshire','Nottinghamshire','Lincolnshire'],
  'West Yorkshire': ['South Yorkshire','Greater Manchester','Lancashire','North Yorkshire'],
  'London': ['Surrey','Kent','Essex','Hertfordshire','Buckinghamshire'],
  'Bristol': ['Somerset','Gloucestershire','Wiltshire','Devon'],
  'Gloucestershire': ['Bristol','Somerset','Oxfordshire','Worcestershire','Herefordshire'],
  'Oxfordshire': ['Buckinghamshire','Gloucestershire','Berkshire','Warwickshire'],
  'Buckinghamshire': ['Oxfordshire','London','Hertfordshire','Berkshire'],
  'West Sussex': ['Surrey','Hampshire','East Sussex','London'],
  'Merseyside': ['Cheshire','Greater Manchester','Lancashire'],
  'Staffordshire': ['Cheshire','Greater Manchester','West Midlands','Derbyshire'],
  'Kent': ['London','Essex','East Sussex','Surrey'],
  'Somerset': ['Bristol','Devon','Dorset','Gloucestershire','Wiltshire'],
  'Ireland - Dublin': ['Ireland - Eastern'],
  'Ireland - Eastern': ['Ireland - Dublin','Ireland - Midland','Ireland - South-East','Ireland - Border'],
  'Ireland - Midland': ['Ireland - Eastern','Ireland - Border','Ireland - West','Ireland - Mid-West'],
  'Ireland - Border': ['Ireland - West','Ireland - Midland','Northern Ireland'],
  'Ireland - West': ['Ireland - Border','Ireland - Midland','Ireland - Mid-West'],
  'Ireland - Mid-West': ['Ireland - West','Ireland - Midland','Ireland - South-East','Ireland - South-West'],
  'Ireland - South-East': ['Ireland - Eastern','Ireland - Midland','Ireland - Mid-West','Ireland - South-West'],
  'Ireland - South-West': ['Ireland - Mid-West','Ireland - South-East'],
};

function inferKnownCounty(...values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  for (const [county, needles] of AREA_MAP) {
    if (needles.some(n => n && !n.includes('?') && text.includes(n))) return county;
  }
  return 'Unknown';
}

function normaliseCounty(...values) {
  const known = inferKnownCounty(...values);
  if (known !== 'Unknown') return known;
  const first = values.find(Boolean);
  return first ? String(first).split('/')[0].trim() : 'Unknown';
}

function matchScore(prospectCounty, eventCounty) {
  if (!prospectCounty || !eventCounty || prospectCounty === 'Unknown' || eventCounty === 'Unknown') return 0;
  if (prospectCounty === eventCounty) return 3;
  if ((NEIGHBOURS[prospectCounty] || []).includes(eventCounty)) return 2;
  return 0;
}

function matchLabel(score) {
  if (score >= 3) return 'same county/base area';
  if (score === 2) return 'nearby county/region';
  return 'not local match';
}

module.exports = { inferKnownCounty, normaliseCounty, matchScore, matchLabel, NEIGHBOURS };
