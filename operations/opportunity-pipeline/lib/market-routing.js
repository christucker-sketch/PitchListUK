const ROI_TERMS = /\b(republic of ireland|ireland -|dublin|cork|galway|limerick|waterford|kilkenny|kerry|mayo|donegal|sligo|wexford|kildare|meath|wicklow|tipperary|clare|cavan|leitrim|monaghan|roscommon|laois|longford|offaly|westmeath|carlow)\b/i;
const NI_TERMS = /\b(northern ireland|belfast|antrim|armagh|down|fermanagh|londonderry|derry|tyrone)\b/i;
const UK_AREA_TERMS = /\b(london|scotland|wales|north east|north west|yorkshire|midlands|west midlands|east midlands|east of england|south west|south east|manchester|liverpool|leeds|sheffield|birmingham|bristol|newcastle|nottingham|cardiff|glasgow|edinburgh|kent|surrey|sussex|devon|cornwall|norfolk|suffolk|essex|hampshire|cheshire|lancashire|cumbria|dorset|somerset|oxfordshire|cambridgeshire|lincolnshire|northumberland|buckinghamshire|berkshire|warwickshire|wiltshire|gloucestershire|hertfordshire|west sussex)\b/i;
const UK_HOST = /(\.gov\.uk$|\.org\.uk$|\.co\.uk$|\.ac\.uk$|\.uk$)/;

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function textFor(row) {
  return [
    row.country,
    row.jurisdiction,
    row.location,
    row.region,
    row.event_name,
    row.organiser,
    row.notes,
    row.source_url,
    row.application_url
  ].filter(Boolean).join(' ');
}

function inferMarket(row) {
  const locationText = [row.country, row.jurisdiction, row.location, row.region].filter(Boolean).join(' ');
  const identityText = [row.event_name, row.organiser].filter(Boolean).join(' ');
  const text = textFor(row);
  const sourceHost = host(row.source_url);
  const appHost = host(row.application_url);
  const ieHost = /(\.gov\.ie$|\.ie$)/.test(sourceHost) || /(\.gov\.ie$|\.ie$)/.test(appHost);
  const ukHost = UK_HOST.test(sourceHost) || UK_HOST.test(appHost);

  if (NI_TERMS.test(text)) {
    return {
      country: 'United Kingdom',
      jurisdiction: 'GB-NIR',
      currency: 'GBP',
      market_domain: 'pitchlist.uk',
      tax_region: 'UK'
    };
  }

  if (ukHost || (!ieHost && UK_AREA_TERMS.test(locationText))) {
    return {
      country: 'United Kingdom',
      jurisdiction: 'GB',
      currency: 'GBP',
      market_domain: 'pitchlist.uk',
      tax_region: 'UK'
    };
  }

  if (ieHost || ROI_TERMS.test(locationText) || ROI_TERMS.test(identityText)) {
    return {
      country: 'Ireland',
      jurisdiction: 'IE',
      currency: 'EUR',
      market_domain: 'pitchlist.ie',
      tax_region: 'EU'
    };
  }

  return {
    country: 'United Kingdom',
    jurisdiction: 'GB',
    currency: 'GBP',
    market_domain: 'pitchlist.uk',
    tax_region: 'UK'
  };
}

module.exports = {
  inferMarket
};
