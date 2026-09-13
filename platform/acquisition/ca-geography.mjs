const unit = (code, name, kind, order, aliases = []) => Object.freeze({
  code,
  name,
  kind,
  enabled: true,
  schedule_order: order,
  jurisdiction: `CA-${code}`,
  aliases: Object.freeze([name, code, ...aliases])
});

export const CA_ACQUISITION_UNITS = Object.freeze([
  unit('AB', 'Alberta', 'province', 10),
  unit('BC', 'British Columbia', 'province', 20, ['B.C.']),
  unit('MB', 'Manitoba', 'province', 30),
  unit('NB', 'New Brunswick', 'province', 40, ['N.B.']),
  unit('NL', 'Newfoundland and Labrador', 'province', 50, ['Newfoundland & Labrador', 'Newfoundland', 'Labrador', 'N.L.']),
  unit('NS', 'Nova Scotia', 'province', 60, ['N.S.']),
  unit('ON', 'Ontario', 'province', 70),
  unit('PE', 'Prince Edward Island', 'province', 80, ['PEI', 'P.E.I.', 'P.E.']),
  unit('QC', 'Quebec', 'province', 90, ['Québec', 'PQ', 'P.Q.']),
  unit('SK', 'Saskatchewan', 'province', 100),
  unit('NT', 'Northwest Territories', 'territory', 110, ['NWT', 'N.W.T.']),
  unit('NU', 'Nunavut', 'territory', 120),
  unit('YT', 'Yukon', 'territory', 130, ['Yukon Territory'])
]);

const normalise = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const aliasIndex = new Map();
for (const item of CA_ACQUISITION_UNITS) {
  for (const alias of item.aliases) aliasIndex.set(normalise(alias), item);
  aliasIndex.set(normalise(item.jurisdiction), item);
}

const broadReviewTerms = new Set([
  'canada', 'canadian', 'nationwide', 'national', 'multiple locations', 'various locations',
  'western canada', 'eastern canada', 'atlantic canada', 'prairies', 'northern canada'
]);

function containsPhrase(haystack, phrase) {
  const haystackTokens = normalise(haystack).split(' ').filter(Boolean);
  const phraseTokens = normalise(phrase).split(' ').filter(Boolean);
  if (!phraseTokens.length || phraseTokens.length > haystackTokens.length) return false;
  return haystackTokens.some((_, index) => phraseTokens.every((token, offset) => haystackTokens[index + offset] === token));
}

export function enabledCaAcquisitionUnits() {
  return CA_ACQUISITION_UNITS
    .filter(item => item.enabled)
    .sort((a, b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code));
}

export function getCaAcquisitionUnit(code) {
  const key = String(code || '').trim().toUpperCase().replace(/^CA-/, '');
  return CA_ACQUISITION_UNITS.find(item => item.code === key) || null;
}

export function resolveCaAcquisitionUnit(row = {}) {
  const candidates = [
    row.region_code,
    row.province_code,
    row.province,
    row.territory,
    row.region,
    row.location
  ].filter(Boolean);

  for (const candidate of candidates) {
    const key = normalise(candidate);
    if (aliasIndex.has(key)) return { status: 'mapped', unit: aliasIndex.get(key), matched_value: candidate };
  }

  const broad = candidates.find(value => broadReviewTerms.has(normalise(value)));
  if (broad) {
    return {
      status: 'review',
      unit: null,
      reason: 'broad_geography_requires_review',
      matched_value: broad
    };
  }

  const combined = normalise(candidates.join(' '));
  const contained = enabledCaAcquisitionUnits().filter(item => item.aliases.some(alias => containsPhrase(combined, alias)));
  if (contained.length === 1) {
    return { status: 'mapped', unit: contained[0], matched_value: candidates.join(' | '), inferred: true };
  }

  return {
    status: 'review',
    unit: null,
    reason: contained.length > 1 ? 'ambiguous_geography' : 'unmapped_geography',
    matched_value: candidates.join(' | ') || null
  };
}
