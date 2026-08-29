const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes enabled states as isolated shared-engine configs', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  const codes = states.map(state => state.code);

  assert.ok(states.length >= 6);
  for (const code of ['TX', 'FL', 'CA', 'NY', 'PA', 'IL']) assert.ok(codes.includes(code));

  for (const state of states) {
    assert.equal(state.jurisdiction, `US-${state.code}`);
    assert.equal(state.snapshot_path, 'functions/_data/us-opportunities.mjs');
    assert.ok(state.sources.length > 0);
    assert.ok(state.sources.every(source => source.country_code === 'US'));
    assert.ok(state.sources.every(source => source.region_code === state.code));
    assert.ok(state.sources.every(source => source.jurisdiction === state.jurisdiction));
  }

  assert.deepEqual(
    states.map(state => state.schedule_order),
    states.map(state => state.schedule_order).slice().sort((a, b) => a - b)
  );
});

test('US acquisition registry fails closed for unsupported states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  assert.throws(() => registry.getStateConfig('ZZ'), /Unsupported or disabled US acquisition state/);
  assert.throws(() => registry.getStateConfig(''), /Unsupported or disabled US acquisition state/);
});
