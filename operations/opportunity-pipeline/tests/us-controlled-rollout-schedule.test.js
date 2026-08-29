const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');

test('scheduled acquisition cannot enqueue multiple states during the controlled rollout', async () => {
  const { controlledRolloutScheduled } = await import('../../cloudflare-texas-acquisition/src/controlled-rollout-schedule.js');
  let createCalls = 0;
  let waitUntilCalls = 0;
  const env = { TEXAS_ACQUISITION: { create: async () => { createCalls += 1; } } };
  const ctx = { waitUntil: () => { waitUntilCalls += 1; } };

  const result = await controlledRolloutScheduled({ cron: '17 4 * * *', scheduledTime: 123 }, env, ctx);

  assert.deepEqual(result, {
    ok: true,
    disabled: true,
    reason: 'controlled_us_rollout_manual_only',
    trigger: 'schedule',
    cron: '17 4 * * *',
    scheduled_time: 123,
    queued: 0
  });
  assert.equal(createCalls, 0);
  assert.equal(waitUntilCalls, 0);
});

test('Worker config has no cron while manual single-state Workflow routing remains wired', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/wrangler.jsonc'), 'utf8'));
  const workerSource = fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/src/index.js'), 'utf8');

  assert.equal(config.triggers, undefined);
  assert.match(workerSource, /scheduled:\s*controlledRolloutScheduled/);
  assert.match(workerSource, /event\?\.payload\?\.state_code/);
  assert.match(workerSource, /getStateConfig\(url\.searchParams\.get\('state'\)/);
});

