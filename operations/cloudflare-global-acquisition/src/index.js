import { WorkflowEntrypoint } from 'cloudflare:workers';

import { TexasAcquisitionWorkflow } from '../../cloudflare-texas-acquisition/src/index.js';
import { UkApprovedSourcePollWorkflow } from '../../cloudflare-uk-canary/src/index.js';
import { globalAcquisitionMarkets } from '../../../platform/acquisition/global-engine.mjs';
import { assertAuthoritativeUsMutationAllowed, globalControllerCutoverEnabled } from '../lib/controller-authority-guard.mjs';
import {
  recoverStaleHalAuthorityV12,
  STALE_AUTHORITY_RECOVERY_MODE
} from '../lib/controller-authority-recovery.mjs';
import {
  CUTOVER_OPERATOR_MODE,
  demoteCurrentAuthoritative,
  FINAL_HAL_CUTOVER_OPERATOR_MODE,
  promoteExactV14,
  promoteFinalHalHandover,
  ROLLBACK_OPERATOR_MODE
} from '../lib/controller-cutover-operator.mjs';
import {
  FAILED_LEGACY_REPLAY_RECOVERY_MODE,
  recoverFailedLegacyReplay
} from '../lib/controller-legacy-replay-recovery.mjs';
import {
  EXACT_V13_PREFLIGHT_MODE,
  prepareExactV13CutoverPreflight
} from '../lib/controller-exact-preflight.mjs';
import {
  FINAL_HAL_HANDOVER_PATH,
  handleExactFinalHalHandover
} from '../lib/controller-final-hal-handover.mjs';
import {
  handleTerminalDiscoveryRecovery,
  RECOVERY_PATH as TERMINAL_DISCOVERY_RECOVERY_PATH
} from '../lib/controller-terminal-discovery-recovery.mjs';
import { readControllerCutoverReadinessReport } from '../lib/controller-cutover-readiness.mjs';
import { runUsApprovedSourceReadOnlyPoll } from '../lib/us-approved-source-poll.mjs';
import { runUkAdditionsOnlyWorkflow } from '../lib/uk-additions-workflow.mjs';
import { runUkSourceDiscoveryWorkflow } from '../lib/uk-source-discovery-workflow.mjs';
import { runCanadaSourceDiscoveryWorkflow } from '../lib/ca-source-discovery-workflow.mjs';
import { runCanadaAdditionsOnlyWorkflow } from '../lib/ca-additions-workflow.mjs';
import { readCaControllerCutoverReadinessReport } from '../lib/ca-controller-cutover-readiness.mjs';
import {
  CA_AUTHORITY_PROMOTION_MODE,
  promoteCanadaShadowAuthority
} from '../lib/ca-controller-cutover-operator.mjs';
import {
  CA_PR_BROKER_RECOVERY_MODE,
  recoverFailedCanadaPrBrokerWorkflow
} from '../lib/ca-pr-broker-recovery.mjs';
import { handleControllerStateMaintenance } from '../lib/controller-state-maintenance.mjs';
import { runCloudControllerTick } from '../lib/cloud-controller-tick.mjs';
import {
  globalUkControllerCutoverEnabled,
  runUkCloudControllerTick
} from '../lib/uk-cloud-controller.mjs';
import { handleUkControllerStateMaintenance } from '../lib/uk-controller-state-maintenance.mjs';
import { readUkControllerReadonlyReceipt } from '../lib/uk-controller-readonly-receipt.mjs';
import {
  globalCaControllerCutoverEnabled,
  runCaCloudControllerTick
} from '../lib/ca-cloud-controller.mjs';
import { handleCaControllerStateMaintenance } from '../lib/ca-controller-state-maintenance.mjs';
import {
  assertGlobalControllerDispatchAllowed,
  globalControllerExecutionEnabled,
  globalControllerExecutionLevel,
  resolveGlobalAcquisitionDispatch
} from '../lib/dispatch.mjs';
import { ControllerStateDurableObject } from './controller-state.js';
import { UkControllerStateDurableObject } from './uk-controller-state.js';
import { CaControllerStateDurableObject } from './ca-controller-state.js';

export { ControllerStateDurableObject, UkControllerStateDurableObject, CaControllerStateDurableObject };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function ukOpsHtml(receipt) {
  const totals = receipt?.totals || {};
  const lastDiscovery = receipt?.last_discovery || {};
  const lastAcquisition = receipt?.last_acquisition || {};
  const rows = (receipt?.recent_results || []).slice().reverse().map(item => \`
    <tr><td>\${escapeHtml(item.completed_at || item.recovered_at || '')}</td><td>\${escapeHtml(item.mode || item.result_mode || '')}</td><td>\${Number(item.source_additions || 0)}</td><td>\${Number(item.manifest_additions || 0)}</td><td>\${escapeHtml(item.recovery_reason || '')}</td></tr>\`).join('');
  const updated = escapeHtml(receipt?.updated_at || '');
  return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>FindPitches UK Ops</title><style>
  body{font:15px system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 18px;color:#202124;background:#fafafa}h1{margin-bottom:4px}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px}.value{font-size:25px;font-weight:700;margin-top:5px}.ok{color:#137333}.bad{color:#b3261e}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;padding:9px;border-bottom:1px solid #e5e5e5}code{font-size:12px}.links a{margin-right:16px}</style></head><body>
  <h1>FindPitches UK acquisition</h1><div class="muted">Read-only cloud controller telemetry · auto-refreshes every 60 seconds · updated \${updated}</div>
  <div class="links"><a href="/ops/uk-status.json">JSON</a><a href="/health">Worker health</a></div>
  <div class="grid">
    <div class="card">Controller<div class="value \${receipt?.blocker ? 'bad':'ok'}">\${escapeHtml(receipt?.status || 'unknown')}</div></div>
    <div class="card">Production opportunities<div class="value">\${receipt?.production_count ?? '—'}</div></div>
    <div class="card">Approved sources<div class="value">\${receipt?.source_count ?? '—'}</div></div>
    <div class="card">Discovery runs<div class="value">\${Number(totals.discovery_runs || 0)}</div></div>
    <div class="card">Acquisition runs<div class="value">\${Number(totals.acquisition_runs || 0)}</div></div>
    <div class="card">Opportunity additions<div class="value">\${Number(totals.opportunity_additions || 0)}</div></div>
    <div class="card">Source additions<div class="value">\${Number(totals.source_additions || 0)}</div></div>
    <div class="card">Cycle / query<div class="value">\${receipt?.cycle ?? '—'} / \${receipt?.query_offset ?? '—'}</div></div>
  </div>
  <h2>Latest activity</h2><table><tbody>
    <tr><th>Last discovery</th><td>\${escapeHtml(lastDiscovery.generated_at || '—')}</td><th>Source additions</th><td>\${Number(lastDiscovery.source_additions || 0)}</td></tr>
    <tr><th>Last acquisition</th><td>\${escapeHtml(lastAcquisition.generated_at || '—')}</td><th>Opportunity additions</th><td>\${Number(lastAcquisition.manifest_additions || 0)}</td></tr>
    <tr><th>Production before → planned</th><td colspan="3">\${lastAcquisition.production_count_before ?? '—'} → \${lastAcquisition.production_count_after_planned ?? '—'}</td></tr>
    <tr><th>Next decision</th><td colspan="3"><code>\${escapeHtml(JSON.stringify(receipt?.decision || {}))}</code></td></tr>
    <tr><th>Blocker</th><td colspan="3" class="\${receipt?.blocker ? 'bad':''}">\${escapeHtml(receipt?.blocker || 'none')}</td></tr>
  </tbody></table>
  <h2>Recent controller results</h2><table><thead><tr><th>Time</th><th>Mode</th><th>Sources +</th><th>Opportunities +</th><th>Recovery/error</th></tr></thead><tbody>\${rows || '<tr><td colspan="5">No recent results recorded.</td></tr>'}</tbody></table>
  <p class="muted">Authority: \${escapeHtml(receipt?.authority || 'unknown')} · state v\${receipt?.state_version ?? '—'} · base <code>\${escapeHtml(receipt?.base_main_sha || '')}</code></p>
  </body></html>\`;
}

export class GlobalAcquisitionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    if (payload.country === 'US' && payload.mode === STALE_AUTHORITY_RECOVERY_MODE) {
      return step.do('recover exact stale Hal controller authority marker', async () => ({
        country: 'US',
        mode: STALE_AUTHORITY_RECOVERY_MODE,
        ...(await recoverStaleHalAuthorityV12(this.env))
      }));
    }
    if (payload.country === 'US' && payload.mode === FAILED_LEGACY_REPLAY_RECOVERY_MODE) {
      return step.do('return exact failed legacy Michigan replay to deferred queue', async () => ({
        country: 'US',
        mode: FAILED_LEGACY_REPLAY_RECOVERY_MODE,
        ...(await recoverFailedLegacyReplay(this.env))
      }));
    }
    if (payload.country === 'US' && payload.mode === EXACT_V13_PREFLIGHT_MODE) {
      return step.do('prepare exact v13 US controller cutover preflight', async () => ({
        country: 'US',
        mode: EXACT_V13_PREFLIGHT_MODE,
        ...(await prepareExactV13CutoverPreflight(this.env))
      }));
    }
    if (payload.country === 'US' && payload.mode === CUTOVER_OPERATOR_MODE) {
      return step.do('promote exact preflight-ready v14 US controller authority', async () => ({
        country: 'US',
        mode: CUTOVER_OPERATOR_MODE,
        ...(await promoteExactV14(this.env, payload))
      }));
    }
    if (payload.country === 'US' && payload.mode === FINAL_HAL_CUTOVER_OPERATOR_MODE) {
      return step.do('promote final stopped Hal handover US controller authority', async () => ({
        country: 'US',
        mode: FINAL_HAL_CUTOVER_OPERATOR_MODE,
        ...(await promoteFinalHalHandover(this.env, payload))
      }));
    }
    if (payload.country === 'US' && payload.mode === ROLLBACK_OPERATOR_MODE) {
      return step.do('demote current authoritative US controller after safe policy restore', async () => ({
        country: 'US',
        mode: ROLLBACK_OPERATOR_MODE,
        ...(await demoteCurrentAuthoritative(this.env, payload))
      }));
    }
    if (payload.country === 'CA' && payload.mode === CA_AUTHORITY_PROMOTION_MODE) {
      return step.do('promote proven Canada shadow authority while cutover remains disabled', async () => ({
        country: 'CA',
        mode: CA_AUTHORITY_PROMOTION_MODE,
        ...(await promoteCanadaShadowAuthority(this.env, payload))
      }));
    }
    if (payload.country === 'UK' && payload.mode === 'controller_recovery_tick') {
      return step.do('execute one bounded UK controller recovery tick', async () => ({
        country: 'UK',
        mode: 'controller_recovery_tick',
        ...(await runUkCloudControllerTick({ ...this.env, CONTROLLER_STATE: this.env.UK_CONTROLLER_STATE, GITHUB_PR_BROKER: this.env.GITHUB_PR_BROKER }, { execute: true }))
      }));
    }
    if (payload.country === 'CA' && payload.mode === CA_PR_BROKER_RECOVERY_MODE) {
      return step.do('recover only the exact failed Canada PR broker workflow checkpoint', async () => ({
        country: 'CA',
        mode: CA_PR_BROKER_RECOVERY_MODE,
        ...(await recoverFailedCanadaPrBrokerWorkflow(this.env))
      }));
    }

    const dispatch = resolveGlobalAcquisitionDispatch(payload);
    assertGlobalControllerDispatchAllowed(this.env, dispatch);
    await assertAuthoritativeUsMutationAllowed(this.env, dispatch);

    if (dispatch.handler === 'us_controller_cutover_readiness') {
      return step.do('read US controller cutover readiness', async () => ({
        country: 'US',
        mode: dispatch.mode,
        mutation_attempted: false,
        ...(await readControllerCutoverReadinessReport(this.env))
      }));
    }

    if (dispatch.handler === 'uk_controller_cutover_readiness') {
      return step.do('read UK controller cutover readiness', async () => ({
        country: 'UK',
        mode: dispatch.mode,
        mutation_attempted: false,
        cutover_enabled: globalUkControllerCutoverEnabled(this.env),
        ...(await readUkControllerReadonlyReceipt(this.env))
      }));
    }

    if (dispatch.handler === 'ca_controller_cutover_readiness') {
      return step.do('read Canada controller cutover readiness', {
        retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
        timeout: '45 seconds'
      }, async () => ({
        country: 'CA',
        mode: dispatch.mode,
        mutation_attempted: false,
        ...(await readCaControllerCutoverReadinessReport(this.env))
      }));
    }

    if (dispatch.handler === 'us_approved_source_poll') {
      return step.do(`run read-only US ${dispatch.payload.state_code || 'state'} approved-source poll`, {
        retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '15 minutes'
      }, async () => runUsApprovedSourceReadOnlyPoll(dispatch.payload));
    }

    if (dispatch.handler === 'us_production_workflow') {
      return TexasAcquisitionWorkflow.prototype.run.call({ env: this.env }, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.handler === 'uk_additions_only_pr') {
      return runUkAdditionsOnlyWorkflow(this.env, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.handler === 'uk_source_discovery_pr') {
      return runUkSourceDiscoveryWorkflow(this.env, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.handler === 'uk_approved_source_poll') {
      return UkApprovedSourcePollWorkflow.prototype.run.call({ env: this.env }, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.handler === 'ca_source_discovery_pr') {
      return runCanadaSourceDiscoveryWorkflow(this.env, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.handler === 'ca_additions_only_pr') {
      return runCanadaAdditionsOnlyWorkflow(this.env, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    throw new Error(`No global acquisition handler for ${dispatch.country} ${dispatch.mode}`);
  }
}

async function runScheduledController(label, tick) {
  try {
    const value = await tick();
    console.log(label, JSON.stringify(value));
  } catch (error) {
    console.error(`${label}_failed`, String(error?.message || error));
  }
}

export default {
  async scheduled(_event, env, ctx) {
    // Keep each market in its own waitUntil lifetime. A slow or wedged controller
    // must not hold the UK tick hostage behind Promise.allSettled().
    ctx.waitUntil(runScheduledController('autonomous_cloud_controller_tick', () =>
      runCloudControllerTick(env, { execute: true })));
    ctx.waitUntil(runScheduledController('autonomous_uk_cloud_controller_tick', () =>
      runUkCloudControllerTick({ ...env, CONTROLLER_STATE: env.UK_CONTROLLER_STATE, GITHUB_PR_BROKER: env.GITHUB_PR_BROKER }, { execute: true })));
    ctx.waitUntil(runScheduledController('autonomous_ca_cloud_controller_tick', () =>
      runCaCloudControllerTick(env, { execute: true })));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === FINAL_HAL_HANDOVER_PATH) {
      try {
        return await handleExactFinalHalHandover(request, env);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
      }
    }

    if (url.pathname === TERMINAL_DISCOVERY_RECOVERY_PATH) {
      try {
        return await handleTerminalDiscoveryRecovery(request, env);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
      }
    }

    if (url.pathname.startsWith('/ca-controller-state/')) {
      return handleCaControllerStateMaintenance(request, env);
    }

    if (url.pathname.startsWith('/uk-controller-state/')) {
      return handleUkControllerStateMaintenance(request, env);
    }

    if (url.pathname.startsWith('/controller-state/')) {
      return handleControllerStateMaintenance(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/ops/uk-status.json') {
      const receipt = await readUkControllerReadonlyReceipt(env);
      return Response.json({ ok: receipt.available === true, service: 'findpitches-uk-ops', generated_at: new Date().toISOString(), ...receipt }, { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.pathname === '/ops/uk-status') {
      const receipt = await readUkControllerReadonlyReceipt(env);
      return new Response(ukOpsHtml(receipt), { status: receipt.available === true ? 200 : 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      const uk_controller = await readUkControllerReadonlyReceipt(env);
      return Response.json({
        ok: true,
        service: 'findpitches-global-acquisition-shadow',
        execution_enabled: globalControllerExecutionEnabled(env),
        execution_level: globalControllerExecutionLevel(env),
        us_controller_cutover_enabled: globalControllerCutoverEnabled(env),
        uk_controller_cutover_enabled: globalUkControllerCutoverEnabled(env),
        ca_controller_cutover_enabled: globalCaControllerCutoverEnabled(env),
        controller_state_store: Boolean(env.CONTROLLER_STATE),
        uk_controller_state_store: Boolean(env.UK_CONTROLLER_STATE),
        uk_controller,
        ca_controller_state_store: Boolean(env.CA_CONTROLLER_STATE),
        controller_state_maintenance_enabled: Boolean(env.CONTROLLER_STATE_IMPORT_TOKEN),
        controller_cutover_readiness_workflow: true,
        stale_hal_authority_recovery_v12: true,
        failed_legacy_mi_replay_recovery: true,
        exact_v13_cutover_preflight: true,
        exact_final_hal_handover_import: true,
        exact_terminal_discovery_recovery: true,
        manual_us_cutover_operator: true,
        manual_us_rollback_operator: true,
        manual_uk_cutover_operator: true,
        manual_uk_rollback_operator: true,
        manual_ca_cutover_operator: true,
        manual_ca_authority_promotion_operator: true,
        ca_pr_broker_recovery_operator: true,
        manual_ca_rollback_operator: true,
        markets: globalAcquisitionMarkets().map(market => ({
          country: market.country,
          name: market.country_name,
          enabled: market.enabled,
          status: market.status,
          geography_kind: market.geography_kind
        }))
      });
    }

    if (request.method === 'POST' && url.pathname === '/run') {
      let params;
      try {
        params = await request.json();
        const dispatch = resolveGlobalAcquisitionDispatch(params);
        assertGlobalControllerDispatchAllowed(env, dispatch);
        await assertAuthoritativeUsMutationAllowed(env, dispatch);
        const instance = await env.GLOBAL_ACQUISITION.create({ params: dispatch.payload });
        return Response.json({
          ok: true,
          country: dispatch.country,
          mode: dispatch.mode,
          execution_level: globalControllerExecutionLevel(env),
          instance_id: instance.id
        }, { status: 202 });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};