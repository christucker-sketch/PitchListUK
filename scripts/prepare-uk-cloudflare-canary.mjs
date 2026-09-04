import { buildUkCloudflareCanaryPlan } from '../platform/acquisition/uk-cloudflare-canary.mjs';

const plan = buildUkCloudflareCanaryPlan();

const output = {
  ...plan,
  execution_gate: {
    required: true,
    condition: 'Cloudflare Workflows trigger/describe control plane is healthy',
    current_action: 'do_not_trigger',
    note: 'This command prepares the UKCF-003 canary payload only. It does not call Wrangler, Cloudflare APIs, GitHub publication paths, Serper or any production mutation.'
  }
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
