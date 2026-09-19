export function normalizeGeography(value = {}) {
  const countryCode = String(value.country_code || value.countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('findpitches_v2_geography_country_code_invalid');

  const geography = {
    country_code: countryCode,
    country: stringOrNull(value.country),
    region_code: upperOrNull(value.region_code ?? value.regionCode),
    region: stringOrNull(value.region),
    subregion: stringOrNull(value.subregion),
    locality: stringOrNull(value.locality),
    postal_code: upperOrNull(value.postal_code ?? value.postalCode),
    latitude: numberOrNull(value.latitude),
    longitude: numberOrNull(value.longitude)
  };

  if (geography.latitude != null && (geography.latitude < -90 || geography.latitude > 90)) {
    throw new Error('findpitches_v2_geography_latitude_invalid');
  }
  if (geography.longitude != null && (geography.longitude < -180 || geography.longitude > 180)) {
    throw new Error('findpitches_v2_geography_longitude_invalid');
  }

  return Object.freeze(geography);
}

function stringOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function upperOrNull(value) {
  const text = stringOrNull(value);
  return text ? text.toUpperCase() : null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('findpitches_v2_geography_coordinate_invalid');
  return number;
}
