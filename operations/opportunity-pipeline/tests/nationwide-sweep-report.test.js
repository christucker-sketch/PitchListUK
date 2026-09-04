import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSweepReport,
  renderMarkdown,
  renderTelegramMessages,
  sendReportToTelegram
} from '../../cloudflare-texas-acquisition/scripts/nationwide-sweep-report.mjs';

const states = [
  { code: 'AZ', name: 'Arizona', schedule_order: 1 },
  { code: 'MA', name: 'Massachusetts', schedule_order: 2 }
];

test('nationwide report aggregates state runs, additions, PRs and merged SHAs', () => {
  const state = {
    status: 'ready',
    snapshot_count: 411,
    live_api_count: 411,
    approved_source_count: 828,
    target_count: 1100,
    state_totals: { AZ: 8, MA: 11 },
    results: [
      {
        mode: 'discover', state_code: 'AZ', instance_id: 'cf_az', generated_source_count: 1,
        publication: { source_count: 1, pr_number: 767, source_ids: ['az-one'] }
      },
      {
        mode: 'acquire', state_code: 'AZ', instance_id: 'cf_az_a', before: 410, after: 411,
        additions: 1, publication: { pr_number: 768 }
      },
      {
        mode: 'acquire', state_code: 'MA', instance_id: 'cf_ma', before: 411, after: 411,
        additions: 0
      }
    ],
    deployments: [{ state_code: 'AZ', pr_number: 768, production_sha: 'abcdef1234567890' }],
    deferred_units: [],
    blockers: [],
    sweep_complete: true
  };

  const report = buildSweepReport(state, {
    states,
    generatedAt: '2026-09-04T12:00:00.000Z',
    github: {
      767: { merged: true, merged_sha: '1111111111111111111111111111111111111111' },
      768: { merged: true, merged_sha: '2222222222222222222222222222222222222222' }
    }
  });

  assert.equal(report.summary.states_total, 2);
  assert.equal(report.summary.states_touched, 2);
  assert.equal(report.summary.states_with_additions, 1);
  assert.equal(report.summary.states_zero_additions, 1);
  assert.equal(report.summary.opportunity_additions_recorded, 1);
  assert.equal(report.summary.source_additions_recorded, 1);
  assert.equal(report.summary.completion_integrity_passed, true);
  assert.equal(report.states[0].prs[0].merged_sha, '1111111111111111111111111111111111111111');
  assert.equal(report.states[0].prs[1].merged_sha, '2222222222222222222222222222222222222222');

  const markdown = renderMarkdown(report);
  assert.match(markdown, /States touched: \*\*2\/2\*\*/);
  assert.match(markdown, /#767 @ 111111111111/);
  assert.match(markdown, /Nationwide completion integrity: \*\*PASS\*\*/);
});

test('nationwide report refuses completion when a state is missing', () => {
  const report = buildSweepReport({
    status: 'ready', snapshot_count: 411, state_totals: { AZ: 8 }, results: [
      { mode: 'acquire', state_code: 'AZ', additions: 0, instance_id: 'cf_az' }
    ], sweep_complete: true
  }, { states });

  assert.equal(report.summary.states_touched, 1);
  assert.equal(report.summary.states_missing, 1);
  assert.equal(report.summary.completion_integrity_passed, false);
});

test('nationwide report surfaces unresolved deferred work and genuine blockers', () => {
  const report = buildSweepReport({
    status: 'ready', snapshot_count: 411, state_totals: { AZ: 8, MA: 11 },
    results: [
      { mode: 'acquire', state_code: 'AZ', additions: 0, instance_id: 'cf_az' },
      { mode: 'acquire', state_code: 'MA', additions: 0, instance_id: 'cf_ma' }
    ],
    deferred_units: [{ mode: 'discover', state_code: 'AZ', query_offset: 122, query_limit: 2, reason: 'confirmed_terminal_workflow', instance_id: 'cf_bad' }],
    blockers: [{ state_code: 'MA', reason: 'replay_attempts_exhausted' }],
    sweep_complete: true
  }, { states });

  assert.equal(report.summary.deferred_units, 1);
  assert.equal(report.summary.blockers, 1);
  assert.equal(report.summary.completion_integrity_passed, false);
  const markdown = renderMarkdown(report);
  assert.match(markdown, /AZ discover — offset 122/);
  assert.match(markdown, /MA — replay_attempts_exhausted/);
});

test('resolved deferred units do not remain outstanding', () => {
  const unit = { mode: 'discover', state_code: 'AZ', query_offset: 122, query_limit: 2, batch_number: null, instance_id: 'cf_bad' };
  const report = buildSweepReport({
    status: 'complete', snapshot_count: 411, state_totals: { AZ: 8, MA: 11 },
    results: [
      { mode: 'acquire', state_code: 'AZ', additions: 0, instance_id: 'cf_az' },
      { mode: 'acquire', state_code: 'MA', additions: 0, instance_id: 'cf_ma' }
    ],
    deferred_units: [unit], resolved_deferred_units: [unit], blockers: [], sweep_complete: true
  }, { states });

  assert.equal(report.summary.deferred_units, 0);
  assert.equal(report.summary.completion_integrity_passed, true);
});

test('Telegram report is mobile friendly and sends through the existing notifier transport', () => {
  const report = buildSweepReport({
    status: 'running_cloudflare_discovery', snapshot_count: 411, live_api_count: 411,
    approved_source_count: 828, state_totals: { AZ: 8, MA: 11 },
    current: { state_code: 'MA' },
    results: [
      { mode: 'acquire', state_code: 'AZ', additions: 1, instance_id: 'cf_az' },
      { mode: 'acquire', state_code: 'MA', additions: 0, instance_id: 'cf_ma' }
    ],
    deferred_units: [{ mode: 'discover', state_code: 'AZ', query_offset: 122, reason: 'confirmed_terminal_workflow' }],
    blockers: [], sweep_complete: false
  }, { states });

  const messages = renderTelegramMessages(report, { maxLength: 1000 });
  assert.ok(messages.length >= 1);
  assert.ok(messages.every(message => message.length <= 1000));
  assert.match(messages.join('\n'), /🇺🇸 FindPitches US sweep report/);
  assert.match(messages.join('\n'), /States touched: 2\/2/);
  assert.match(messages.join('\n'), /AZ: 8 opps \| \+1/);
  assert.match(messages.join('\n'), /Deferred:/);

  const delivered = [];
  const result = sendReportToTelegram(report, {
    env: {
      FINDPITCHES_NOTIFICATION_ENABLED: '1',
      FINDPITCHES_CONTROLLER_ID: 'us-growth',
      FINDPITCHES_MARKET_NAME: 'US',
      FINDPITCHES_NOTIFICATION_TELEGRAM_TARGET: '12345'
    },
    deliver: (config, message) => delivered.push({ config, message }),
    maxLength: 1000
  });
  assert.equal(result.messages_sent, messages.length);
  assert.equal(delivered.length, messages.length);
  assert.equal(delivered[0].config.telegram_target, '12345');
});
