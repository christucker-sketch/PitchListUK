#!/usr/bin/env node

const defaultStatusUrl = 'https://findpitches-global-acquisition-shadow.ctucker.workers.dev/ops/uk-status.json';

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildAuthoritativeUkObserverStatus(receipt, now = new Date()) {
  if (!receipt || receipt.ok !== true || receipt.available !== true || receipt.authority !== 'authoritative') {
    throw new Error('UK authoritative controller receipt unavailable');
  }
  const totals = receipt.totals || {};
  const recent = Array.isArray(receipt.recent_results) ? receipt.recent_results : [];
  const recentCompleted = recent.filter(item => item?.completed_at);
  const recentRecoveries = recent.filter(item => item?.recovered_at || item?.recovery_reason);
  return {
    market: 'UK',
    controller_status: receipt.status || 'unknown',
    status_source: 'cloudflare_authoritative_controller',
    observed_controller_at: receipt.updated_at || receipt.generated_at || null,
    state_version: numberOrNull(receipt.state_version),
    production_count: numberOrNull(receipt.production_count),
    live_api_count: numberOrNull(receipt.production_count),
    approved_source_count: numberOrNull(receipt.source_count),
    cycle: numberOrNull(receipt.cycle),
    query_offset: numberOrNull(receipt.query_offset),
    query_limit: numberOrNull(receipt.query_limit),
    plan_size: numberOrNull(receipt.plan_size),
    active_instance: receipt.active_instance || null,
    blocker: receipt.blocker || null,
    pending_source_pr: receipt.pending_source_pr || null,
    pending_data_pr: receipt.pending_data_pr || null,
    pending_deployment: receipt.pending_deployment || null,
    totals: {
      discovery_runs: Number(totals.discovery_runs || 0),
      acquisition_runs: Number(totals.acquisition_runs || 0),
      source_additions: Number(totals.source_additions || 0),
      opportunity_additions: Number(totals.opportunity_additions || 0),
      source_prs_merged: Number(totals.source_prs_merged || 0),
      data_prs_merged: Number(totals.data_prs_merged || 0)
    },
    last_discovery: receipt.last_discovery || null,
    last_acquisition: receipt.last_acquisition || null,
    recent_activity: {
      completed_runs: recentCompleted.length,
      recoveries: recentRecoveries.length,
      source_additions: recent.reduce((sum, item) => sum + Number(item?.source_additions || 0), 0),
      opportunity_additions: recent.reduce((sum, item) => sum + Number(item?.manifest_additions || 0), 0),
      results: recent
    },
    decision: receipt.decision || null,
    observed_at: now.toISOString()
  };
}

export async function fetchAuthoritativeUkObserverStatus({
  statusUrl = process.env.FINDPITCHES_UK_CONTROLLER_STATUS_URL || defaultStatusUrl,
  now = new Date()
} = {}) {
  const response = await fetch(statusUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`UK controller status HTTP ${response.status}`);
  return buildAuthoritativeUkObserverStatus(await response.json(), now);
}
