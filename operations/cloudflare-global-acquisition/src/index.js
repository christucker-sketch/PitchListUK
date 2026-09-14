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
import { handleControllerStateMaintenance } from '../lib/controller-state-maintenance.mjs';
import { runCloudControllerTick } from '../lib/cloud-controller-tick.mjs';
import {
  globalUkControllerCutoverEnabled,
  runUkCloudControllerTick
} from '../lib/uk-cloud-controller.mjs';
import { handleUkControllerStateMaintenance } from '../lib/uk-controller-state-maintenance.mjs';
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

    if (dispatch.handler === 'ca_controller_cutover_readiness') {
      return step.do('read Canada controller cutover readiness', async () => ({
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

async function runScheduledControllers(env) {
  const results = await Promise.allSettled([
    runCloudControllerTick(env, { execute: true }),
    runUkCloudControllerTick({ ...env, CONTROLLER_STATE: env.UK_CONTROLLER_STATE }, { execute: true }),
    runCaCloudControllerTick(env, { execute: true })
  ]);
  const [us, uk, ca] = results;
  if (us.status === 'fulfilled') console.log('autonomous_cloud_controller_tick', JSON.stringify(us.value));
  else console.error('autonomous_cloud_controller_tick_failed', String(us.reason?.message || us.reason));
  if (uk.status === 'fulfilled') console.log('autonomous_uk_cloud_controller_tick', JSON.stringify(uk.value));
  else console.error('autonomous_uk_cloud_controller_tick_failed', String(uk.reason?.message || uk.reason));
  if (ca.status === 'fulfilled') console.log('autonomous_ca_cloud_controller_tick', JSON.stringify(ca.value));
  else console.error('autonomous_ca_cloud_controller_tick_failed', String(ca.reason?.message || ca.reason));
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduledControllers(env));
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

    if (request.method === 'GET' && url.pathname === '/health') {
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
