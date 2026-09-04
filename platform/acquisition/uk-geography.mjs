const area = (code, name, nation, order, aliases = []) => Object.freeze({
  code, name, nation, enabled: true, schedule_order: order,
  aliases: Object.freeze([name, ...aliases])
});

export const UK_ACQUISITION_AREAS = Object.freeze([
  area('GB-ENG-BEDS','Bedfordshire','England',10,['Beds']),
  area('GB-ENG-BERKS','Berkshire','England',20,['Berks']),
  area('GB-ENG-BRISTOL','Bristol','England',30,['City of Bristol']),
  area('GB-ENG-BUCKS','Buckinghamshire','England',40,['Bucks']),
  area('GB-ENG-CAMBS','Cambridgeshire','England',50,['Cambs']),
  area('GB-ENG-CHESH','Cheshire','England',60,['Cheshire East','Cheshire West and Chester']),
  area('GB-ENG-CORN','Cornwall','England',70,['Cornwall and Isles of Scilly','Isles of Scilly']),
  area('GB-ENG-CUMB','Cumbria','England',80,['Cumberland','Westmorland and Furness']),
  area('GB-ENG-DERBS','Derbyshire','England',90,['Derbys']),
  area('GB-ENG-DEVON','Devon','England',100),
  area('GB-ENG-DORSET','Dorset','England',110),
  area('GB-ENG-DURHAM','County Durham','England',120,['Durham']),
  area('GB-ENG-EAST-SUSSEX','East Sussex','England',130),
  area('GB-ENG-ESSEX','Essex','England',140),
  area('GB-ENG-GLOS','Gloucestershire','England',150,['Glos']),
  area('GB-ENG-GM','Greater Manchester','England',160,['Manchester']),
  area('GB-ENG-HANTS','Hampshire','England',170,['Hants']),
  area('GB-ENG-HERTS','Hertfordshire','England',180,['Herts']),
  area('GB-ENG-HUMBER','East Riding of Yorkshire','England',190,['East Yorkshire','Humberside']),
  area('GB-ENG-IOW','Isle of Wight','England',200),
  area('GB-ENG-KENT','Kent','England',210),
  area('GB-ENG-LANCS','Lancashire','England',220,['Lancs']),
  area('GB-ENG-LEICS','Leicestershire','England',230,['Leics']),
  area('GB-ENG-LINCS','Lincolnshire','England',240,['Lincs']),
  area('GB-ENG-LONDON','London','England',250,['Greater London']),
  area('GB-ENG-MERSEY','Merseyside','England',260,['Liverpool']),
  area('GB-ENG-NORF','Norfolk','England',270),
  area('GB-ENG-NHANTS','Northamptonshire','England',280,['Northants']),
  area('GB-ENG-NORTHUM','Northumberland','England',290),
  area('GB-ENG-NOTTS','Nottinghamshire','England',300,['Notts']),
  area('GB-ENG-OXON','Oxfordshire','England',310,['Oxon']),
  area('GB-ENG-RUTLAND','Rutland','England',320),
  area('GB-ENG-SALOP','Shropshire','England',330,['Salop']),
  area('GB-ENG-SOM','Somerset','England',340),
  area('GB-ENG-SOUTH-YORKS','South Yorkshire','England',350,['Sheffield']),
  area('GB-ENG-STAFFS','Staffordshire','England',360,['Staffs']),
  area('GB-ENG-SUFF','Suffolk','England',370),
  area('GB-ENG-SURREY','Surrey','England',380),
  area('GB-ENG-TYNE','Tyne and Wear','England',390,['Tyneside','Newcastle upon Tyne']),
  area('GB-ENG-WARW','Warwickshire','England',400,['Warks']),
  area('GB-ENG-WEST-MIDS','West Midlands','England',410,['Birmingham']),
  area('GB-ENG-WEST-SUSSEX','West Sussex','England',420),
  area('GB-ENG-WEST-YORKS','West Yorkshire','England',430,['Leeds','Bradford']),
  area('GB-ENG-WILTS','Wiltshire','England',440,['Wilts']),
  area('GB-ENG-WORCS','Worcestershire','England',450,['Worcs']),
  area('GB-SCT','Scotland','Scotland',460,['Scottish']),
  area('GB-WLS','Wales','Wales',470,['Cymru']),
  area('GB-NIR','Northern Ireland','Northern Ireland',480,['NI','N. Ireland'])
]);

const normalise = value => String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const aliasIndex = new Map();
for (const item of UK_ACQUISITION_AREAS) for (const alias of item.aliases) aliasIndex.set(normalise(alias), item);

const broadReviewTerms = new Set([
  'united kingdom','uk','england','great britain','britain','south east','south west','east of england',
  'north east','north west','east midlands','west midlands region','yorkshire','yorkshire and the humber','nationwide','multiple locations'
]);

function containsPhrase(haystack, phrase) {
  const haystackTokens = normalise(haystack).split(' ').filter(Boolean);
  const phraseTokens = normalise(phrase).split(' ').filter(Boolean);
  if (!phraseTokens.length || phraseTokens.length > haystackTokens.length) return false;
  return haystackTokens.some((_, index) => phraseTokens.every((token, offset) => haystackTokens[index + offset] === token));
}

export function enabledUkAcquisitionAreas() {
  return UK_ACQUISITION_AREAS.filter(item => item.enabled).sort((a,b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code));
}

export function resolveUkAcquisitionArea(row = {}) {
  const candidates = [row.county, row.region, row.location].filter(Boolean);
  for (const candidate of candidates) {
    const key = normalise(candidate);
    if (aliasIndex.has(key)) return { status: 'mapped', area: aliasIndex.get(key), matched_value: candidate };
  }

  const broad = candidates.find(value => broadReviewTerms.has(normalise(value)));
  if (broad) {
    return {
      status: 'review', area: null,
      reason: 'broad_geography_requires_review',
      matched_value: broad
    };
  }

  const combined = normalise(candidates.join(' '));
  const contained = enabledUkAcquisitionAreas().filter(item => item.aliases.some(alias => containsPhrase(combined, alias)));
  if (contained.length === 1) return { status: 'mapped', area: contained[0], matched_value: candidates.join(' | '), inferred: true };

  return {
    status: 'review', area: null,
    reason: contained.length > 1 ? 'ambiguous_geography' : 'unmapped_geography',
    matched_value: candidates.join(' | ') || null
  };
}
