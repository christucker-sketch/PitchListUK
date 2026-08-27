export const US_SOURCE_REGISTRY = Object.freeze([]);

export function assertUsSourceRegistry(sources = US_SOURCE_REGISTRY) {
  if (!Array.isArray(sources)) {
    throw new Error('US source registry must be an array');
  }

  for (const source of sources) {
    if (source?.country_code !== 'US') {
      throw new Error('Every US source must declare country_code=US');
    }

    if (source?.jurisdiction && !String(source.jurisdiction).startsWith('US-')) {
      throw new Error('US source jurisdiction must begin with US-');
    }
  }

  return true;
}
