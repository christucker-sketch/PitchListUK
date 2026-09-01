import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  notificationConfigFromEnvironment,
  notifyFailure,
  notifyRecovery
} from '../../acquisition-notifications/notifier.mjs';

function fixture(controllerId = 'us-nationwide-growth', market = 'United States', countryCode = 'US') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'findpitches-notify-'));
  const stateFile = path.join(root, 'controller.json');
  fs.writeFileSync(stateFile, `${JSON.stringify({
    status: 'running_cloudflare_discovery',
    current: { state_name: 'Michigan', query_offset: 10 },
    active_instance: { id: 'cf_test_workflow', state_name: 'Michigan' },
    snapshot_count: 229,
    approved_source_count: 441,
    deployments: [{ deployment_id: 'deploy_previous' }]
  })}\n`);
  const config = {
    enabled: true,
    controller_id: controllerId,
    market,
    country_code: countryCode,
    service_name: `findpitches-${countryCode.toLowerCase()}-growth.service`,
    controller_state_file: stateFile,
    incident_state_dir: path.join(root, 'incidents'),
    delivery_log_file: path.join(root, 'delivery.log'),
    telegram_target: 'test-chat',
    telegram_channel: 'telegram',
    openclaw_bin: 'openclaw',
    recommended_next_action: 'Repair the exact blocker and resume from the safe checkpoint.'
  };
  return { root, stateFile, config };
}

test('US terminal failure emits the complete acquisition alert', () => {
  const { config } = fixture();
  const messages = [];
  const result = notifyFailure({ config, error: 'Repository worktree is not clean', deliver: (_config, message) => messages.push(message) });
  assert.equal(result.status, 'notified');
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^🚨 FindPitches acquisition stopped/);
  assert.match(messages[0], /Market: United States \(US\)/);
  assert.match(messages[0], /Region: Michigan/);
  assert.match(messages[0], /Cursor\/query offset: 10/);
  assert.match(messages[0], /Workflow ID: cf_test_workflow/);
  assert.match(messages[0], /Opportunity count: 229/);
  assert.match(messages[0], /Approved-source count: 441/);
  assert.match(messages[0], /Checkpoint safe: yes/);
});

test('generic non-US identity is entirely config driven', () => {
  const { config } = fixture('canada-nationwide-growth', 'Canada', 'CA');
  const messages = [];
  notifyFailure({ config, error: 'Cloudflare Workflow terminal error', overrides: { region: 'Ontario' }, deliver: (_config, message) => messages.push(message) });
  assert.match(messages[0], /Market: Canada \(CA\)/);
  assert.match(messages[0], /Region: Ontario/);
  assert.match(messages[0], /Controller\/service: findpitches-ca-growth.service/);
});

test('same incident is deduplicated from persisted state across restart', () => {
  const { config } = fixture();
  let sends = 0;
  const deliver = () => { sends += 1; };
  assert.equal(notifyFailure({ config, error: 'merge failed', deliver }).status, 'notified');
  const reloadedConfig = { ...config };
  assert.equal(notifyFailure({ config: reloadedConfig, error: 'merge failed', deliver }).status, 'deduplicated');
  assert.equal(sends, 1);
});

test('recovery is sent only after a notified incident and then resolves it', () => {
  const { config } = fixture();
  const messages = [];
  assert.equal(notifyRecovery({ config, deliver: (_config, message) => messages.push(message) }).status, 'no_notified_incident');
  notifyFailure({ config, error: 'GitHub CI failed', deliver: (_config, message) => messages.push(message) });
  const result = notifyRecovery({ config, overrides: { workflow_id: 'cf_new_workflow', cursor: 12 }, deliver: (_config, message) => messages.push(message) });
  assert.equal(result.status, 'notified');
  assert.match(messages[1], /^✅ FindPitches acquisition resumed/);
  assert.match(messages[1], /Recovered incident: GitHub CI failed/);
  assert.match(messages[1], /New active Workflow ID: cf_new_workflow/);
  assert.equal(notifyRecovery({ config, deliver: () => assert.fail('must not send twice') }).status, 'no_notified_incident');
});

test('materially changed blocker creates a new failure alert', () => {
  const { config } = fixture();
  let sends = 0;
  const deliver = () => { sends += 1; };
  notifyFailure({ config, error: 'authentication failed', deliver });
  const result = notifyFailure({ config, error: 'production deployment failed', deliver });
  assert.equal(result.status, 'notified');
  assert.equal(sends, 2);
});

test('Telegram delivery failure is persisted and safely retried', () => {
  const { config, stateFile } = fixture();
  const checkpointBefore = fs.readFileSync(stateFile, 'utf8');
  const failed = notifyFailure({ config, error: 'configuration failure', deliver: () => { throw new Error('Telegram unavailable'); } });
  assert.equal(failed.status, 'delivery_failed');
  assert.equal(fs.readFileSync(stateFile, 'utf8'), checkpointBefore, 'notifier must never mutate acquisition checkpoint');
  let sends = 0;
  const retried = notifyFailure({ config, error: 'configuration failure', deliver: () => { sends += 1; } });
  assert.equal(retried.status, 'notified');
  assert.equal(sends, 1);
});

test('independent controllers retain independent simultaneous incidents', () => {
  const first = fixture('australia-growth', 'Australia', 'AU');
  const second = fixture('new-zealand-growth', 'New Zealand', 'NZ');
  notifyFailure({ config: first.config, error: 'auth failed', deliver: () => {} });
  notifyFailure({ config: second.config, error: 'dirty worktree', deliver: () => {} });
  const firstFiles = fs.readdirSync(first.config.incident_state_dir);
  const secondFiles = fs.readdirSync(second.config.incident_state_dir);
  assert.deepEqual(firstFiles, ['australia-growth.json']);
  assert.deepEqual(secondFiles, ['new-zealand-growth.json']);
});

test('transient or auto-recovered states do not notify', () => {
  const { config } = fixture();
  const result = notifyFailure({ config, error: 'normal retry', terminal: false, deliver: () => assert.fail('transient state must not send') });
  assert.equal(result.status, 'suppressed');
});

test('environment configuration supports future controllers without code changes', () => {
  const { root } = fixture();
  const config = notificationConfigFromEnvironment({
    FINDPITCHES_NOTIFICATION_ENABLED: '1',
    FINDPITCHES_CONTROLLER_ID: 'ireland-growth',
    FINDPITCHES_MARKET_NAME: 'Ireland',
    FINDPITCHES_COUNTRY_CODE: 'IE',
    FINDPITCHES_SERVICE_NAME: 'findpitches-ie-growth.service',
    FINDPITCHES_NOTIFICATION_STATE_DIR: path.join(root, 'shared')
  });
  assert.equal(config.controller_id, 'ireland-growth');
  assert.equal(config.market, 'Ireland');
});

test('both autonomous controller entry points use the shared notifier', () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
  for (const name of ['growth-controller.mjs', 'rollout-controller.mjs']) {
    const source = fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/scripts', name), 'utf8');
    assert.match(source, /safeNotifyFailureFromEnvironment/);
    assert.match(source, /safeNotifyRecoveryFromEnvironment/);
  }
});

