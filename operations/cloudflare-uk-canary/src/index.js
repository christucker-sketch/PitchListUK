import { WorkflowEntrypoint } from 'cloudflare:workers';

import { buildUkCloudflareCanaryPlan } from '../../../platform/acquisition/uk-cloudflare-canary.mjs';
import { executeUkCloudflareCanary } from '../../../platform/acquisition/uk-cloudflare-canary-execution.mjs';

export class UkCloudflareCanaryWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    if (payload.canary_id && payload.canary_id !== 'ukcf-003-approved-direct-v1') {
      throw new Error(`Unsupported UK canary id: ${payload.canary_id}`);
    }
    const healthGate = payload.health_gate;
    const asOf = payload.as_of || new Date().toISOString();
    const plan = buildUkCloudflareCanaryPlan();

    return step.do('run UK approved direct-source read-only canary', {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
      timeout: '5 minutes'
    }, async () => executeUkCloudflareCanary({
      plan,
      health_gate: healthGate,
      now: asOf,
      fetchImpl: fetch
    }));
  }
}

export default {
  async fetch() {
    return new Response(JSON.stringify({
      service: 'findpitches-uk-acquisition-canary',
      status: 'dormant',
      trigger_ready: false,
      publication_enabled: false,
      mutation_enabled: false
    }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
};
