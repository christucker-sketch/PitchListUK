import { WorkflowEntrypoint } from 'cloudflare:workers';

import { TexasAcquisitionWorkflow } from '../../cloudflare-texas-acquisition/src/index.js';
import { UkApprovedSourcePollWorkflow } from '../../cloudflare-uk-canary/src/index.js';
import { globalAcquisitionMarkets } from '../../../platform/acquisition/global-engine.mjs';
import { assertAuthoritativeUsMutationAllowed, globalControllerCutoverEnabled } from '../lib/controller-authority-guard.mjs';
import {
  recoverStaleHalAuthorityV12,
  STALE_AUTHORITY_RECOVERY_MODE
} from '../lib/controller-authority-recovery.mjs';
import { readControllerCutoverReadinessReport } from '../lib/controller-cutover-readiness.mjs';
import { runUsApprovedSourceReadOnlyPoll } from '../lib/us-approved-source-poll.mjs';
import { runUkAdditionsOnlyWorkflow } from '../lib/uk-additions-workflow.mjs';
import { runUkSourceDiscoveryWorkflow } from '../lib/uk-source-discovery-workflow.mjs';
import { handleControllerStateMaintenance } from '../lib/controller-state-maintenance.mjs';
import {
  assertGlobalControllerDispatchAllowed,
  globalControllerExecutionEnabled,
  globalControllerExecutionLevel,
  resolveGlobalAcquisitionDispatch
} from '../lib/dispatch.mjs';
import { ControllerStateDurableObject } from './controller-state.js';

export { ControllerStateDurableObject };

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

    throw new Error(`No global acquisition handler for ${dispatch.country} ${dispatch.mode}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
        controller_state_store: Boolean(env.CONTROLLER_STATE),
        controller_state_maintenance_enabled: Boolean(env.CONTROLLER_STATE_IMPORT_TOKEN),
        controller_cutover_readiness_workflow: true,
        stale_hal_authority_recovery_v12: true,
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
