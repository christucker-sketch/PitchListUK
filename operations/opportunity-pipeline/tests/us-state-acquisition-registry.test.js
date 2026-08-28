const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes Texas and Florida as enabled isolated states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  const texas = registry.getStateConfig('tx');
  const florida = registry.getStateConfig('fl');

  assert.equal(texas.code, 'TX');
  assert.equal(texas.name, 'Texas');
  assert.equal(texas.jurisdiction, 'US-TX');
  assert.equal(texas.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.ok(texas.sources.length >= 51);
  assert.ok(texas.sources.every(source => source.country_code === 'US' && source.region_code === 'TX' && source.jurisdiction === 'US-TX'));

  assert.equal(florida.code, 'FL');
  assert.equal(florida.name, 'Florida');
  assert.equal(florida.jurisdiction, 'US-FL');
  assert.equal(florida.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.ok(florida.sources.length >= 20);
  assert.ok(florida.sources.every(source => source.country_code === 'US' && source.region_code === 'FL' && source.jurisdiction === 'US-FL'));

  assert.deepEqual(states.map(state => state.code), ['TX', 'FL']);
});

test('US acquisition registry fails closed for unsupported states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  assert.throws(() => registry.getStateConfig('CA'), /Unsupported or disabled US acquisition state/);
  assert.throws(() => registry.getStateConfig(''), /Unsupported or disabled US acquisition state/);
});
