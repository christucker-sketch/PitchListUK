const LIVE_ROOT = 'https://findpitches.com';

function transientError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.liveConsistencyTransient = true;
  return error;
}

async function fetchLiveJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw transientError(`live_api_request_failed:${String(error?.message || error)}`, error);
  }
  if (!response?.ok) throw transientError(`live_api_http_${Number(response?.status || 0)}`);
  try {
    return await response.json();
  } catch (error) {
    throw transientError('live_api_invalid_json', error);
  }
}

export async function readLiveUsOpportunityConsistency(stateCode, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const code = String(stateCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error('live_consistency_state_code_invalid');
  const global = await fetchLiveJson(`${LIVE_ROOT}/api/us-customer-opportunities/search?limit=1`, fetchImpl);
  const count = Number(global?.total);
  if (!Number.isInteger(count) || count < 0) throw new Error('live_consistency_global_total_invalid');

  const ids = new Set();
  let offset = 0;
  let stateTotal = null;
  do {
    const page = await fetchLiveJson(`${LIVE_ROOT}/api/us-customer-opportunities/search?state=${encodeURIComponent(code)}&limit=250&offset=${offset}`, fetchImpl);
    const pageTotal = Number(page?.total);
    if (!Number.isInteger(pageTotal) || pageTotal < 0 || !Array.isArray(page?.rows)) throw new Error('live_consistency_state_response_invalid');
    if (stateTotal === null) stateTotal = pageTotal;
    if (pageTotal !== stateTotal) throw transientError('live_consistency_state_total_changed_during_read');
    for (const row of page.rows) {
      const id = String(row?.id || row?.stable_id || '').trim();
      if (id) ids.add(id);
    }
    offset += page.rows.length;
    if (page.rows.length === 0 && offset < stateTotal) throw transientError('live_consistency_state_pagination_ended_early');
    if (offset > count || offset > 5000) throw new Error('live_consistency_state_pagination_safe_bound_exceeded');
  } while (offset < stateTotal);

  return Object.freeze({ count, state_total: stateTotal ?? 0, ids });
}

export function classifyCloudLiveConsistency(pending, live) {
  const expected = Number(pending?.count);
  const previous = Number(pending?.previous_count);
  const additions = Number(pending?.additions);
  const opportunityIds = [...(Array.isArray(pending?.opportunity_ids) ? pending.opportunity_ids : [])].map(String).sort();
  if (!Number.isInteger(expected) || expected < 1 || !Number.isInteger(previous) || previous < 0 || !Number.isInteger(additions) || additions < 1 || previous + additions !== expected) {
    throw new Error('live_consistency_checkpoint_count_delta_invalid');
  }
  if (opportunityIds.length !== additions || opportunityIds.some(id => !id) || new Set(opportunityIds).size !== additions) {
    throw new Error('live_consistency_checkpoint_opportunity_ids_invalid');
  }
  const liveCount = Number(live?.count);
  if (!Number.isInteger(liveCount) || liveCount < 0) throw new Error('live_consistency_response_count_invalid');
  if (liveCount > expected) throw new Error(`live_consistency_count_exceeds_expected:${liveCount}:${expected}`);
  const liveIds = live?.ids instanceof Set ? live.ids : new Set(live?.ids || []);
  const missingIds = opportunityIds.filter(id => !liveIds.has(id));

  if (liveCount === expected) {
    if (missingIds.length) throw new Error(`live_consistency_missing_expected_identity:${missingIds[0]}`);
    return Object.freeze({ status: 'consistent', live_count: liveCount, missing_ids: [] });
  }

  if (liveCount !== previous || expected - liveCount !== additions) {
    throw new Error(`live_consistency_unexpected_partial_count:${liveCount}:${previous}:${expected}`);
  }
  const prematurelyVisible = opportunityIds.find(id => liveIds.has(id));
  if (prematurelyVisible) throw new Error(`live_consistency_partial_identity_visible:${prematurelyVisible}`);
  return Object.freeze({ status: 'waiting', live_count: liveCount, missing_ids: missingIds });
}

export function assertCloudLiveConsistencyWithinDeadline(waiting, pending, now = Date.now()) {
  const deadline = Date.parse(String(waiting?.deadline_at || ''));
  if (!Number.isFinite(deadline)) throw new Error('live_consistency_deadline_invalid');
  if (Number(now) < deadline) return true;
  const detail = waiting?.last_error || `count_${waiting?.last_live_count}_expected_${pending?.count}`;
  throw new Error(`live_consistency_timed_out:${detail}`);
}

export function recordCloudLiveConsistencyWait(state, consistency, now = new Date()) {
  if (state?.status !== 'waiting_for_live_consistency' || !state?.current?.pending_deploy || !state?.current?.live_consistency) {
    throw new Error('live_consistency_controller_state_invalid');
  }
  if (consistency?.status !== 'waiting') throw new Error('live_consistency_wait_result_invalid');
  const nextState = structuredClone(state);
  const waiting = nextState.current.live_consistency;
  waiting.attempts = Number(waiting.attempts || 0) + 1;
  waiting.last_checked_at = now.toISOString();
  waiting.last_live_count = Number(consistency.live_count);
  waiting.last_error = null;
  nextState.updated_at = now.toISOString();
  assertCloudLiveConsistencyWithinDeadline(waiting, nextState.current.pending_deploy, now.getTime());
  return nextState;
}

export function finishCloudLiveConsistency(state, consistency, now = new Date()) {
  if (state?.status !== 'waiting_for_live_consistency' || !state?.current?.pending_deploy || !state?.current?.live_consistency) {
    throw new Error('live_consistency_controller_state_invalid');
  }
  if (consistency?.status !== 'consistent') throw new Error('live_consistency_finish_result_invalid');
  const nextState = structuredClone(state);
  const pending = nextState.current.pending_deploy;
  const waiting = nextState.current.live_consistency;
  if (String(waiting.production_sha || '').toLowerCase() !== String(pending.sha || '').toLowerCase()) throw new Error('live_consistency_deployment_sha_mismatch');
  const liveCount = Number(consistency.live_count);
  if (liveCount !== Number(pending.count) || liveCount !== Number(nextState.snapshot_count)) throw new Error('live_consistency_final_count_mismatch');

  nextState.live_api_count = liveCount;
  nextState.deployments = Array.isArray(nextState.deployments) ? nextState.deployments : [];
  if (!nextState.deployments.some(item => item?.production_sha === waiting.production_sha)) {
    nextState.deployments.push({
      deployment_id: waiting.deployment_id,
      deployment_check_id: waiting.deployment_check_id,
      production_sha: waiting.production_sha,
      live_api_count: liveCount,
      state_code: nextState.current.state_code,
      additions: pending.additions,
      pr_number: pending.pr_number,
      deployed_at: now.toISOString()
    });
  }
  const milestones = [250, 500, 750, 1000, 1100];
  nextState.completed_milestones = Array.isArray(nextState.completed_milestones) ? nextState.completed_milestones : [];
  for (const milestone of milestones) if (Number(nextState.snapshot_count) >= milestone && !nextState.completed_milestones.includes(milestone)) nextState.completed_milestones.push(milestone);
  delete nextState.current.pending_deploy;
  delete nextState.current.live_consistency;
  nextState.acquisition_batch = Number(nextState.acquisition_batch || 1) + 1;
  nextState.status = 'ready_acquisition';
  nextState.updated_at = now.toISOString();
  return nextState;
}

export function recordCloudLiveConsistencyTransientFailure(state, error, now = new Date()) {
  if (!error?.liveConsistencyTransient) throw error;
  if (state?.status !== 'waiting_for_live_consistency' || !state?.current?.pending_deploy || !state?.current?.live_consistency) {
    throw new Error('live_consistency_controller_state_invalid');
  }
  const nextState = structuredClone(state);
  const waiting = nextState.current.live_consistency;
  waiting.attempts = Number(waiting.attempts || 0) + 1;
  waiting.last_checked_at = now.toISOString();
  waiting.last_error = String(error?.message || error);
  nextState.updated_at = now.toISOString();
  assertCloudLiveConsistencyWithinDeadline(waiting, nextState.current.pending_deploy, now.getTime());
  return nextState;
}
