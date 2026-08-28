const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes Texas Florida and California as enabled isolated states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  const texas = registry.getStateConfig('tx');
  const florida = registry.getStateConfig('fl');
  const california = registry.getStateConfig('ca');

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

  assert.equal(california.code, 'CA');
  assert.equal(california.name, 'California');
  assert.equal(california.jurisdiction, 'US-CA');
  assert.equal(california.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.ok(california.sources.length >= 20);
  assert.ok(california.sources.every(source => source.country_code === 'US' && source.region_code === 'CA' && source.jurisdiction === 'US-CA'));

  assert.deepEqual(states.map(state => state.code), ['TX', 'FL', 'CA']);
});

test('US acquisition registry fails closed for unsupported states', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  assert.throws(() => registry.getStateConfig('NY'), /Unsupported or disabled US acquisition state/);
  assert.throws(() => registry.getStateConfig(''), /Unsupported or disabled US acquisition state/);
});
