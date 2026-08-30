const test = require('node:test');
const assert = require('node:assert/strict');

test('US acquisition registry exposes enabled states as isolated shared-engine configs', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const states = registry.enabledStates();
  const codes = states.map(state => state.code);
  const sourceIds = [];

  assert.ok(states.length >= 14);
  for (const code of ['TX', 'FL', 'CA', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'VA', 'WA', 'MA', 'CO']) assert.ok(codes.includes(code));

  for (const state of states) {
    assert.equal(state.jurisdiction, `US-${state.code}`);
    assert.equal(state.snapshot_path, 'functions/_data/us-opportunities.mjs');
    assert.ok(state.sources.length > 0);
    assert.equal(new Set(state.sources.map(source => source.id)).size, state.sources.length);

    for (const source of state.sources) {
      sourceIds.push(source.id);
      assert.equal(source.country_code, 'US');
      assert.equal(source.region_code, state.code);
      assert.equal(source.jurisdiction, state.jurisdiction);
      assert.equal(source.status, 'approved-pilot');
      assert.ok(source.source_url);
      assert.ok(source.application_url);
      assert.ok(source.evidence);
      if (source.application_deadline) assert.match(source.application_deadline, /^\d{4}-\d{2}-\d{2}$/);
    }
  }

  assert.equal(new Set(sourceIds).size, sourceIds.length);
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

test('Colorado live-evidence corrections do not turn pricing or payment milestones into application deadlines', async () => {
  const registry = await import('../../cloudflare-texas-acquisition/src/us-state-registry.js');
  const colorado = registry.getStateConfig('CO');
  const wildcraft = colorado.sources.find(source => source.id === 'co-wildcraft-winter-market-2026');
  const giftShow = colorado.sources.find(source => source.id === 'co-country-christmas-gift-show-2026');

  assert.equal(wildcraft.event_start, '2026-11-07');
  assert.equal(wildcraft.application_deadline, undefined);
  assert.equal(wildcraft.application_url, 'https://www.wildcraftmarkets.com/vendors');
  assert.equal(giftShow.application_deadline, undefined);
  assert.equal(giftShow.application_url, 'https://www.coloradogiftshow.com/looking-to-exhibit/get-a-booth-quote');
});
