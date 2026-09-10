function positiveInteger(value, error) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(error);
  return number;
}

function sha40(value, error) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(error);
  return sha;
}

export function validatePendingProductionDeployment(state, decision, deployment) {
  if (!state?.current || state.status !== 'deploying_production') throw new Error('production_deploy_controller_state_invalid');
  const pending = state.current.pending_deploy;
  if (!pending || typeof pending !== 'object') throw new Error('production_deploy_checkpoint_missing');
  const stateCode = String(state.current.state_code || '').trim().toUpperCase();
  if (!stateCode || String(decision?.state_code || '').trim().toUpperCase() !== stateCode) throw new Error('production_deploy_state_mismatch');
  const prNumber = positiveInteger(pending.pr_number, 'production_deploy_pr_number_invalid');
  const pendingSha = sha40(pending.sha, 'production_deploy_sha_invalid');
  if (String(decision?.sha || '').trim().toLowerCase() !== pendingSha) throw new Error('production_deploy_decision_sha_mismatch');
  if (Number(deployment?.pr_number) !== prNumber) throw new Error('production_deploy_inspection_pr_mismatch');
  if (sha40(deployment?.merge_sha, 'production_deploy_inspection_sha_invalid') !== pendingSha) throw new Error('production_deploy_inspection_sha_mismatch');

  const count = Number(pending.count);
  const previousCount = Number(pending.previous_count);
  const additions = Number(pending.additions);
  const ids = [...(Array.isArray(pending.opportunity_ids) ? pending.opportunity_ids : [])].map(String).sort();
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(previousCount) || previousCount < 0 || !Number.isInteger(additions) || additions < 1 || previousCount + additions !== count) {
    throw new Error('production_deploy_count_delta_invalid');
  }
  if (Number(state.snapshot_count) !== count) throw new Error('production_deploy_snapshot_count_mismatch');
  if (ids.length !== additions || ids.some(id => !id) || new Set(ids).size !== additions) throw new Error('production_deploy_opportunity_ids_invalid');
  return Object.freeze({ state_code: stateCode, pr_number: prNumber, merge_sha: pendingSha, count, previous_count: previousCount, additions, opportunity_ids: ids });
}

export function beginCloudLiveConsistency(state, validated, deploymentGate, now = new Date(), options = {}) {
  if (!deploymentGate?.ready || deploymentGate.status !== 'passed') throw new Error('production_deploy_gate_not_passed');
  const productionSha = sha40(deploymentGate.merge_sha, 'production_deploy_gate_sha_invalid');
  if (productionSha !== validated.merge_sha) throw new Error('production_deploy_gate_sha_mismatch');
  const deploymentCheckId = positiveInteger(deploymentGate.deployment_check_id, 'production_deploy_gate_check_id_invalid');
  const timeoutSeconds = Number(options.timeoutSeconds ?? 120);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 900) throw new Error('production_live_consistency_timeout_invalid');
  const started = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(started.getTime())) throw new Error('production_live_consistency_time_invalid');

  const nextState = structuredClone(state);
  nextState.current.live_consistency = {
    deployment_id: `github-check:${deploymentCheckId}`,
    deployment_check_id: deploymentCheckId,
    production_sha: productionSha,
    started_at: started.toISOString(),
    deadline_at: new Date(started.getTime() + timeoutSeconds * 1000).toISOString(),
    attempts: 0,
    last_checked_at: null,
    last_live_count: null,
    last_error: null
  };
  nextState.status = 'waiting_for_live_consistency';
  nextState.updated_at = started.toISOString();
  return nextState;
}
