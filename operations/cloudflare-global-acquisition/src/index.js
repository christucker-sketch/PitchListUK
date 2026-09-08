import { WorkflowEntrypoint } from 'cloudflare:workers';

import { TexasAcquisitionWorkflow } from '../../cloudflare-texas-acquisition/src/index.js';
import { UkApprovedSourcePollWorkflow } from '../../cloudflare-uk-canary/src/index.js';
import { globalAcquisitionMarkets } from '../../../platform/acquisition/global-engine.mjs';
import { globalControllerExecutionEnabled, resolveGlobalAcquisitionDispatch } from '../lib/dispatch.mjs';

export class GlobalAcquisitionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    if (!globalControllerExecutionEnabled(this.env)) {
      throw new Error('Global acquisition shadow controller execution is disabled');
    }

    const dispatch = resolveGlobalAcquisitionDispatch(event?.payload || {});
    if (dispatch.country === 'US') {
      return TexasAcquisitionWorkflow.prototype.run.call({ env: this.env }, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    if (dispatch.country === 'UK') {
      return UkApprovedSourcePollWorkflow.prototype.run.call({ env: this.env }, {
        ...event,
        payload: dispatch.payload
      }, step);
    }

    throw new Error(`No global acquisition handler for ${dispatch.country}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'findpitches-global-acquisition-shadow',
        execution_enabled: globalControllerExecutionEnabled(env),
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
      if (!globalControllerExecutionEnabled(env)) {
        return Response.json({ ok: false, error: 'global_acquisition_shadow_execution_disabled' }, { status: 503 });
      }
      const params = await request.json();
      const dispatch = resolveGlobalAcquisitionDispatch(params);
      const instance = await env.GLOBAL_ACQUISITION.create({ params: dispatch.payload });
      return Response.json({
        ok: true,
        country: dispatch.country,
        mode: dispatch.mode,
        instance_id: instance.id
      }, { status: 202 });
    }

    return new Response('Not found', { status: 404 });
  }
};
