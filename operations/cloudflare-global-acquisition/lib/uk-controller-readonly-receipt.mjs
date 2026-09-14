function safeDecision(state = {}) {
  const intent = state.cloud_controller_intent;
  if (intent?.phase === 'reserved') {
    if (intent.action === 'start_discovery') return { action: 'bind_reserved_discovery', workflow_id: intent.workflow_id || null };
    if (intent.action === 'start_acquisition') return { action: 'bind_reserved_acquisition', workflow_id: intent.workflow_id || null };
    if (intent.action === 'merge_source_pr') return { action: 'merge_reserved_source_pr', pr_number: Number(intent.pr_number || 0) || null };
    if (intent.action === 'merge_data_pr') return { action: 'merge_reserved_data_pr', pr_number: Number(intent.pr_number || 0) || null };
  }
  if (state.active_instance?.id) return { action: 'inspect_active_workflow', workflow_id: state.active_instance.id, mode: state.active_instance.mode || null };
  if (state.status === 'ready_discovery') return { action: 'start_discovery', query_offset: Number(state.query_offset || 0), query_limit: Number(state.query_limit || 4), cycle: Number(state.cycle || 0) };
  if (state.status === 'reviewing_source_pr') return { action: 'review_source_pr', pr_number: Number(state.pending_source_pr?.pr_number || 0) || null };
  if (state.status === 'waiting_source_deploy') return { action: 'verify_source_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'ready_acquisition') return { action: 'start_acquisition', cycle: Number(state.cycle || 0) };
  if (state.status === 'reviewing_data_pr') return { action: 'review_data_pr', pr_number: Number(state.pending_data_pr?.pr_number || 0) || null };
  if (state.status === 'waiting_frontend_deploy') return { action: 'verify_frontend_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'blocked') return { action: 'blocked', reason: state.blocker || 'unknown' };
  return { action: 'unknown', status: state.status || 'unknown' };
}

function compactPending(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    pr_number: Number(value.pr_number || 0) || null,
    workflow_id: value.workflow_id || null,
    merge_sha: value.merge_sha || null,
    expected_production_count: Number.isInteger(Number(value.expected_production_count)) ? Number(value.expected_production_count) : null,
    expected_source_count: Number.isInteger(Number(value.expected_source_count)) ? Number(value.expected_source_count) : null
  });
}

export async function readUkControllerReadonlyReceipt(env = {}) {
  if (!env?.UK_CONTROLLER_STATE) return Object.freeze({ available: false, reason: 'uk_controller_state_binding_missing' });
  const stub = env.UK_CONTROLLER_STATE.get(env.UK_CONTROLLER_STATE.idFromName('uk-controller'));
  const response = await stub.fetch('https://uk-controller-state.internal/snapshot');
  if (!response.ok) return Object.freeze({ available: false, reason: `uk_controller_state_http_${response.status}` });

  let state;
  try { state = JSON.parse(await response.text()); }
  catch { return Object.freeze({ available: false, reason: 'uk_controller_state_invalid_json' }); }

  return Object.freeze({
    available: true,
    authority: response.headers.get('x-findpitches-state-authority') || 'unknown',
    state_version: Number(response.headers.get('x-findpitches-state-version') || 0) || null,
    state_sha256: response.headers.get('x-findpitches-state-sha256') || null,
    state_source: response.headers.get('x-findpitches-state-source') || null,
    state_imported_at: response.headers.get('x-findpitches-state-imported-at') || null,
    controller_kind: state.controller_kind || null,
    status: state.status || 'unknown',
    production_count: Number.isInteger(Number(state.production_count)) ? Number(state.production_count) : null,
    source_count: Number.isInteger(Number(state.source_count)) ? Number(state.source_count) : null,
    base_main_sha: state.base_main_sha || null,
    query_offset: Number.isInteger(Number(state.query_offset)) ? Number(state.query_offset) : null,
    query_limit: Number.isInteger(Number(state.query_limit)) ? Number(state.query_limit) : null,
    plan_size: Number.isInteger(Number(state.plan_size)) ? Number(state.plan_size) : null,
    cycle: Number.isInteger(Number(state.cycle)) ? Number(state.cycle) : null,
    active_instance: state.active_instance || null,
    cloud_controller_intent: state.cloud_controller_intent || null,
    pending_source_pr: compactPending(state.pending_source_pr),
    pending_data_pr: compactPending(state.pending_data_pr),
    pending_deployment: compactPending(state.pending_deployment),
    blocker: state.blocker || null,
    totals: state.totals || null,
    last_discovery: state.last_discovery ? {
      workflow_id: state.last_discovery.workflow_id || null,
      source_additions: Number(state.last_discovery.result?.source_additions || 0),
      source_pr_number: Number(state.last_discovery.result?.source_pr?.pr_number || 0) || null,
      generated_at: state.last_discovery.result?.generated_at || null
    } : null,
    last_acquisition: state.last_acquisition ? {
      workflow_id: state.last_acquisition.workflow_id || null,
      manifest_additions: Number(state.last_acquisition.result?.manifest_additions || 0),
      opportunity_pr_number: Number(state.last_acquisition.result?.opportunity_pr?.pr_number || 0) || null,
      production_count_before: Number(state.last_acquisition.result?.production_count_before || 0) || null,
      production_count_after_planned: Number(state.last_acquisition.result?.production_count_after_planned || 0) || null,
      generated_at: state.last_acquisition.result?.generated_at || null
    } : null,
    decision: safeDecision(state),
    updated_at: state.updated_at || null
  });
}

export { safeDecision as ukControllerReadonlyDecision };
