const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes Texas Florida California and New York as enabled isolated states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  const texas = registry.getStateConfig('tx');
  const florida = registry.getStateConfig('fl');
  const california = registry.getStateConfig('ca');
  const newYork = registry.getStateConfig('ny');

  assert.equal(texas.code, 'TX');
  assert.equal(texas.jurisdiction, 'US-TX');
  assert.ok(texas.sources.length >= 51);
  assert.ok(texas.sources.every(source => source.country_code === 'US' && source.region_code === 'TX' && source.jurisdiction === 'US-TX'));

  assert.equal(florida.code, 'FL');
  assert.equal(florida.jurisdiction, 'US-FL');
  assert.ok(florida.sources.length >= 20);
  assert.ok(florida.sources.every(source => source.country_code === 'US' && source.region_code === 'FL' && source.jurisdiction === 'US-FL'));

  assert.equal(california.code, 'CA');
  assert.equal(california.jurisdiction, 'US-CA');
  assert.ok(california.sources.length >= 20);
  assert.ok(california.sources.every(source => source.country_code === 'US' && source.region_code === 'CA' && source.jurisdiction === 'US-CA'));

  assert.equal(newYork.code, 'NY');
  assert.equal(newYork.name, 'New York');
  assert.equal(newYork.jurisdiction, 'US-NY');
  assert.equal(newYork.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.ok(newYork.sources.length >= 12);
  assert.ok(newYork.sources.every(source => source.country_code === 'US' && source.region_code === 'NY' && source.jurisdiction === 'US-NY'));

  assert.deepEqual(states.map(state => state.code), ['TX', 'FL', 'CA', 'NY']);
});

test('US acquisition registry fails closed for unsupported states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  assert.throws(() => registry.getStateConfig('WA'), /Unsupported or disabled US acquisition state/);
  assert.throws(() => registry.getStateConfig(''), /Unsupported or disabled US acquisition state/);
});
