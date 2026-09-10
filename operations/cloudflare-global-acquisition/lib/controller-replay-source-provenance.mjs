function normaliseIds(values) {
  return [...(Array.isArray(values) ? values : [])]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function exactIdSet(left, right) {
  return JSON.stringify(normaliseIds(left)) === JSON.stringify(normaliseIds(right));
}

function requiredSuccessfulCheck(checkRuns, name) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  const matches = runs.filter(run => String(run?.name || '') === name)
    .sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0));
  const run = matches[0];
  if (!run || run.status !== 'completed') throw new Error(`replay_source_provenance_check_pending:${name}`);
  if (run.conclusion !== 'success') throw new Error(`replay_source_provenance_check_failed:${name}:${run.conclusion || 'unknown'}`);
  return run;
}

export function validateReplaySourceDeploymentProof(state, proof) {
  const inflight = state?.deferred_replay_inflight;
  if (!inflight || inflight.mode !== 'acquire') throw new Error('replay_source_provenance_inflight_acquisition_missing');

  const stateCode = String(inflight.state_code || '').trim().toUpperCase();
  if (!stateCode || String(proof?.state_code || '').trim().toUpperCase() !== stateCode) {
    throw new Error('replay_source_provenance_state_mismatch');
  }

  const expectedIds = normaliseIds(inflight.source_ids);
  if (!expectedIds.length || new Set(expectedIds).size !== expectedIds.length) {
    throw new Error('replay_source_provenance_expected_ids_invalid');
  }
  if (!exactIdSet(proof?.source_ids, expectedIds)) throw new Error('replay_source_provenance_source_ids_mismatch');

  const mainSha = String(proof?.main_sha || '').trim().toLowerCase();
  const registryBlobSha = String(proof?.registry_blob_sha || '').trim().toLowerCase();
  const deploymentAnchorSha = String(proof?.deployment_anchor_sha || '').trim().toLowerCase();
  const deploymentRegistryBlobSha = String(proof?.deployment_registry_blob_sha || '').trim().toLowerCase();
  for (const [label, value] of [
    ['main_sha', mainSha],
    ['registry_blob_sha', registryBlobSha],
    ['deployment_anchor_sha', deploymentAnchorSha],
    ['deployment_registry_blob_sha', deploymentRegistryBlobSha]
  ]) {
    if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`replay_source_provenance_${label}_invalid`);
  }
  if (registryBlobSha !== deploymentRegistryBlobSha) throw new Error('replay_source_provenance_registry_blob_changed_since_deploy');
  if (proof?.deployment_anchor_is_main_ancestor !== true) throw new Error('replay_source_provenance_deployment_anchor_not_main_ancestor');

  requiredSuccessfulCheck(proof?.check_runs, 'verify');
  const deploy = requiredSuccessfulCheck(proof?.check_runs, 'deploy_acquisition_worker_production');

  return Object.freeze({
    state_code: stateCode,
    source_ids: expectedIds,
    main_sha: mainSha,
    registry_blob_sha: registryBlobSha,
    deployment_anchor_sha: deploymentAnchorSha,
    deployment_check_id: Number(deploy.id || 0)
  });
}
