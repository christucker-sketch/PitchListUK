const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateHealth } = require('../lib/monitoring');
const { runtimeRoot, writeStagingManifest } = require('../lib/staging-store');

test('monitoring reports every required operational alert', () => {
  const result = evaluateHealth({
    discovery_status: 'failed', publish_status: 'failed', serper_credits: 2, dataset_age_hours: 72,
    promoted_valid_growth: 0, non_uk_count: 1, expired_or_closed_count: 2, broken_application_links: 3,
    coverage_regression: true, required_headers_ok: false, production_sha: 'a', github_main_sha: 'b'
  });
  assert.deepEqual(result.alerts.map(alert => alert.code), [
    'discovery_failure', 'publish_failure', 'serper_credits_low', 'production_dataset_stale',
    'zero_promoted_valid_growth', 'non_uk_records', 'expired_or_closed_records', 'broken_application_links',
    'geographic_coverage_regression', 'required_security_headers_missing', 'production_sha_mismatch'
  ]);
});

test('runtime state must be outside Git and writes atomically to staging', () => {
  assert.throws(() => runtimeRoot({}), /must be an absolute path outside Git/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-runtime-'));
  const target = writeStagingManifest('test.json', { production_write_enabled: false }, { PITCHLIST_PIPELINE_RUNTIME_DIR: root });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { production_write_enabled: false });
  assert.equal(fs.readdirSync(path.dirname(target)).some(name => name.endsWith('.tmp')), false);
});
