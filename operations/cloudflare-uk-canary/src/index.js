import { WorkflowEntrypoint } from 'cloudflare:workers';

import { buildUkCloudflareCanaryPlan } from '../../../platform/acquisition/uk-cloudflare-canary.mjs';
import { assertUkCanaryHealthGate, executeUkCloudflareCanary } from '../lib/uk-cloudflare-canary-execution.mjs';
import { sourcePollBatches, pollApprovedSourceBatch, summarizeApprovedSourcePoll } from '../lib/uk-approved-source-poll.mjs';

export class UkCloudflareCanaryWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    if (payload.canary_id && payload.canary_id !== 'ukcf-003-approved-direct-v1') {
      throw new Error(`Unsupported UK canary id: ${payload.canary_id}`);
    }
    const healthGate = payload.health_gate;
    const asOf = payload.as_of || new Date().toISOString();
    const plan = buildUkCloudflareCanaryPlan();

    // Fail before entering a retryable step when the control-plane receipt is missing/invalid.
    // This gives operations a safe trigger+describe probe that can never reach source fetching.
    assertUkCanaryHealthGate(healthGate, { now: asOf });

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

export class UkApprovedSourcePollWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    if (payload.mode && payload.mode !== 'approved_source_cloudflare_read_only_poll') {
      throw new Error(`Unsupported UK approved-source poll mode: ${payload.mode}`);
    }
    const asOf = payload.as_of || new Date().toISOString();
    const batches = sourcePollBatches(undefined, { batch_size: payload.batch_size });
    if (!batches.length) throw new Error('UK approved-source registry has no routable approved sources');

    const reports = [];
    for (let index = 0; index < batches.length; index++) {
      const sourceBatch = batches[index];
      reports.push(await step.do(`poll approved UK sources batch ${index + 1} of ${batches.length}`, {
        retries: { limit: 1, delay: '30 seconds', backoff: 'exponential' },
        timeout: '20 minutes'
      }, async () => pollApprovedSourceBatch({
        sources: sourceBatch,
        now: asOf,
        fetchImpl: fetch,
        concurrency: Number(payload.concurrency || 2),
        timeout_ms: Number(payload.timeout_ms || 15000),
        max_attempts: Number(payload.max_attempts || 2)
      })));
    }

    return step.do('emit UK approved-source read-only poll result', async () => summarizeApprovedSourcePoll(reports, {
      generated_at: asOf
    }));
  }
}

export default {
  async fetch() {
    return Response.json({
      service: 'findpitches-uk-acquisition-canary',
      status: 'read_only',
      canary_enabled: true,
      approved_source_poll_enabled: true,
      discovery_enabled: false,
      publication_enabled: false,
      mutation_enabled: false
    });
  }
};
