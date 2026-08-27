export function assertCountryCode(value, expectedCountryCode, label = 'record') {
  const actual = String(value || '').trim().toUpperCase();
  const expected = String(expectedCountryCode || '').trim().toUpperCase();

  if (!expected) {
    throw new Error('Expected country code is required');
  }

  if (actual !== expected) {
    throw new Error(`${label} must declare country_code=${expected}`);
  }

  return true;
}

export function assertJurisdictionPrefix(value, prefix, label = 'record') {
  if (value == null || value === '') return true;
  if (!String(value).startsWith(prefix)) {
    throw new Error(`${label} jurisdiction must begin with ${prefix}`);
  }
  return true;
}

export function assertCountryScopedRows(rows, {
  countryCode,
  jurisdictionPrefix = null,
} = {}) {
  if (!Array.isArray(rows)) {
    throw new Error('Country-scoped rows must be an array');
  }

  rows.forEach((row, index) => {
    const label = `row[${index}]`;
    assertCountryCode(row?.country_code, countryCode, label);
    if (jurisdictionPrefix) {
      assertJurisdictionPrefix(row?.jurisdiction, jurisdictionPrefix, label);
    }
  });

  return true;
}

export function assertCountryScopedManifest(manifest, {
  countryCode,
  jurisdictionPrefix = null,
  requireAdditionOnly = false,
} = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Country-scoped manifest must be an object');
  }

  assertCountryCode(manifest.country_code, countryCode, 'manifest');

  if (requireAdditionOnly && manifest.mode !== 'addition-only') {
    throw new Error('Country-scoped manifest must be addition-only');
  }

  assertCountryScopedRows(manifest.rows || [], {
    countryCode,
    jurisdictionPrefix,
  });

  return true;
}
