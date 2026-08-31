const REQUIRED_SOURCE_FIELDS = Object.freeze([
  'id', 'name', 'organiser', 'source_url', 'application_url', 'source_class',
  'country_code', 'jurisdiction', 'region_code', 'locality', 'event_start',
  'event_end', 'status', 'evidence'
]);

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normaliseSource(source) {
  return {
    ...source,
    id: String(source?.id || '').trim().toLowerCase(),
    source_url: canonicalUrl(source?.source_url),
    application_url: canonicalUrl(source?.application_url),
    country_code: String(source?.country_code || '').trim().toUpperCase(),
    region_code: String(source?.region_code || '').trim().toUpperCase(),
    jurisdiction: String(source?.jurisdiction || '').trim().toUpperCase(),
    status: String(source?.status || '').trim()
  };
}

export function validateGrowthSource(source, options = {}) {
  const scoped = normaliseSource(source);
  const missing = REQUIRED_SOURCE_FIELDS.filter(field => !String(scoped[field] || '').trim());
  if (missing.length) throw new Error(`Growth source is missing required fields: ${missing.join(',')}`);
  if (!/^[a-z]{2}-[a-z0-9-]+$/.test(scoped.id)) throw new Error(`Growth source has invalid id: ${scoped.id}`);
  if (scoped.country_code !== 'US' || !/^[A-Z]{2}$/.test(scoped.region_code) || scoped.jurisdiction !== `US-${scoped.region_code}`) {
    throw new Error(`Growth source escaped US state boundary: ${scoped.id}`);
  }
  if (options.stateCode && scoped.region_code !== String(options.stateCode).toUpperCase()) {
    throw new Error(`Growth source escaped requested state: ${scoped.id}`);
  }
  if (scoped.status !== 'approved-pilot') throw new Error(`Growth source is not approved-pilot: ${scoped.id}`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(scoped.event_start) || !/^20\d{2}-\d{2}-\d{2}$/.test(scoped.event_end)) {
    throw new Error(`Growth source has invalid event dates: ${scoped.id}`);
  }
  if (scoped.event_end < scoped.event_start) throw new Error(`Growth source event range is reversed: ${scoped.id}`);
  return Object.freeze(scoped);
}

export function parseGrowthRegistry(input) {
  const registry = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (registry?.version !== 1 || !Array.isArray(registry.sources)) throw new Error('US growth source registry is invalid');
  const sources = registry.sources.map(source => validateGrowthSource(source));
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('US growth source registry has duplicate ids');
  const routes = sources.map(source => source.application_url);
  if (new Set(routes).size !== routes.length) throw new Error('US growth source registry has duplicate application routes');
  return { version: 1, updated_at: registry.updated_at || null, sources };
}

export function mergeGrowthSources(registry, additions, options = {}) {
  const current = parseGrowthRegistry(registry);
  const nextSources = [...current.sources];
  const ids = new Set(nextSources.map(source => source.id));
  const routes = new Set(nextSources.map(source => source.application_url));
  const added = [];
  const skipped = [];
  for (const raw of additions || []) {
    const source = validateGrowthSource(raw, options);
    if (ids.has(source.id) || routes.has(source.application_url)) {
      skipped.push({ id: source.id, reason: 'already_registered' });
      continue;
    }
    ids.add(source.id);
    routes.add(source.application_url);
    nextSources.push(source);
    added.push(source);
  }
  nextSources.sort((a, b) => a.region_code.localeCompare(b.region_code) || a.id.localeCompare(b.id));
  return {
    registry: { version: 1, updated_at: options.updatedAt || new Date().toISOString(), sources: nextSources },
    added,
    skipped
  };
}

export function sourcesForState(registry, stateCode, sourceIds = []) {
  const code = String(stateCode || '').toUpperCase();
  const selected = parseGrowthRegistry(registry).sources.filter(source => source.region_code === code);
  if (!sourceIds?.length) return selected;
  const wanted = new Set(sourceIds.map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
  const matched = selected.filter(source => wanted.has(source.id));
  if (matched.length !== wanted.size) throw new Error(`Requested growth source ids are missing for ${code}`);
  return matched;
}
