const ALLOWED_KEYS = Object.freeze(['exported_at', 'source', 'total', 'rows']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function equal(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function normalizeSnapshot(input, side) {
  const snapshot = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error(`us_snapshot_${side}_invalid`);
  const keys = Object.keys(snapshot).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...ALLOWED_KEYS].sort())) throw new Error(`us_snapshot_${side}_envelope_invalid`);
  if (!Number.isInteger(snapshot.total) || snapshot.total < 0 || !Array.isArray(snapshot.rows) || snapshot.total !== snapshot.rows.length) {
    throw new Error(`us_snapshot_${side}_count_invalid`);
  }
  const ids = snapshot.rows.map(row => String(row?.stable_id || row?.id || '').trim());
  if (ids.some(id => !id)) throw new Error(`us_snapshot_${side}_identity_missing`);
  if (new Set(ids).size !== ids.length) throw new Error(`us_snapshot_${side}_duplicate_identity`);
  return { snapshot, ids };
}

export function proveUsOpportunitySnapshotAdditionsOnly(baseInput, headInput) {
  const base = normalizeSnapshot(baseInput, 'base');
  const head = normalizeSnapshot(headInput, 'head');
  if (head.snapshot.total <= base.snapshot.total) throw new Error('us_snapshot_no_additions');

  const baseById = new Map(base.snapshot.rows.map(row => [String(row?.stable_id || row?.id || '').trim(), row]));
  const headById = new Map(head.snapshot.rows.map(row => [String(row?.stable_id || row?.id || '').trim(), row]));
  for (const [id, row] of baseById) {
    if (!headById.has(id)) throw new Error(`us_snapshot_opportunity_removed:${id}`);
    if (!equal(row, headById.get(id))) throw new Error(`us_snapshot_opportunity_modified:${id}`);
  }

  const addedIds = [...headById.keys()].filter(id => !baseById.has(id)).sort();
  const addedCount = head.snapshot.total - base.snapshot.total;
  if (addedIds.length !== addedCount) throw new Error('us_snapshot_added_identity_delta_invalid');
  return Object.freeze({
    additions_only: true,
    base_count: base.snapshot.total,
    head_count: head.snapshot.total,
    added_count: addedCount,
    added_ids: addedIds
  });
}
