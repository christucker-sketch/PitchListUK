const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes Texas as an enabled isolated state', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  assert.ok(states.length >= 1);
  const texas = registry.getStateConfig('tx');
  assert.equal(texas.code, 'TX');
  assert.equal(texas.name, 'Texas');
  assert.equal(texas.jurisdiction, 'US-TX');
  assert.equal(texas.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.ok(texas.sources.length >= 51);
  assert.ok(texas.sources.every(source => source.country_code === 'US' && source.region_code === 'TX' && source.jurisdiction === 'US-TX'));
  assert.deepEqual(states.map(state => state.code), [...states].sort((a, b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code)).map(state => state.code));
});

test('US acquisition registry fails closed for unsupported states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  assert.throws(() => registry.getStateConfig('FL'), /Unsupported or disabled US acquisition state/);
});
