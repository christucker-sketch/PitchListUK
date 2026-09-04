const SNAPSHOTS = Object.freeze({
  US: 'functions/_data/us-opportunities.mjs',
  UK: 'functions/_data/opportunities.mjs'
});

export function normalizeAcquisitionCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  if (country === 'GB') return 'UK';
  if (country === 'USA') return 'US';
  if (country !== 'US' && country !== 'UK') throw new Error(`Unsupported acquisition country: ${country || '(blank)'}`);
  return country;
}

export function acquisitionSnapshotPath(country) {
  return SNAPSHOTS[normalizeAcquisitionCountry(country)];
}

export function buildAcquisitionContext(country, unit = {}) {
  const normalizedCountry = normalizeAcquisitionCountry(country);
  const code = String(unit.code || '').trim();
  const name = String(unit.name || '').trim();
  if (!code || !name) throw new Error('Acquisition unit requires code and name');

  return Object.freeze({
    country: normalizedCountry,
    unit_code: code,
    unit_name: name,
    jurisdiction: String(unit.jurisdiction || code),
    schedule_order: Number(unit.schedule_order || 0),
    snapshot_path: acquisitionSnapshotPath(normalizedCountry),
    geography_kind: normalizedCountry === 'US' ? 'state' : 'acquisition_area'
  });
}

export function compareAcquisitionUnits(a, b) {
  return Number(a?.schedule_order || 0) - Number(b?.schedule_order || 0)
    || String(a?.code || '').localeCompare(String(b?.code || ''));
}
