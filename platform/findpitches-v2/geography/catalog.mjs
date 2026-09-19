const geography = (market, code, name, order, aliases = []) => Object.freeze({
  market,
  code,
  name,
  enabled: true,
  schedule_order: order,
  aliases: Object.freeze([name, ...aliases])
});

const GB = Object.freeze([
  geography('GB','GB-ENG-BEDS','Bedfordshire',10,['Beds']),
  geography('GB','GB-ENG-BERKS','Berkshire',20,['Berks']),
  geography('GB','GB-ENG-BRISTOL','Bristol',30,['City of Bristol']),
  geography('GB','GB-ENG-BUCKS','Buckinghamshire',40,['Bucks']),
  geography('GB','GB-ENG-CAMBS','Cambridgeshire',50,['Cambs']),
  geography('GB','GB-ENG-CHESH','Cheshire',60,['Cheshire East','Cheshire West and Chester']),
  geography('GB','GB-ENG-CORN','Cornwall',70,['Cornwall and Isles of Scilly','Isles of Scilly']),
  geography('GB','GB-ENG-CUMB','Cumbria',80,['Cumberland','Westmorland and Furness']),
  geography('GB','GB-ENG-DERBS','Derbyshire',90,['Derbys']),
  geography('GB','GB-ENG-DEVON','Devon',100),
  geography('GB','GB-ENG-DORSET','Dorset',110),
  geography('GB','GB-ENG-DURHAM','County Durham',120,['Durham']),
  geography('GB','GB-ENG-EAST-SUSSEX','East Sussex',130),
  geography('GB','GB-ENG-ESSEX','Essex',140),
  geography('GB','GB-ENG-GLOS','Gloucestershire',150,['Glos']),
  geography('GB','GB-ENG-GM','Greater Manchester',160,['Manchester']),
  geography('GB','GB-ENG-HANTS','Hampshire',170,['Hants']),
  geography('GB','GB-ENG-HERTS','Hertfordshire',180,['Herts']),
  geography('GB','GB-ENG-HUMBER','East Riding of Yorkshire',190,['East Yorkshire','Humberside']),
  geography('GB','GB-ENG-IOW','Isle of Wight',200),
  geography('GB','GB-ENG-KENT','Kent',210),
  geography('GB','GB-ENG-LANCS','Lancashire',220,['Lancs']),
  geography('GB','GB-ENG-LEICS','Leicestershire',230,['Leics']),
  geography('GB','GB-ENG-LINCS','Lincolnshire',240,['Lincs']),
  geography('GB','GB-ENG-LONDON','London',250,['Greater London']),
  geography('GB','GB-ENG-MERSEY','Merseyside',260,['Liverpool']),
  geography('GB','GB-ENG-NORF','Norfolk',270),
  geography('GB','GB-ENG-NHANTS','Northamptonshire',280,['Northants']),
  geography('GB','GB-ENG-NORTHUM','Northumberland',290),
  geography('GB','GB-ENG-NOTTS','Nottinghamshire',300,['Notts']),
  geography('GB','GB-ENG-OXON','Oxfordshire',310,['Oxon']),
  geography('GB','GB-ENG-RUTLAND','Rutland',320),
  geography('GB','GB-ENG-SALOP','Shropshire',330,['Salop']),
  geography('GB','GB-ENG-SOM','Somerset',340),
  geography('GB','GB-ENG-SOUTH-YORKS','South Yorkshire',350,['Sheffield']),
  geography('GB','GB-ENG-STAFFS','Staffordshire',360,['Staffs']),
  geography('GB','GB-ENG-SUFF','Suffolk',370),
  geography('GB','GB-ENG-SURREY','Surrey',380),
  geography('GB','GB-ENG-TYNE','Tyne and Wear',390,['Tyneside','Newcastle upon Tyne']),
  geography('GB','GB-ENG-WARW','Warwickshire',400,['Warks']),
  geography('GB','GB-ENG-WEST-MIDS','West Midlands',410,['Birmingham']),
  geography('GB','GB-ENG-WEST-SUSSEX','West Sussex',420),
  geography('GB','GB-ENG-WEST-YORKS','West Yorkshire',430,['Leeds','Bradford']),
  geography('GB','GB-ENG-WILTS','Wiltshire',440,['Wilts']),
  geography('GB','GB-ENG-WORCS','Worcestershire',450,['Worcs']),
  geography('GB','GB-SCT','Scotland',460,['Scottish']),
  geography('GB','GB-WLS','Wales',470,['Cymru']),
  geography('GB','GB-NIR','Northern Ireland',480,['NI','N. Ireland'])
]);

const US = Object.freeze([
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
].map(([code, name], index) => geography('US', code, name, (index + 1) * 10)));

const CA = Object.freeze([
  geography('CA','AB','Alberta',10),
  geography('CA','BC','British Columbia',20),
  geography('CA','MB','Manitoba',30),
  geography('CA','NB','New Brunswick',40),
  geography('CA','NL','Newfoundland and Labrador',50,['Newfoundland']),
  geography('CA','NS','Nova Scotia',60),
  geography('CA','ON','Ontario',70),
  geography('CA','PE','Prince Edward Island',80,['PEI']),
  geography('CA','QC','Quebec',90,['Québec']),
  geography('CA','SK','Saskatchewan',100),
  geography('CA','NT','Northwest Territories',110),
  geography('CA','NU','Nunavut',120),
  geography('CA','YT','Yukon',130)
]);

export const GEOGRAPHY_CATALOG_VERSION = '2026-09-19.1';

export const GEOGRAPHIES = Object.freeze({
  GB,
  US,
  CA
});

export function enabledGeographies(market) {
  const code = String(market || '').trim().toUpperCase();
  const items = GEOGRAPHIES[code];
  if (!items) throw new Error(`findpitches_v2_geography_market_unknown:${code || 'empty'}`);
  return items.filter(item => item.enabled).sort((a, b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code));
}

export function allEnabledGeographies() {
  return Object.freeze(
    Object.keys(GEOGRAPHIES)
      .sort()
      .flatMap(code => enabledGeographies(code))
  );
}
