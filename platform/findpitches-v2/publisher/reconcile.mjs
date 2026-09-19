export function reconcilePublicationResult(plan, {
  publishedIds = [],
  rejectedIds = [],
  heldIds = []
} = {}) {
  const plannedIds = new Set(Array.isArray(plan?.candidate_ids) ? plan.candidate_ids.map(String) : []);
  if (!plannedIds.size && Number(plan?.candidate_count || 0) !== 0) {
    throw new Error('findpitches_v2_reconcile_plan_invalid');
  }

  const published = normalizeSubset(publishedIds, plannedIds, 'published');
  const rejected = normalizeSubset(rejectedIds, plannedIds, 'rejected');
  const held = normalizeSubset(heldIds, plannedIds, 'held');

  assertDisjoint(published, rejected, 'published', 'rejected');
  assertDisjoint(published, held, 'published', 'held');
  assertDisjoint(rejected, held, 'rejected', 'held');

  const accounted = new Set([...published, ...rejected, ...held]);
  const remaining = [...plannedIds].filter(id => !accounted.has(id)).sort();

  return Object.freeze({
    market: String(plan?.market || '').toUpperCase(),
    planned_count: plannedIds.size,
    published_count: published.length,
    rejected_count: rejected.length,
    held_count: held.length,
    remaining_count: remaining.length,
    published_ids: Object.freeze(published),
    rejected_ids: Object.freeze(rejected),
    held_ids: Object.freeze(held),
    remaining_ids: Object.freeze(remaining),
    safe_reduction: published.length <= plannedIds.size
  });
}

export async function applyPublicationReconciliation(db, reconciliation, {
  now = new Date().toISOString()
} = {}) {
  if (!db?.prepare || typeof db.batch !== 'function') {
    throw new Error('findpitches_v2_reconcile_db_missing');
  }

  const statements = [];

  for (const id of reconciliation.published_ids || []) {
    statements.push(
      db.prepare(
        `UPDATE candidates
            SET status = 'published', last_checked = ?
          WHERE id = ? AND status IN ('validated', 'queued_for_publish')`
      ).bind(now, id)
    );
  }

  for (const id of reconciliation.rejected_ids || []) {
    statements.push(
      db.prepare(
        `UPDATE candidates
            SET status = 'rejected',
                rejection_reason = COALESCE(rejection_reason, 'operator_review_rejected'),
                last_checked = ?
          WHERE id = ? AND status IN ('validated', 'queued_for_publish')`
      ).bind(now, id)
    );
  }

  for (const id of reconciliation.held_ids || []) {
    statements.push(
      db.prepare(
        `UPDATE candidates
            SET status = 'held', last_checked = ?
          WHERE id = ? AND status IN ('validated', 'queued_for_publish')`
      ).bind(now, id)
    );
  }

  for (const id of reconciliation.remaining_ids || []) {
    statements.push(
      db.prepare(
        `UPDATE candidates
            SET status = 'validated', last_checked = ?
          WHERE id = ? AND status IN ('validated', 'queued_for_publish')`
      ).bind(now, id)
    );
  }

  if (statements.length) await db.batch(statements);

  return Object.freeze({
    applied: true,
    ...reconciliation
  });
}

function normalizeSubset(values, plannedIds, label) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).map(String))].sort();
  for (const id of normalized) {
    if (!plannedIds.has(id)) throw new Error(`findpitches_v2_reconcile_${label}_outside_plan:${id}`);
  }
  return normalized;
}

function assertDisjoint(left, right, leftLabel, rightLabel) {
  const other = new Set(right);
  const overlap = left.find(id => other.has(id));
  if (overlap) {
    throw new Error(`findpitches_v2_reconcile_overlap:${leftLabel}:${rightLabel}:${overlap}`);
  }
}
