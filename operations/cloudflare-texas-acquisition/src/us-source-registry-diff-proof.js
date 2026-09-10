function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function indexSources(registry, label) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new Error(`source_registry_${label}_invalid`);
  if (!Array.isArray(registry.sources)) throw new Error(`source_registry_${label}_sources_invalid`);
  const map = new Map();
  for (const source of registry.sources) {
    const id = String(source?.id || '').trim();
    if (!id) throw new Error(`source_registry_${label}_id_missing`);
    if (map.has(id)) throw new Error(`source_registry_${label}_duplicate_id:${id}`);
    map.set(id, source);
  }
  return map;
}

export function proveUsSourceRegistryAdditionsOnly(baseRegistry, headRegistry) {
  const base = indexSources(baseRegistry, 'base');
  const head = indexSources(headRegistry, 'head');

  const baseEnvelope = { ...baseRegistry };
  const headEnvelope = { ...headRegistry };
  delete baseEnvelope.sources;
  delete headEnvelope.sources;
  delete baseEnvelope.updated_at;
  delete headEnvelope.updated_at;
  if (stableJson(baseEnvelope) !== stableJson(headEnvelope)) throw new Error('source_registry_envelope_changed');

  for (const [id, source] of base) {
    if (!head.has(id)) throw new Error(`source_registry_source_removed:${id}`);
    if (stableJson(source) !== stableJson(head.get(id))) throw new Error(`source_registry_source_modified:${id}`);
  }

  const addedIds = [...head.keys()].filter(id => !base.has(id)).sort();
  if (!addedIds.length) throw new Error('source_registry_no_additions');

  return Object.freeze({
    additions_only: true,
    base_count: base.size,
    head_count: head.size,
    added_count: addedIds.length,
    added_ids: Object.freeze(addedIds)
  });
}
